const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const router = express.Router();
router.use(authenticate);

async function getJobStakeholders(jobId) {
  const r = await db.query(
    `SELECT
       j.job_id, j.job_ref, j.po_no, j.agency_code, j.supplier_code,
       a.contact_emails AS agency_emails,
       s.contact_email AS supplier_email
     FROM qc_inspection.inspection_job j
     LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
     LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
     WHERE j.job_id = $1`,
    [jobId]
  );
  const job = r.rows[0];
  if (!job) return null;

  const qaUsers = await db.query(
    "SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'qa' AND email IS NOT NULL"
  );
  return {
    jobRef: job.job_ref,
    poNo: job.po_no,
    agencyEmails: job.agency_emails || [],
    supplierEmail: job.supplier_email ? [job.supplier_email] : [],
    qaEmails: qaUsers.rows.map(u => u.email),
  };
}

// Fetch items for a job from job_items table
async function getJobItemsFor(jobId, client_or_db = db) {
  const r = await client_or_db.query(
    `SELECT ji.item_code, ji.checklist_template_id, ji.sort_order,
            im.name AS item_name, im.category, im.sub_category,
            COALESCE(pl.quantity, p.quantity) AS quantity
     FROM qc_inspection.job_items ji
     JOIN qc_inspection.item_master im ON im.item_code = ji.item_code
     JOIN qc_inspection.inspection_job ij ON ij.job_id = ji.job_id
     JOIN qc_inspection.po_master p ON p.po_no = ij.po_no
     LEFT JOIN qc_inspection.po_line_items pl ON pl.po_no = ij.po_no AND pl.item_code = ji.item_code
     WHERE ji.job_id = $1
     ORDER BY ji.sort_order, ji.item_code`,
    [jobId]
  );
  return r.rows;
}

