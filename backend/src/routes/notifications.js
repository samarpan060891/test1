const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/notifications
 * List notification events scoped by user role.
 * Query params: ?job_id=&limit=&offset=
 */
router.get('/', async (req, res) => {
  const { job_id, limit = 50, offset = 0 } = req.query;

  try {
    let query = `
      SELECT n.*, j.po_no, j.item_code, j.status AS job_status
      FROM qc_inspection.notification_event n
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = n.job_id
    `;
    const params = [];
    const conditions = [];

    // Scope by role
    if (req.user.role === 'agency_user') {
      params.push(req.user.agency_code);
      conditions.push(`(j.agency_code = $${params.length} OR n.recipient_role = 'agency_user')`);
    } else if (req.user.role === 'supplier_user') {
      params.push(req.user.supplier_code);
      conditions.push(`(j.supplier_code = $${params.length} OR n.recipient_role = 'supplier_user')`);
    } else {
      // qa and buying see their role's notifications
      params.push(req.user.role);
      conditions.push(`n.recipient_role = $${params.length}`);
    }

    if (job_id) {
      params.push(job_id);
      conditions.push(`n.job_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY n.sent_at DESC';

    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;

    params.push(parseInt(offset));
    query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/notifications/trigger
 * Manually trigger a notification. QA/Buying only.
 * Body: { job_id, event_type, recipient_role }
 */
router.post('/trigger', async (req, res) => {
  if (!['qa', 'buying'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { job_id, event_type, recipient_role } = req.body;

  if (!job_id || !event_type || !recipient_role) {
    return res.status(400).json({ error: 'job_id, event_type, and recipient_role are required' });
  }

  try {
    const jobResult = await db.query(
      'SELECT j.*, a.contact_emails, s.contact_email AS supplier_email FROM qc_inspection.inspection_job j JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code WHERE j.job_id = $1',
      [job_id]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];
    let emails = [];

    if (recipient_role === 'agency_user') emails = job.contact_emails || [];
    else if (recipient_role === 'supplier_user') emails = [job.supplier_email];
    else if (recipient_role === 'qa') {
      const qaUsers = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'qa'");
      emails = qaUsers.rows.map(u => u.email);
    }

    const event = await sendNotification(job_id, event_type, recipient_role, emails);
    res.status(201).json(event);
  } catch (err) {
    console.error('Trigger notification error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
