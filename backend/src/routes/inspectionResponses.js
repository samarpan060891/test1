const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/inspection-responses/:jobId
 * Get all responses for a job. Agency sees own jobs; QA/Buying see all.
 */
router.get('/:jobId', async (req, res) => {
  try {
    // Verify job access
    const jobResult = await db.query(
      'SELECT * FROM qc_inspection.inspection_job WHERE job_id = $1',
      [req.params.jobId]
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

    const result = await db.query(
      `SELECT r.*, ci.section, ci.checkpoint_text, ci.criticality, ci.sort_order
       FROM qc_inspection.inspection_response r
       JOIN qc_inspection.checklist_item ci ON ci.item_id = r.checklist_item_id
       WHERE r.job_id = $1
       ORDER BY ci.sort_order ASC`,
      [req.params.jobId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Get responses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/inspection-responses/:jobId
 * Agency submits/updates responses for a job.
 * Body: { responses: [{ checklist_item_id, result, remark, photo_url? }] }
 * Uses UPSERT — can be called multiple times (save progress).
 */
router.post('/:jobId', authorize('agency_user'), async (req, res) => {
  const { responses } = req.body;

  if (!responses || !Array.isArray(responses) || responses.length === 0) {
    return res.status(400).json({ error: 'responses array is required' });
  }

  const validResults = ['pass', 'fail', 'na'];
  for (const r of responses) {
    if (!r.checklist_item_id || !r.result) {
      return res.status(400).json({ error: 'Each response must have checklist_item_id and result' });
    }
    if (!validResults.includes(r.result)) {
      return res.status(400).json({ error: `Invalid result value: ${r.result}. Must be pass, fail, or na` });
    }
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verify job and access
    const jobResult = await client.query(
      'SELECT * FROM qc_inspection.inspection_job WHERE job_id = $1',
      [req.params.jobId]
    );

    if (jobResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    if (job.agency_code !== req.user.agency_code) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied' });
    }

    if (job.status !== 'mapped_awaiting_inspection') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot modify responses for job in status: ${job.status}` });
    }

    // Verify all checklist_item_ids belong to this job's template
    const templateItems = await client.query(
      'SELECT item_id FROM qc_inspection.checklist_item WHERE template_id = $1',
      [job.checklist_template_id]
    );
    const validItemIds = new Set(templateItems.rows.map(r => r.item_id));

    for (const r of responses) {
      if (!validItemIds.has(r.checklist_item_id)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `checklist_item_id ${r.checklist_item_id} does not belong to this job's template`,
        });
      }
    }

    // Upsert responses
    const savedResponses = [];
    for (const r of responses) {
      const upsertResult = await client.query(
        `INSERT INTO qc_inspection.inspection_response (job_id, checklist_item_id, result, remark, photo_url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (job_id, checklist_item_id)
         DO UPDATE SET result = EXCLUDED.result, remark = EXCLUDED.remark, photo_url = EXCLUDED.photo_url
         RETURNING *`,
        [req.params.jobId, r.checklist_item_id, r.result, r.remark || null, r.photo_url || null]
      );
      savedResponses.push(upsertResult.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ saved: savedResponses.length, responses: savedResponses });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save responses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