/**
 * GET /api/inspection-jobs
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
        s.country AS supplier_country,
        a.name AS agency_name,
        ac.contract_name,
        ac.rate_type AS contract_rate_type,
        ac.rate_value AS contract_rate_value,
        ac.currency AS contract_currency,
        COALESCE((
          SELECT SUM(pl.quantity * pl.unit_price)
          FROM qc_inspection.job_items ji2
          JOIN qc_inspection.po_line_items pl ON pl.po_no = j.po_no AND pl.item_code = ji2.item_code
          WHERE ji2.job_id = j.job_id
        ), p.quantity * p.unit_price, 0) AS po_value,
        (
          SELECT ca.status
          FROM qc_inspection.inspection_charges_advice ca
          JOIN qc_inspection.ica_jobs ij ON ij.advice_id = ca.advice_id
          WHERE ij.job_id = j.job_id
          ORDER BY ca.created_at DESC
          LIMIT 1
        ) AS payment_status,
        (
          SELECT ca.created_at
          FROM qc_inspection.inspection_charges_advice ca
          JOIN qc_inspection.ica_jobs ij ON ij.advice_id = ca.advice_id
          WHERE ij.job_id = j.job_id
          ORDER BY ca.created_at ASC
          LIMIT 1
        ) AS advice_created_at,
        (
          SELECT ca.qa_approved_at
          FROM qc_inspection.inspection_charges_advice ca
          JOIN qc_inspection.ica_jobs ij ON ij.advice_id = ca.advice_id
          WHERE ij.job_id = j.job_id
          ORDER BY ca.created_at DESC
          LIMIT 1
        ) AS advice_qa_approved_at,
        (
          SELECT ca.buying_approved_at
          FROM qc_inspection.inspection_charges_advice ca
          JOIN qc_inspection.ica_jobs ij ON ij.advice_id = ca.advice_id
          WHERE ij.job_id = j.job_id
          ORDER BY ca.created_at DESC
          LIMIT 1
        ) AS buying_approved_at,
        (
          SELECT ca.imports_approved_at
          FROM qc_inspection.inspection_charges_advice ca
          JOIN qc_inspection.ica_jobs ij ON ij.advice_id = ca.advice_id
          WHERE ij.job_id = j.job_id
          ORDER BY ca.created_at DESC
          LIMIT 1
        ) AS imports_approved_at
      FROM qc_inspection.inspection_job j
      JOIN qc_inspection.item_master i ON i.item_code = j.item_code
      JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
      LEFT JOIN qc_inspection.agency_contract ac ON ac.contract_id = j.contract_id
      JOIN qc_inspection.po_master p ON p.po_no = j.po_no
    `;
    const params = [];
    const conditions = [];

    if (['qa', 'admin'].includes(req.user.role)) {
      // see all
    } else if (req.user.role === 'buying') {
      params.push(req.user.user_id);
      conditions.push(`p.buyer_id = $${params.length}`);
    } else if (req.user.role === 'agency_user') {
      params.push(req.user.agency_code);
      conditions.push(`j.agency_code = $${params.length}`);
    } else if (req.user.role === 'supplier_user') {
      params.push(req.user.supplier_code);
      conditions.push(`j.supplier_code = $${params.length}`);
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
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
      FROM qc_inspection.inspection_job j
      JOIN qc_inspection.item_master i ON i.item_code = j.item_code
      JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
      JOIN qc_inspection.po_master p ON p.po_no = j.po_no
      WHERE j.job_id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inspection job not found' });
    }

    const job = result.rows[0];

    if (req.user.role === 'agency_user' && job.agency_code !== req.user.agency_code) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'supplier_user' && job.supplier_code !== req.user.supplier_code) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [childResult, jobItems] = await Promise.all([
      db.query(
        `SELECT j.job_id, j.job_ref, j.status, j.inspection_date, j.mapped_at,
                creator.name AS triggered_by_name, creator.role AS triggered_by_role
         FROM qc_inspection.inspection_job j
         LEFT JOIN qc_inspection.team_stakeholder creator ON creator.user_id = j.mapped_by
         WHERE j.parent_job_id = $1
         ORDER BY j.mapped_at DESC LIMIT 1`,
        [req.params.id]
      ),
      getJobItemsFor(req.params.id),
    ]);

    job.reinspection_job = childResult.rows[0] || null;
    job.items = jobItems;

    res.json(job);
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inspection-jobs
 * Map new inspection with one or more items from a PO.
 * Body: { po_no, agency_code?, contract_id?, inspection_date, inspection_type, inspection_stages, item_codes? }
 */
const VALID_STAGES = ['pre_production', 'inline', 'final', 'loading'];

