const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/notifications
 * Returns notifications for this user's role that they haven't dismissed.
 */
router.get('/', async (req, res) => {
  const { job_id } = req.query;

  try {
    let query = `
      SELECT n.*, j.po_no, j.item_code, j.status AS job_status
      FROM qc_inspection.notification_event n
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = n.job_id
      WHERE NOT ($1::uuid = ANY(COALESCE(n.dismissed_by, ARRAY[]::uuid[])))
    `;
    const params = [req.user.user_id];
    const conditions = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.role);
      conditions.push(`n.recipient_role = $${params.length}`);
    }

    // For agency users, only show notifications for their own agency
    if (req.user.role === 'agency_user' && req.user.agency_code) {
      params.push(req.user.agency_code);
      conditions.push(`n.agency_code = $${params.length}`);
    }

    if (job_id) {
      params.push(job_id);
      conditions.push(`n.job_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    if (req.user.role === 'admin') {
      // Deduplicate: one notification per (job_id, advice_id, event_type) — pick the latest
      query = `SELECT * FROM (
        SELECT DISTINCT ON (COALESCE(n.job_id::text,''), COALESCE(n.advice_id::text,''), n.event_type)
          n.*, j.po_no, j.item_code, j.status AS job_status
        FROM qc_inspection.notification_event n
        LEFT JOIN qc_inspection.inspection_job j ON j.job_id = n.job_id
        WHERE NOT ($1::uuid = ANY(COALESCE(n.dismissed_by, ARRAY[]::uuid[])))
        ${job_id ? `AND n.job_id = $2` : ''}
        ORDER BY COALESCE(n.job_id::text,''), COALESCE(n.advice_id::text,''), n.event_type, n.sent_at DESC
      ) deduped ORDER BY sent_at DESC`;
    } else {
      query += ' ORDER BY n.sent_at DESC';
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/notifications/trigger
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

/**
 * DELETE /api/notifications/:id
 * Marks this notification as dismissed for this user only.
 * Falls back to hard delete if dismissed_by column doesn't exist yet.
 */
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      `UPDATE qc_inspection.notification_event
       SET dismissed_by = array_append(COALESCE(dismissed_by, ARRAY[]::uuid[]), $1::uuid)
       WHERE event_id = $2`,
      [req.user.user_id, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    // Fallback: if dismissed_by column doesn't exist yet, just delete the row
    try {
      await db.query(
        `DELETE FROM qc_inspection.notification_event WHERE event_id = $1`,
        [req.params.id]
      );
      res.json({ ok: true });
    } catch (fallbackErr) {
      console.error('Dismiss notification error:', fallbackErr);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

module.exports = router;
