const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

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
      SELECT l.*
      FROM log_entries l
    `;
    const params = [];
    const conditions = [];

    // Join inspection_jobs if we need role scoping
    if (req.user.role === 'agency_user' || req.user.role === 'supplier_user') {
      query = `
        SELECT l.*
        FROM log_entries l
        LEFT JOIN inspection_jobs j ON j.job_id = l.job_id
      `;
      if (req.user.role === 'agency_user') {
        params.push(req.user.agency_code);
        conditions.push(`(j.agency_code = $${params.length} OR l.job_id IS NULL)`);
      } else if (req.user.role === 'supplier_user') {
        params.push(req.user.supplier_code);
        conditions.push(`(j.supplier_code = $${params.length} OR l.job_id IS NULL)`);
      }
    }

    if (job_id) {
      params.push(job_id);
      conditions.push(`l.job_id = $${params.length}`);
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
        'SELECT * FROM inspection_jobs WHERE job_id = $1',
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
      const poResult = await db.query('SELECT item_code FROM po_master WHERE po_no = $1', [po_no]);
      if (poResult.rows.length > 0) {
        itemCode = poResult.rows[0].item_code;
      }
    }

    const result = await db.query(
      `INSERT INTO log_entries (po_no, item_code, job_id, author_role, author_email, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [resolvedPoNo, itemCode, job_id || null, req.user.role, req.user.email, message.trim()]
    );

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
      'SELECT * FROM log_entries WHERE log_id = $1',
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