router.post('/', authorize('qa', 'buying'), async (req, res) => {
  const { po_no, agency_code, contract_id, inspection_date, inspection_type = 'agency', inspection_stages, item_codes } = req.body;

  if (!['agency', 'self'].includes(inspection_type)) {
    return res.status(400).json({ error: 'inspection_type must be "agency" or "self"' });
  }
  if (!po_no || !inspection_date) {
    return res.status(400).json({ error: 'po_no and inspection_date are required' });
  }
  if (inspection_type === 'agency' && !agency_code) {
    return res.status(400).json({ error: 'agency_code is required for agency inspection' });
  }

  const stages = (inspection_stages && inspection_stages.length > 0) ? inspection_stages : ['final'];
  const invalidStages = stages.filter(s => !VALID_STAGES.includes(s));
  if (invalidStages.length > 0) {
    return res.status(400).json({ error: `Invalid stages: ${invalidStages.join(', ')}` });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Load PO header
    const poResult = await client.query(
      `SELECT p.*, s.name AS supplier_name, s.contact_email AS supplier_contact_email
       FROM qc_inspection.po_master p
       JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
       WHERE p.po_no = $1`,
      [po_no]
    );
    if (poResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: `PO ${po_no} not found` }); }

    const po = poResult.rows[0];
    if (po.status === 'cancelled') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot map inspection for a cancelled PO' }); }

    // Determine which items to inspect
    let selectedCodes = Array.isArray(item_codes) && item_codes.length > 0 ? item_codes : null;

    // Load items from po_line_items (fall back to po_master.item_code for legacy POs)
    let lineItemsResult;
    if (selectedCodes) {
      lineItemsResult = await client.query(
        `SELECT pl.item_code, pl.quantity, pl.unit_price, pl.line_no,
                im.name AS item_name, im.category, im.sub_category
         FROM qc_inspection.po_line_items pl
         JOIN qc_inspection.item_master im ON im.item_code = pl.item_code
         WHERE pl.po_no = $1 AND pl.item_code = ANY($2::text[])
         ORDER BY pl.line_no, pl.item_code`,
        [po_no, selectedCodes]
      );
    } else {
      lineItemsResult = await client.query(
        `SELECT pl.item_code, pl.quantity, pl.unit_price, pl.line_no,
                im.name AS item_name, im.category, im.sub_category
         FROM qc_inspection.po_line_items pl
         JOIN qc_inspection.item_master im ON im.item_code = pl.item_code
         WHERE pl.po_no = $1
         ORDER BY pl.line_no, pl.item_code`,
        [po_no]
      );
      // Legacy fallback if po_line_items is empty
      if (lineItemsResult.rows.length === 0 && po.item_code) {
        lineItemsResult = await client.query(
          `SELECT $1::text AS item_code, $2::numeric AS quantity, $3::numeric AS unit_price, 1 AS line_no,
                  im.name AS item_name, im.category, im.sub_category
           FROM qc_inspection.item_master im WHERE im.item_code = $1`,
          [po.item_code, po.quantity, po.unit_price]
        );
      }
    }

    if (lineItemsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No items found for this PO. Please add line items first.' });
    }

    // Find checklist template for each item
    const itemsWithTemplates = [];
    for (const item of lineItemsResult.rows) {
      const templateResult = await client.query(
        `SELECT template_id FROM qc_inspection.checklist_template
         WHERE category = $1 AND sub_category = $2 AND status = 'active'
         ORDER BY version DESC LIMIT 1`,
        [item.category, item.sub_category]
      );
      if (templateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          error_code: 'NO_ACTIVE_TEMPLATE',
          error: `No active checklist template found for item '${item.item_name}' (${item.category} / ${item.sub_category}).`,
          item_code: item.item_code,
          category: item.category,
          sub_category: item.sub_category,
        });
      }
      itemsWithTemplates.push({ ...item, checklist_template_id: templateResult.rows[0].template_id });
    }

    let agencyResult = { rows: [{}] };
    if (inspection_type === 'agency') {
      agencyResult = await client.query(
        'SELECT * FROM qc_inspection.quality_agency_master WHERE agency_code = $1',
        [agency_code]
      );
      if (agencyResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: `Agency ${agency_code} not found` }); }
    }

    const primaryItem = itemsWithTemplates[0];
    const createdJobs = [];

    for (const stage of stages) {
      const jobResult = await client.query(
        `INSERT INTO qc_inspection.inspection_job
          (po_no, item_code, supplier_code, agency_code, contract_id, checklist_template_id, status, inspection_date, inspection_type, inspection_stage)
         VALUES ($1, $2, $3, $4, $5, $6, 'mapped_awaiting_inspection', $7, $8, $9)
         RETURNING *`,
        [po_no, primaryItem.item_code, po.supplier_code, agency_code || null, contract_id || null, primaryItem.checklist_template_id, inspection_date, inspection_type, stage]
      );
      const job = jobResult.rows[0];
      createdJobs.push(job);

      // Insert job_items for all selected items
      for (let i = 0; i < itemsWithTemplates.length; i++) {
        const item = itemsWithTemplates[i];
        await client.query(
          `INSERT INTO qc_inspection.job_items (job_id, item_code, checklist_template_id, sort_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (job_id, item_code) DO NOTHING`,
          [job.job_id, item.item_code, item.checklist_template_id, i]
        );
      }

      const itemSummary = itemsWithTemplates.map(i => i.item_name).join(', ');
      await client.query(
        `INSERT INTO qc_inspection.log_entry (po_no, job_id, author_id, author_role, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [po_no, job.job_id, req.user.user_id, req.user.role,
         `Inspection job mapped. Stage: ${stage}. Items: ${itemSummary}. Agency: ${agency_code || 'self'}. Date: ${inspection_date}.`]
      );
    }

    await client.query('COMMIT');

    const firstJobId = createdJobs[0].job_id;
    const buyerResult = await db.query(
      `SELECT b.user_id AS buyer_id, b.email AS buyer_email
       FROM qc_inspection.po_master p
       JOIN qc_inspection.team_stakeholder b ON b.user_id = p.buyer_id
       WHERE p.po_no = $1`, [po_no]
    );
    const poBuyer = buyerResult.rows[0] || null;

    const stakeMap = {};
    if (inspection_type === 'agency') stakeMap['agency_user'] = agencyResult.rows[0].contact_emails || [];
    stakeMap['supplier_user'] = [po.supplier_contact_email];

    const stagesSummary = stages.length > 1
      ? `${stages.length} stages (${stages.map(s => s.replace('_', ' ')).join(', ')})`
      : stages[0].replace('_', ' ') + ' stage';
    const itemsLabel = itemsWithTemplates.map(i => i.item_name).join(', ');
    const msg = JSON.stringify({
      key: 'JOB_MAPPED_EXTERNAL',
      job_ref: createdJobs[0].job_ref || null,
      po_no,
      item_name: itemsLabel,
      supplier_name: po.supplier_name,
      agency_name: inspection_type === 'agency' ? (agencyResult.rows[0].name || agency_code) : null,
      stages: stagesSummary,
      inspection_date,
    });
    for (const [role, emails] of Object.entries(stakeMap)) {
      const roleAgencyCode = role === 'agency_user' ? agency_code : null;
      const roleSupplierCode = role === 'supplier_user' ? po.supplier_code : null;
      sendNotification(firstJobId, 'JOB_MAPPED', role, emails, msg, null, roleAgencyCode, roleSupplierCode);
    }
    if (poBuyer) {
      sendNotification(firstJobId, 'JOB_MAPPED', 'buying', [poBuyer.buyer_email], msg, null, null, null, poBuyer.buyer_id);
    }

    res.status(201).json(stages.length === 1 ? createdJobs[0] : { jobs: createdJobs, count: createdJobs.length });
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
 * Agency submits checklist. Validates responses across ALL items in the job.
 */
router.put('/:id/submit', authorize('agency_user', 'supplier_user'), async (req, res) => {
  const { actual_inspection_date } = req.body;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const jobResult = await client.query('SELECT * FROM qc_inspection.inspection_job WHERE job_id = $1', [req.params.id]);
    if (jobResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Job not found' }); }

    const job = jobResult.rows[0];

    if (req.user.role === 'agency_user' && job.agency_code !== req.user.agency_code) {
      await client.query('ROLLBACK'); return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'supplier_user') {
      if (job.inspection_type !== 'self' || job.supplier_code !== req.user.supplier_code) {
        await client.query('ROLLBACK'); return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (job.status !== 'mapped_awaiting_inspection') {
      await client.query('ROLLBACK'); return res.status(400).json({ error: `Cannot submit job in status: ${job.status}` });
    }

    // Count total checklist items across ALL templates for this job's items
    const totalItemsResult = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM qc_inspection.checklist_item ci
       WHERE ci.template_id IN (
         SELECT checklist_template_id FROM qc_inspection.job_items WHERE job_id = $1
       )`,
      [req.params.id]
    );
    // Fallback for legacy jobs without job_items
    const totalFromJobItems = parseInt(totalItemsResult.rows[0].cnt);
    let expectedCount = totalFromJobItems;
    if (expectedCount === 0) {
      const legacyCount = await client.query(
        'SELECT COUNT(*) AS cnt FROM qc_inspection.checklist_item WHERE template_id = $1',
        [job.checklist_template_id]
      );
      expectedCount = parseInt(legacyCount.rows[0].cnt);
    }

    const totalResponses = await client.query(
      'SELECT COUNT(*) AS cnt FROM qc_inspection.inspection_response WHERE job_id = $1',
      [req.params.id]
    );

    if (parseInt(totalResponses.rows[0].cnt) < expectedCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `All checklist items must be answered. ${totalResponses.rows[0].cnt} of ${expectedCount} completed.`,
      });
    }

    const updated = await client.query(
      `UPDATE qc_inspection.inspection_job
       SET status = 'submitted_pending_qa', submitted_at = NOW(),
           status_updated_at = NOW(),
           actual_inspection_date = COALESCE($2::date, CURRENT_DATE)
       WHERE job_id = $1 RETURNING *`,
      [req.params.id, actual_inspection_date || null]
    );

    await client.query(
      `INSERT INTO qc_inspection.log_entry (po_no, job_id, author_id, author_role, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [job.po_no, job.job_id, req.user.user_id, req.user.role, 'Inspection checklist submitted for QA review.']
    );

    await client.query('COMMIT');

    const jobItems = await getJobItemsFor(job.job_id);
    const itemsLabel = jobItems.map(i => i.item_name).join(', ') || job.item_code;

    const jobDetail = await db.query(
      `SELECT j.job_ref, j.inspection_date, s.name AS supplier_name, a.name AS agency_name
       FROM qc_inspection.inspection_job j
       JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
       LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
       WHERE j.job_id = $1`, [job.job_id]
    );
    const jd = jobDetail.rows[0] || {};

    const failedResult = await db.query(
      `SELECT ci.section, ci.checkpoint_text, ci.criticality, r.remark
       FROM qc_inspection.inspection_response r
       JOIN qc_inspection.checklist_item ci ON ci.item_id = r.checklist_item_id
       WHERE r.job_id = $1 AND r.result = 'fail'
       ORDER BY ci.sort_order`, [job.job_id]
    );

    const msg = JSON.stringify({
      job_ref: jd.job_ref || null,
      job_id: job.job_id,
      po_no: job.po_no,
      item_name: itemsLabel,
      supplier_name: jd.supplier_name,
      agency_name: jd.agency_name || null,
      inspection_date: jd.inspection_date,
      failed_checkpoints: failedResult.rows,
    });
    const qaUsers = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'qa'");
    const buyingUsers = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'buying'");
    sendNotification(job.job_id, 'SUBMITTED_FOR_QA', 'qa', qaUsers.rows.map(u => u.email), msg);
    sendNotification(job.job_id, 'SUBMITTED_FOR_QA', 'buying', buyingUsers.rows.map(u => u.email), msg);

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
 */
router.put('/:id/decision', authorize('qa'), async (req, res) => {
  const { outcome, remarks } = req.body;

  if (!outcome || !['approved', 'rejected'].includes(outcome)) {
    return res.status(400).json({ error: 'outcome must be "approved" or "rejected"' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const jobResult = await client.query('SELECT * FROM qc_inspection.inspection_job WHERE job_id = $1', [req.params.id]);
    if (jobResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Job not found' }); }

    const job = jobResult.rows[0];

    if (!['submitted_pending_qa', 'deviation_reviewed'].includes(job.status)) {
      await client.query('ROLLBACK'); return res.status(400).json({ error: `Cannot make decision on job in status: ${job.status}` });
    }

    const newStatus = outcome === 'approved' ? 'qa_approved' : 'qa_rejected';

    const updated = await client.query(
      `UPDATE qc_inspection.inspection_job
       SET status = $1, final_outcome = $2, qa_notes = $3, decided_at = NOW(),
           status_updated_at = NOW()
       WHERE job_id = $4 RETURNING *`,
      [newStatus, outcome, remarks || null, req.params.id]
    );

    await client.query(
      `INSERT INTO qc_inspection.log_entry (po_no, job_id, author_id, author_role, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [job.po_no, job.job_id, req.user.user_id, req.user.role,
       `QA decision: ${outcome.toUpperCase()}. ${remarks ? 'Remarks: ' + remarks : ''}`]
    );

    await client.query('COMMIT');

    const eventType = outcome === 'approved' ? 'QA_APPROVED' : 'QA_REJECTED';
    const jobItems = await getJobItemsFor(job.job_id);
    const itemsLabel = jobItems.map(i => i.item_name).join(', ') || job.item_code;

    const jobDetail2 = await db.query(
      `SELECT j.job_ref, s.name AS supplier_name, a.name AS agency_name
       FROM qc_inspection.inspection_job j
       JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
       LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
       WHERE j.job_id = $1`, [job.job_id]
    );
    const jd2 = jobDetail2.rows[0] || {};
    const msg = JSON.stringify({
      job_ref: jd2.job_ref || null,
      job_id: job.job_id,
      po_no: job.po_no,
      item_name: itemsLabel,
      supplier_name: jd2.supplier_name,
      agency_name: jd2.agency_name || null,
      reviewer_name: req.user.name || req.user.email,
      remarks: remarks || '',
    });

    const agencyEmails = await db.query('SELECT contact_emails FROM qc_inspection.quality_agency_master WHERE agency_code = $1', [job.agency_code]);
    const supplierEmail = await db.query('SELECT contact_email FROM qc_inspection.supplier_master WHERE supplier_code = $1', [job.supplier_code]);
    const buyingUsers = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'buying'");

    sendNotification(job.job_id, eventType, 'agency_user', agencyEmails.rows[0]?.contact_emails || [], msg, null, job.agency_code);
    sendNotification(job.job_id, eventType, 'supplier_user', [supplierEmail.rows[0]?.contact_email], msg, null, null, job.supplier_code);
    sendNotification(job.job_id, eventType, 'buying', buyingUsers.rows.map(u => u.email), msg);

    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Decision error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Helper: job context with PO buyer + supplier/agency labels for notifications
async function loadJobContext(jobId) {
  const { rows } = await db.query(
    `SELECT j.*, s.name AS supplier_name, a.name AS agency_name,
            p.buyer_id AS po_buyer_id, b.email AS po_buyer_email, b.name AS po_buyer_name
     FROM qc_inspection.inspection_job j
     JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
     LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
     JOIN qc_inspection.po_master p ON p.po_no = j.po_no
     LEFT JOIN qc_inspection.team_stakeholder b ON b.user_id = p.buyer_id
     WHERE j.job_id = $1`, [jobId]
  );
  return rows[0] || null;
}

/**
 * POST /api/inspection-jobs/:id/request-deviation — QA asks Buying for a deviation
 */
router.post('/:id/request-deviation', authorize('qa'), async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim())
    return res.status(400).json({ error: 'A deviation reason is required' });

  try {
    const job = await loadJobContext(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'submitted_pending_qa')
      return res.status(400).json({ error: `Deviation can only be requested while the job is pending QA review. Current status: ${job.status}` });

    const { rows: updated } = await db.query(
      `UPDATE qc_inspection.inspection_job
       SET status = 'deviation_requested', deviation_reason = $1,
           deviation_requested_by = $2, deviation_requested_at = NOW(), status_updated_at = NOW()
       WHERE job_id = $3 RETURNING *`,
      [reason.trim(), req.user.user_id, req.params.id]
    );

    await db.query(
      `INSERT INTO qc_inspection.log_entry (po_no, job_id, author_id, author_role, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [job.po_no, job.job_id, req.user.user_id, req.user.role,
       `Deviation requested from Buying. Reason: ${reason.trim()}`]
    );

    const jobItems = await getJobItemsFor(job.job_id);
    const itemsLabel = jobItems.map(i => i.item_name).join(', ') || job.item_code;
    const extraMsg = JSON.stringify({
      job_id: job.job_id,
      job_ref: job.job_ref || null,
      po_no: job.po_no,
      item_name: itemsLabel,
      supplier_name: job.supplier_name,
      agency_name: job.agency_name || null,
      requester_name: req.user.name || req.user.email,
      reason: reason.trim(),
    });

    if (job.po_buyer_id && job.po_buyer_email) {
      sendNotification(job.job_id, 'JOB_DEVIATION_REQUESTED', 'buying', [job.po_buyer_email], extraMsg, null, null, null, job.po_buyer_id);
    } else {
      const { rows: admins } = await db.query(`SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'admin'`);
      sendNotification(job.job_id, 'JOB_DEVIATION_NO_BUYER', 'admin', admins.map(a => a.email).filter(Boolean), extraMsg);
    }

    res.json(updated[0]);
  } catch (err) {
    console.error('Request deviation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inspection-jobs/:id/buyer-deviation — Buying approves/rejects the deviation
 */
router.post('/:id/buyer-deviation', authorize('buying'), async (req, res) => {
  const { action, remarks } = req.body;
  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ error: 'action must be approve or reject' });

  try {
    const job = await loadJobContext(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'deviation_requested')
      return res.status(400).json({ error: 'No pending deviation request for this job' });

    const decision = action === 'approve' ? 'approved' : 'rejected';
    const { rows: updated } = await db.query(
      `UPDATE qc_inspection.inspection_job
       SET status = 'deviation_reviewed', buyer_decision = $1,
           buyer_reviewer_id = $2, buyer_remarks = $3, buyer_decided_at = NOW(), status_updated_at = NOW()
       WHERE job_id = $4 RETURNING *`,
      [decision, req.user.user_id, remarks || null, req.params.id]
    );

    await db.query(
      `INSERT INTO qc_inspection.log_entry (po_no, job_id, author_id, author_role, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [job.po_no, job.job_id, req.user.user_id, req.user.role,
       `Deviation ${decision} by Buying.${remarks ? ' Remarks: ' + remarks : ''}`]
    );

    const jobItems = await getJobItemsFor(job.job_id);
    const itemsLabel = jobItems.map(i => i.item_name).join(', ') || job.item_code;
    const eventType = action === 'approve' ? 'JOB_DEVIATION_APPROVED' : 'JOB_DEVIATION_REJECTED';
    const extraMsg = JSON.stringify({
      job_id: job.job_id,
      job_ref: job.job_ref || null,
      po_no: job.po_no,
      item_name: itemsLabel,
      supplier_name: job.supplier_name,
      agency_name: job.agency_name || null,
      buyer_name: req.user.name || req.user.email,
      deviation_reason: job.deviation_reason,
      remarks: remarks || null,
    });

    const qaUsers = await db.query(`SELECT email FROM qc_inspection.team_stakeholder WHERE role IN ('qa', 'admin')`);
    sendNotification(job.job_id, eventType, 'qa', qaUsers.rows.map(u => u.email).filter(Boolean), extraMsg);

    res.json(updated[0]);
  } catch (err) {
    console.error('Buyer deviation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inspection-jobs/:id/reinspect
 */
router.post('/:id/reinspect', authorize('qa', 'buying'), async (req, res) => {
  const { agency_code, inspection_date, inspection_type = 'agency' } = req.body;

  if (!inspection_date) return res.status(400).json({ error: 'inspection_date is required' });
  if (inspection_type === 'agency' && !agency_code) return res.status(400).json({ error: 'agency_code is required for agency inspection' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const parentResult = await client.query('SELECT * FROM qc_inspection.inspection_job WHERE job_id = $1', [req.params.id]);
    if (parentResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Job not found' }); }

    const parent = parentResult.rows[0];

    if (parent.status !== 'qa_rejected') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Re-inspection only allowed on rejected jobs. Current status: ${parent.status}` });
    }

    if (inspection_type === 'agency') {
      const agencyResult = await client.query('SELECT * FROM qc_inspection.quality_agency_master WHERE agency_code = $1', [agency_code]);
      if (agencyResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: `Agency ${agency_code} not found` }); }
    }

    // Copy parent job_items
    const parentItems = await client.query(
      'SELECT item_code, checklist_template_id, sort_order FROM qc_inspection.job_items WHERE job_id = $1 ORDER BY sort_order',
      [req.params.id]
    );

    const newJobResult = await client.query(
      `INSERT INTO qc_inspection.inspection_job
        (po_no, item_code, supplier_code, agency_code, checklist_template_id, status, inspection_date, inspection_type, parent_job_id)
       VALUES ($1, $2, $3, $4, $5, 'mapped_awaiting_inspection', $6, $7, $8)
       RETURNING *`,
      [parent.po_no, parent.item_code, parent.supplier_code,
       agency_code || null, parent.checklist_template_id,
       inspection_date, inspection_type, parent.job_id]
    );

    const newJob = newJobResult.rows[0];

    // Copy job_items from parent
    for (const item of parentItems.rows) {
      await client.query(
        `INSERT INTO qc_inspection.job_items (job_id, item_code, checklist_template_id, sort_order)
         VALUES ($1, $2, $3, $4) ON CONFLICT (job_id, item_code) DO NOTHING`,
        [newJob.job_id, item.item_code, item.checklist_template_id, item.sort_order]
      );
    }

    await client.query(
      `INSERT INTO qc_inspection.log_entry (po_no, job_id, author_id, author_role, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [newJob.po_no, newJob.job_id, req.user.user_id, req.user.role,
       `Re-inspection job created following rejection of job ${parent.job_id.slice(0, 8)}. Agency: ${agency_code || 'Self'}. Date: ${inspection_date}.`]
    );

    await client.query('COMMIT');

    const reinspectDetail = await db.query(
      `SELECT j.job_ref, s.name AS supplier_name, a.name AS agency_name
       FROM qc_inspection.inspection_job j
       JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
       LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
       WHERE j.job_id = $1`, [newJob.job_id]
    );
    const rd = reinspectDetail.rows[0] || {};
    const jobItems = await getJobItemsFor(newJob.job_id);
    const itemsLabel = jobItems.map(i => i.item_name).join(', ') || parent.item_code;

    const msg = JSON.stringify({
      job_ref: rd.job_ref || null,
      job_id: newJob.job_id,
      po_no: parent.po_no,
      item_name: itemsLabel,
      supplier_name: rd.supplier_name,
      agency_name: rd.agency_name || null,
      inspection_date,
      triggered_by: req.user.name || req.user.email,
    });
    const agencyEmails = await db.query('SELECT contact_emails FROM qc_inspection.quality_agency_master WHERE agency_code = $1', [agency_code || parent.agency_code]);
    const supplierEmail = await db.query('SELECT contact_email FROM qc_inspection.supplier_master WHERE supplier_code = $1', [parent.supplier_code]);
    const buyingUsers = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'buying'");

    if (agency_code) sendNotification(newJob.job_id, 'REINSPECTION_TRIGGERED', 'agency_user', agencyEmails.rows[0]?.contact_emails || [], msg, null, agency_code || parent.agency_code);
    sendNotification(newJob.job_id, 'REINSPECTION_TRIGGERED', 'supplier_user', [supplierEmail.rows[0]?.contact_email], msg, null, null, parent.supplier_code);
    sendNotification(newJob.job_id, 'REINSPECTION_TRIGGERED', 'buying', buyingUsers.rows.map(u => u.email), msg);

    res.status(201).json(newJob);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Re-inspect error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
