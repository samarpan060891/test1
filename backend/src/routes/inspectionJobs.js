const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/inspection-jobs
 * Role-scoped: QA/Buying see all; Agency sees own jobs; Supplier sees own POs' jobs
 */
router.get('/', async (req, res) => {
  try {
    let query = `
      SELECT
        j.*,
        i.name AS item_name,
        i.category,
        i.sub_category,
        s.name AS supplier_name,
        a.name AS agency_name,
        p.quantity
      FROM inspection_jobs j
      JOIN item_master i ON i.item_code = j.item_code
      JOIN supplier_master s ON s.supplier_code = j.supplier_code
      JOIN quality_agency_master a ON a.agency_code = j.agency_code
      JOIN po_master p ON p.po_no = j.po_no
    `;
    const params = [];
    const conditions = [];

    if (req.user.role === 'agency_user') {
      params.push(req.user.agency_code);
      conditions.push(`j.agency_code = $${params.length}`);
    } else if (req.user.role === 'supplier_user') {
      params.push(req.user.supplier_code);
      conditions.push(`j.supplier_code = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY j.created_at DESC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get jobs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/inspection-jobs/:id
 * Returns job detail with scoping check.
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        j.*,
        i.name AS item_name,
        i.category,
        i.sub_category,
        s.name AS supplier_name,
        s.contact_email AS supplier_email,
        a.name AS agency_name,
        a.contact_emails AS agency_emails,
        p.quantity
      FROM inspection_jobs j
      JOIN item_master i ON i.item_code = j.item_code
      JOIN supplier_master s ON s.supplier_code = j.supplier_code
      JOIN quality_agency_master a ON a.agency_code = j.agency_code
      JOIN po_master p ON p.po_no = j.po_no
      WHERE j.job_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inspection job not found' });
    }

    const job = result.rows[0];

    // Scope check
    if (req.user.role === 'agency_user' && job.agency_code !== req.user.agency_code) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'supplier_user' && job.supplier_code !== req.user.supplier_code) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(job);
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inspection-jobs
 * Map a new inspection job. Roles: qa, buying.
 * Body: { po_no, agency_code, inspection_date }
 *
 * Business rule: Must have an active checklist template for item's category/sub_category.
 * If not, returns 422 with error code NO_ACTIVE_TEMPLATE (alert QA only).
 */
router.post('/', authorize('qa', 'buying'), async (req, res) => {
  const { po_no, agency_code, inspection_date } = req.body;

  if (!po_no || !agency_code || !inspection_date) {
    return res.status(400).json({ error: 'po_no, agency_code, and inspection_date are required' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Fetch PO and item details
    const poResult = await client.query(
      `SELECT p.*, i.category, i.sub_category, i.name AS item_name
       FROM po_master p
       JOIN item_master i ON i.item_code = p.item_code
       WHERE p.po_no = $1`,
      [po_no]
    );

    if (poResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `PO ${po_no} not found` });
    }

    const po = poResult.rows[0];

    if (po.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot map inspection for a cancelled PO' });
    }

    // Verify agency exists
    const agencyResult = await client.query(
      'SELECT * FROM quality_agency_master WHERE agency_code = $1',
      [agency_code]
    );
    if (agencyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Agency ${agency_code} not found` });
    }

    // BUSINESS RULE: Check for active checklist template for item's category/sub_category
    const templateResult = await client.query(
      `SELECT template_id FROM checklist_templates
       WHERE category = $1 AND sub_category = $2 AND status = 'active'
       ORDER BY version DESC LIMIT 1`,
      [po.category, po.sub_category]
    );

    if (templateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      // Return 422 with specific error code — QA alert only
      return res.status(422).json({
        error_code: 'NO_ACTIVE_TEMPLATE',
        error: `No active checklist template found for category '${po.category}' / sub_category '${po.sub_category}'. Please create and activate a checklist template before mapping.`,
        category: po.category,
        sub_category: po.sub_category,
      });
    }

    const templateId = templateResult.rows[0].template_id;

    // Create the inspection job
    const jobResult = await client.query(
      `INSERT INTO inspection_jobs
        (po_no, item_code, supplier_code, agency_code, checklist_template_id, status, inspection_date)
       VALUES ($1, $2, $3, $4, $5, 'mapped_awaiting_inspection', $6)
       RETURNING *`,
      [po_no, po.item_code, po.supplier_code, agency_code, templateId, inspection_date]
    );

    const job = jobResult.rows[0];

    // Create initial log entry
    await client.query(
      `INSERT INTO log_entries (po_no, item_code, job_id, author_role, author_email, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        po_no,
        po.item_code,
        job.job_id,
        req.user.role,
        req.user.email,
        `Inspection job mapped. Agency: ${agency_code}. Inspection date: ${inspection_date}.`,
      ]
    );

    await client.query('COMMIT');

    // Fire-and-forget notifications
    sendNotification(job.job_id, 'JOB_MAPPED', 'agency_user', agencyResult.rows[0].contact_emails);
    sendNotification(job.job_id, 'JOB_MAPPED', 'supplier_user', [po.contact_email]);

    res.status(201).json(job);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Map job error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/inspection-jobs/:id/submit
 * Agency submits the filled inspection.
 * Transitions: mapped_awaiting_inspection → submitted_pending_qa
 */
router.put('/:id/submit', authorize('agency_user'), async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const jobResult = await client.query(
      'SELECT * FROM inspection_jobs WHERE job_id = $1',
      [req.params.id]
    );

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    // Scope check
    if (job.agency_code !== req.user.agency_code) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied' });
    }

    if (job.status !== 'mapped_awaiting_inspection') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot submit job in status: ${job.status}` });
    }

    // Check all checklist items have responses
    const totalItems = await client.query(
      'SELECT COUNT(*) AS cnt FROM checklist_items WHERE template_id = $1',
      [job.checklist_template_id]
    );
    const totalResponses = await client.query(
      'SELECT COUNT(*) AS cnt FROM inspection_responses WHERE job_id = $1',
      [req.params.id]
    );

    if (parseInt(totalResponses.rows[0].cnt) < parseInt(totalItems.rows[0].cnt)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `All checklist items must be answered. ${totalResponses.rows[0].cnt} of ${totalItems.rows[0].cnt} completed.`,
      });
    }

    const updated = await client.query(
      `UPDATE inspection_jobs SET status = 'submitted_pending_qa', updated_at = NOW()
       WHERE job_id = $1 RETURNING *`,
      [req.params.id]
    );

    await client.query(
      `INSERT INTO log_entries (po_no, item_code, job_id, author_role, author_email, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [job.po_no, job.item_code, job.job_id, req.user.role, req.user.email,
        'Inspection checklist submitted for QA review.']
    );

    await client.query('COMMIT');

    // Notify QA team
    const qaUsers = await db.query(
      "SELECT email FROM team_stakeholders WHERE role = 'qa'"
    );
    sendNotification(job.job_id, 'SUBMITTED_FOR_QA', 'qa', qaUsers.rows.map(u => u.email));

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit job error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/inspection-jobs/:id/decision
 * QA makes final decision.
 * Transitions: submitted_pending_qa → qa_approved | qa_rejected
 * Body: { outcome: 'approved'|'rejected', remarks }
 */
router.put('/:id/decision', authorize('qa'), async (req, res) => {
  const { outcome, remarks } = req.body;

  if (!outcome || !['approved', 'rejected'].includes(outcome)) {
    return res.status(400).json({ error: 'outcome must be "approved" or "rejected"' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const jobResult = await client.query(
      'SELECT * FROM inspection_jobs WHERE job_id = $1',
      [req.params.id]
    );

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    if (job.status !== 'submitted_pending_qa') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot make decision on job in status: ${job.status}` });
    }

    const newStatus = outcome === 'approved' ? 'qa_approved' : 'qa_rejected';

    const updated = await client.query(
      `UPDATE inspection_jobs
       SET status = $1, final_outcome = $2, qa_remarks = $3, updated_at = NOW()
       WHERE job_id = $4 RETURNING *`,
      [newStatus, outcome, remarks || null, req.params.id]
    );

    await client.query(
      `INSERT INTO log_entries (po_no, item_code, job_id, author_role, author_email, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        job.po_no,
        job.item_code,
        job.job_id,
        req.user.role,
        req.user.email,
        `QA decision: ${outcome.toUpperCase()}. ${remarks ? 'Remarks: ' + remarks : ''}`,
      ]
    );

    await client.query('COMMIT');

    // Notify agency and supplier
    const agencyEmails = await db.query(
      'SELECT contact_emails FROM quality_agency_master WHERE agency_code = $1',
      [job.agency_code]
    );
    const supplierEmail = await db.query(
      'SELECT contact_email FROM supplier_master WHERE supplier_code = $1',
      [job.supplier_code]
    );

    const eventType = outcome === 'approved' ? 'QA_APPROVED' : 'QA_REJECTED';
    sendNotification(job.job_id, eventType, 'agency_user', agencyEmails.rows[0]?.contact_emails || []);
    sendNotification(job.job_id, eventType, 'supplier_user', [supplierEmail.rows[0]?.contact_email]);

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Decision error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
