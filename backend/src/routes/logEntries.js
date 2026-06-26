const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/log-entries
 * Query params: ?job_id=&po_no=&limit=&offset=
 * All 4 roles can read; scoped by their job/PO access.
 */
router.get('/', async (req, res) => {
  const { job_id, po_no, limit = 50, offset = 0 } = req.query;

  try {
    let query = `
      SELECT l.*, j.job_ref
      FROM qc_inspection.log_entry l
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = l.job_id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role === 'agency_user') {
      params.push(req.user.agency_code);
      conditions.push(`(j.agency_code = $${params.length} OR l.job_id IS NULL)`);
    } else if (req.user.role === 'supplier_user') {
      params.push(req.user.supplier_code);
      conditions.push(`(j.supplier_code = $${params.length} OR l.job_id IS NULL)`);
    }

    if (job_id) {
      // Accept either a UUID job_id or a job_ref like JOB-2026-001
      params.push(job_id);
      conditions.push(`(l.job_id::text = $${params.length} OR j.job_ref ILIKE $${params.length})`);
    }

    if (po_no) {
      params.push(po_no);
      conditions.push(`l.po_no = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY l.created_at DESC';

    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;

    params.push(parseInt(offset));
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get log entries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/log-entries
 * Any authenticated user can post a remark on a job/PO they have access to.
 * Body: { job_id?, po_no?, message }
 */
router.post('/', async (req, res) => {
  const { job_id, po_no, message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!job_id && !po_no) {
    return res.status(400).json({ error: 'At least one of job_id or po_no is required' });
  }

  try {
    let itemCode = null;
    let resolvedPoNo = po_no;

    if (job_id) {
      // Verify job access
      const jobResult = await db.query(
        'SELECT * FROM qc_inspection.inspection_job WHERE job_id = $1',
        [job_id]
      );

      if (jobResult.rows.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = jobResult.rows[0];

      if (req.user.role === 'agency_user' && job.agency_code !== req.user.agency_code) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (req.user.role === 'supplier_user' && job.supplier_code !== req.user.supplier_code) {
        return res.status(403).json({ error: 'Access denied' });
      }

      resolvedPoNo = resolvedPoNo || job.po_no;
      itemCode = job.item_code;
    }

    if (po_no && !itemCode) {
      const poResult = await db.query('SELECT item_code FROM qc_inspection.po_master WHERE po_no = $1', [po_no]);
      if (poResult.rows.length > 0) {
        itemCode = poResult.rows[0].item_code;
      }
    }

    const result = await db.query(
      `INSERT INTO qc_inspection.log_entry (po_no, job_id, author_id, author_role, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [resolvedPoNo, job_id || null, req.user.user_id, req.user.role, message.trim()]
    );

    // Notify all other stakeholders on this job that a remark was posted
    if (job_id) {
      const posterRole = req.user.role;
      const posterLabel = { qa: 'QA', buying: 'Buying', agency_user: 'Agency', supplier_user: 'Supplier' }[posterRole] || posterRole;

      // Get all stakeholder contacts + job details
      const jobInfo = await db.query(
        `SELECT j.job_ref, j.po_no, j.agency_code, j.supplier_code,
                i.name AS item_name, s.name AS supplier_name,
                a.name AS agency_name, a.contact_emails AS agency_emails,
                s.contact_email AS supplier_email
         FROM qc_inspection.inspection_job j
         JOIN qc_inspection.item_master i ON i.item_code = j.item_code
         JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
         LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
         WHERE j.job_id = $1`, [job_id]
      );
      const ji = jobInfo.rows[0] || {};
      const qaUsers = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'qa' AND email IS NOT NULL");
      const buyingUsers = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'buying' AND email IS NOT NULL");

      const notifMsg = JSON.stringify({
        job_ref: ji.job_ref || null,
        job_id,
        po_no: ji.po_no || resolvedPoNo,
        item_name: ji.item_name,
        supplier_name: ji.supplier_name,
        agency_name: ji.agency_name || null,
        remark: message.trim(),
        posted_by: req.user.name || req.user.email,
        role: posterLabel,
      });

      // Notify everyone EXCEPT the poster
      if (posterRole !== 'qa') sendNotification(job_id, 'REMARK_POSTED', 'qa', qaUsers.rows.map(u => u.email), notifMsg);
      if (posterRole !== 'buying') sendNotification(job_id, 'REMARK_POSTED', 'buying', buyingUsers.rows.map(u => u.email), notifMsg);
      if (posterRole !== 'agency_user') sendNotification(job_id, 'REMARK_POSTED', 'agency_user', ji.agency_emails || [], notifMsg, null, ji.agency_code);
      if (posterRole !== 'supplier_user') sendNotification(job_id, 'REMARK_POSTED', 'supplier_user', ji.supplier_email ? [ji.supplier_email] : [], notifMsg, null, null, ji.supplier_code);
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create log entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/log-entries/:id
 * Get a single log entry.
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM qc_inspection.log_entry WHERE log_id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Log entry not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get log entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
