const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files allowed'));
    cb(null, true);
  },
});

const WAREHOUSE_ROLES = ['warehouse', 'admin', 'qa', 'buying'];

// All warehouse-inspection routes (including reads) are limited to these roles;
// individual write endpoints apply narrower checks on top.
router.use((req, res, next) => {
  if (!WAREHOUSE_ROLES.includes(req.user.role))
    return res.status(403).json({ error: 'Access denied' });
  next();
});

// GET /api/warehouse-inspections — list all (with PO + item info)
router.get('/', async (req, res) => {
  try {
    const { stage, status, po_no } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (stage)  { params.push(stage);  where += ` AND wi.stage = $${params.length}`; }
    if (status) { params.push(status); where += ` AND wi.status = $${params.length}`; }
    if (po_no)  { params.push(po_no);  where += ` AND wi.po_no = $${params.length}`; }

    const { rows } = await db.query(`
      SELECT
        wi.*,
        p.status      AS po_status,
        p.quantity    AS po_qty,
        p.unit_price,
        (COALESCE(p.quantity, 0) * COALESCE(p.unit_price, 0))       AS po_value,
        (COALESCE(wi.defect_qty, 0) * COALESCE(p.unit_price, 0))    AS defect_value,
        EXISTS (SELECT 1 FROM qc_inspection.inspection_job j
                WHERE j.po_no = wi.po_no AND COALESCE(j.inspection_type, 'agency') = 'agency') AS agency_inspected,
        EXISTS (SELECT 1 FROM qc_inspection.inspection_job j
                WHERE j.po_no = wi.po_no AND j.inspection_type = 'self') AS self_inspected,
        im.name       AS item_name,
        ts.name       AS inspector_name,
        COUNT(wir.response_id)                            AS total_checkpoints,
        COUNT(wir.response_id) FILTER (WHERE wir.result = 'pass') AS pass_count,
        COUNT(wir.response_id) FILTER (WHERE wir.result = 'fail') AS fail_count
      FROM qc_inspection.warehouse_inspection wi
      JOIN qc_inspection.po_master p ON p.po_no = wi.po_no
      JOIN qc_inspection.item_master im ON im.item_code = wi.item_code
      LEFT JOIN qc_inspection.team_stakeholder ts ON ts.user_id = wi.inspector_id
      LEFT JOIN qc_inspection.warehouse_inspection_response wir ON wir.wh_inspection_id = wi.wh_inspection_id
      ${where}
      GROUP BY wi.wh_inspection_id, p.status, p.quantity, p.unit_price, im.name, ts.name
      ORDER BY wi.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/checklist-templates?stage=inbound&item_code=XYZ
router.get('/checklist-templates', async (req, res) => {
  try {
    const { stage, item_code } = req.query;
    const { rows } = await db.query(
      `SELECT * FROM qc_inspection.warehouse_checklist_template
       WHERE ($1::text IS NULL OR stage = $1)
         AND ($2::text IS NULL OR item_code IS NULL OR item_code = $2)
       ORDER BY sort_order ASC`,
      [stage || null, item_code || null]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/warehouse-inspections/checkpoint-templates — add item-specific checkpoint
router.post('/checkpoint-templates', async (req, res) => {
  try {
    if (!['admin', 'qa'].includes(req.user.role))
      return res.status(403).json({ error: 'Admin or QA only' });
    const { stage, section, checkpoint, criticality, item_code, sort_order } = req.body;
    if (!stage || !section || !checkpoint)
      return res.status(400).json({ error: 'stage, section and checkpoint are required' });
    const { rows } = await db.query(`
      INSERT INTO qc_inspection.warehouse_checklist_template
        (stage, section, checkpoint, criticality, item_code, sort_order)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 999))
      RETURNING *
    `, [stage, section, checkpoint, criticality || 'major', item_code || null, sort_order || null]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/warehouse-inspections/checkpoint-templates/:checkpointId — remove item-specific checkpoint
router.delete('/checkpoint-templates/:checkpointId', async (req, res) => {
  try {
    if (!['admin', 'qa'].includes(req.user.role))
      return res.status(403).json({ error: 'Admin or QA only' });
    // Only allow deleting item-specific (non-generic) checkpoints via this route
    const { rowCount } = await db.query(
      `DELETE FROM qc_inspection.warehouse_checklist_template WHERE checkpoint_id = $1 AND item_code IS NOT NULL`,
      [req.params.checkpointId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Checkpoint not found or is a generic checkpoint' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/coverage — warehouse inspection coverage stats
router.get('/coverage', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)::int AS total_pos,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM qc_inspection.warehouse_inspection wi WHERE wi.po_no = p.po_no
        ))::int AS wh_inspected_pos,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM qc_inspection.inspection_job j WHERE j.po_no = p.po_no
        ))::int AS agency_inspected_pos,
        COUNT(*) FILTER (WHERE
          EXISTS (SELECT 1 FROM qc_inspection.warehouse_inspection wi WHERE wi.po_no = p.po_no)
          AND EXISTS (SELECT 1 FROM qc_inspection.inspection_job j WHERE j.po_no = p.po_no)
        )::int AS both_pos,
        COUNT(*) FILTER (WHERE
          NOT EXISTS (SELECT 1 FROM qc_inspection.warehouse_inspection wi WHERE wi.po_no = p.po_no)
          AND NOT EXISTS (SELECT 1 FROM qc_inspection.inspection_job j WHERE j.po_no = p.po_no)
        )::int AS uninspected_pos
      FROM qc_inspection.po_master p
    `);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT wi.*, p.status AS po_status, p.supplier_code, p.quantity AS po_qty, p.unit_price,
             s.name AS supplier_name,
             im.name AS item_name, ts.name AS inspector_name
      FROM qc_inspection.warehouse_inspection wi
      JOIN qc_inspection.po_master p ON p.po_no = wi.po_no
      LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
      JOIN qc_inspection.item_master im ON im.item_code = wi.item_code
      LEFT JOIN qc_inspection.team_stakeholder ts ON ts.user_id = wi.inspector_id
      WHERE wi.wh_inspection_id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/:id/responses
router.get('/:id/responses', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT wir.*, wct.section, wct.checkpoint, wct.criticality, wct.sort_order, wct.item_code
      FROM qc_inspection.warehouse_inspection_response wir
      JOIN qc_inspection.warehouse_checklist_template wct ON wct.checkpoint_id = wir.checkpoint_id
      WHERE wir.wh_inspection_id = $1
      ORDER BY wct.item_code NULLS FIRST, wct.sort_order ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/:id/prior-qc — prior QC inspection history for the item+PO
router.get('/:id/prior-qc', async (req, res) => {
  try {
    const { rows: wi } = await db.query(
      `SELECT po_no, item_code FROM qc_inspection.warehouse_inspection WHERE wh_inspection_id = $1`,
      [req.params.id]
    );
    if (!wi.length) return res.status(404).json({ error: 'Not found' });
    const { po_no, item_code } = wi[0];

    // All agency/self inspections on this PO — same-item jobs listed first
    const { rows } = await db.query(`
      SELECT
        j.job_id, j.job_ref, j.inspection_stage, j.inspection_type, j.status,
        j.inspection_date, j.actual_inspection_date, j.submitted_at, j.decided_at,
        j.final_outcome, j.qa_remarks,
        a.name AS agency_name,
        EXISTS (SELECT 1 FROM qc_inspection.job_items ji WHERE ji.job_id = j.job_id AND ji.item_code = $2) AS same_item,
        COUNT(ir.response_id) FILTER (WHERE ir.result = 'pass') AS pass_count,
        COUNT(ir.response_id) FILTER (WHERE ir.result = 'fail') AS fail_count,
        COUNT(ir.response_id) AS total_count
      FROM qc_inspection.inspection_job j
      LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
      LEFT JOIN qc_inspection.inspection_response ir ON ir.job_id = j.job_id
      WHERE j.po_no = $1
      GROUP BY j.job_id, a.name
      ORDER BY same_item DESC, j.inspection_date DESC NULLS LAST
    `, [po_no, item_code]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/:id/prior-qc/:jobId/responses
// Full checklist of a prior agency/self inspection on the same PO, viewable by warehouse
router.get('/:id/prior-qc/:jobId/responses', async (req, res) => {
  try {
    const { rows: wi } = await db.query(
      `SELECT po_no FROM qc_inspection.warehouse_inspection WHERE wh_inspection_id = $1`,
      [req.params.id]
    );
    if (!wi.length) return res.status(404).json({ error: 'Not found' });

    // The job must belong to the same PO as this warehouse inspection
    const { rows: jobRows } = await db.query(
      `SELECT j.job_id, j.job_ref, j.status, j.final_outcome, j.qa_notes, j.inspection_type,
              a.name AS agency_name
       FROM qc_inspection.inspection_job j
       LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
       WHERE j.job_id = $1 AND j.po_no = $2`,
      [req.params.jobId, wi[0].po_no]
    );
    if (!jobRows.length) return res.status(404).json({ error: 'Job not found for this PO' });

    const { rows: responses } = await db.query(`
      SELECT ci.section, ci.checkpoint_text, ci.criticality, ci.sort_order,
             ir.result, ir.remark
      FROM qc_inspection.inspection_response ir
      JOIN qc_inspection.checklist_item ci ON ci.item_id = ir.checklist_item_id
      WHERE ir.job_id = $1
      ORDER BY ci.sort_order ASC
    `, [req.params.jobId]);

    res.json({ job: jobRows[0], responses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/warehouse-inspections — create new
router.post('/', async (req, res) => {
  try {
    if (!WAREHOUSE_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { po_no, item_code, stage, trigger_source } = req.body;
    if (!po_no || !item_code || !stage)
      return res.status(400).json({ error: 'po_no, item_code and stage are required' });

    // Verify PO and item exist
    const { rows: poRows } = await db.query(
      `SELECT po_no FROM qc_inspection.po_master WHERE po_no = $1`, [po_no]
    );
    if (!poRows.length) return res.status(400).json({ error: 'PO not found' });

    const { rows: itemRows } = await db.query(
      `SELECT item_code FROM qc_inspection.item_master WHERE item_code = $1`, [item_code]
    );
    if (!itemRows.length) return res.status(400).json({ error: 'Item not found' });

    const { rows } = await db.query(`
      INSERT INTO qc_inspection.warehouse_inspection
        (po_no, item_code, stage, trigger_source, status, inspector_id)
      VALUES ($1, $2, $3, $4, 'in_progress', $5)
      RETURNING *
    `, [po_no, item_code, stage, trigger_source || null, req.user.user_id]);

    const inspection = rows[0];

    // Create blank responses in a single INSERT ... SELECT instead of a loop
    await db.query(`
      INSERT INTO qc_inspection.warehouse_inspection_response (wh_inspection_id, checkpoint_id)
      SELECT $1, checkpoint_id
      FROM qc_inspection.warehouse_checklist_template
      WHERE stage = $2 AND (item_code IS NULL OR item_code = $3)
      ON CONFLICT (wh_inspection_id, checkpoint_id) DO NOTHING
    `, [inspection.wh_inspection_id, stage, item_code]);

    res.json(inspection);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/warehouse-inspections/:id/sync-responses — add missing checkpoint rows
router.post('/:id/sync-responses', async (req, res) => {
  try {
    if (!WAREHOUSE_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });
    const { rows: wi } = await db.query(
      `SELECT stage, item_code FROM qc_inspection.warehouse_inspection WHERE wh_inspection_id = $1`,
      [req.params.id]
    );
    if (!wi.length) return res.status(404).json({ error: 'Not found' });
    const { stage, item_code } = wi[0];
    const { rowCount } = await db.query(`
      INSERT INTO qc_inspection.warehouse_inspection_response (wh_inspection_id, checkpoint_id)
      SELECT $1, checkpoint_id
      FROM qc_inspection.warehouse_checklist_template
      WHERE stage = $2 AND (item_code IS NULL OR item_code = $3)
      ON CONFLICT (wh_inspection_id, checkpoint_id) DO NOTHING
    `, [req.params.id, stage, item_code]);
    res.json({ ok: true, added: rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/warehouse-inspections/:id/responses — save checklist responses
router.put('/:id/responses', async (req, res) => {
  try {
    if (!WAREHOUSE_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { responses, checked_qty, defect_qty } = req.body; // [{ checkpoint_id, result, remarks }]
    if (!Array.isArray(responses)) return res.status(400).json({ error: 'responses must be an array' });

    for (const r of responses) {
      await db.query(`
        UPDATE qc_inspection.warehouse_inspection_response
        SET result = $1, remarks = $2, updated_at = NOW()
        WHERE wh_inspection_id = $3 AND checkpoint_id = $4
      `, [r.result || null, r.remarks || null, req.params.id, r.checkpoint_id]);
    }

    // Optional quantity fields saved alongside responses
    if (checked_qty !== undefined || defect_qty !== undefined) {
      const cq = checked_qty === undefined || checked_qty === null || checked_qty === '' ? null : parseInt(checked_qty, 10);
      const dq = defect_qty === undefined || defect_qty === null || defect_qty === '' ? null : parseInt(defect_qty, 10);
      if ((cq !== null && (isNaN(cq) || cq < 0)) || (dq !== null && (isNaN(dq) || dq < 0)))
        return res.status(400).json({ error: 'Quantities must be non-negative numbers' });
      await db.query(
        `UPDATE qc_inspection.warehouse_inspection SET checked_qty = $1, defect_qty = $2 WHERE wh_inspection_id = $3`,
        [cq, dq, req.params.id]
      );
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/warehouse-inspections/:id/complete — mark complete with overall result
router.patch('/:id/complete', async (req, res) => {
  try {
    if (!WAREHOUSE_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { remarks } = req.body;

    // Auto-determine pass/fail based on any critical/major fails
    const { rows } = await db.query(`
      SELECT wir.result, wct.criticality
      FROM qc_inspection.warehouse_inspection_response wir
      JOIN qc_inspection.warehouse_checklist_template wct ON wct.checkpoint_id = wir.checkpoint_id
      WHERE wir.wh_inspection_id = $1
    `, [req.params.id]);

    const hasFail = rows.some(r => r.result === 'fail');
    const status = hasFail ? 'fail' : 'pass';

    const { rows: updated } = await db.query(`
      UPDATE qc_inspection.warehouse_inspection
      SET status = $1, remarks = $2, completed_at = NOW()
      WHERE wh_inspection_id = $3
      RETURNING *
    `, [status, remarks || null, req.params.id]);

    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/warehouse-inspections/:id/reopen — re-open a QA-rejected inspection for editing
router.patch('/:id/reopen', async (req, res) => {
  try {
    if (!['warehouse', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { rows } = await db.query(
      `SELECT status FROM qc_inspection.warehouse_inspection WHERE wh_inspection_id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (!['qa_rejected', 'submitted_for_qa'].includes(rows[0].status))
      return res.status(400).json({ error: 'Only submitted or QA-rejected inspections can be re-opened' });

    const { rows: updated } = await db.query(`
      UPDATE qc_inspection.warehouse_inspection
      SET status = 'in_progress', qa_reviewer_id = NULL, qa_remarks = NULL, qa_reviewed_at = NULL, submitted_at = NULL
      WHERE wh_inspection_id = $1
      RETURNING *
    `, [req.params.id]);
    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/warehouse-inspections/:id/submit-for-qa — warehouse submits for QA review
router.post('/:id/submit-for-qa', async (req, res) => {
  try {
    if (!['warehouse', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { rows: wiRows } = await db.query(
      `SELECT wi.*, im.name AS item_name, s.name AS supplier_name
       FROM qc_inspection.warehouse_inspection wi
       JOIN qc_inspection.item_master im ON im.item_code = wi.item_code
       JOIN qc_inspection.po_master p ON p.po_no = wi.po_no
       LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
       WHERE wi.wh_inspection_id = $1`,
      [req.params.id]
    );
    if (!wiRows.length) return res.status(404).json({ error: 'Not found' });
    const wi = wiRows[0];

    if (!['in_progress', 'pass', 'fail'].includes(wi.status))
      return res.status(400).json({ error: 'Inspection must be in progress or completed before submitting for QA' });

    // Guard: every checkpoint must have a result before submitting for QA
    const { rows: pendingRows } = await db.query(
      `SELECT COUNT(*)::int AS pending
       FROM qc_inspection.warehouse_inspection_response
       WHERE wh_inspection_id = $1 AND result IS NULL`,
      [req.params.id]
    );
    if (pendingRows[0].pending > 0)
      return res.status(400).json({ error: `Cannot submit: ${pendingRows[0].pending} checkpoint(s) still pending. Please mark Pass/Fail/NA for all checkpoints.` });

    // Guard: every failed checkpoint must carry a remark
    const { rows: failNoRemark } = await db.query(
      `SELECT COUNT(*)::int AS missing
       FROM qc_inspection.warehouse_inspection_response
       WHERE wh_inspection_id = $1 AND result = 'fail' AND (remarks IS NULL OR btrim(remarks) = '')`,
      [req.params.id]
    );
    if (failNoRemark[0].missing > 0)
      return res.status(400).json({ error: `Cannot submit: ${failNoRemark[0].missing} failed checkpoint(s) missing remarks. A remark is required for every FAIL.` });

    const { rows: failedRows } = await db.query(`
      SELECT wct.section, wct.checkpoint AS checkpoint_text, wct.criticality, wir.remarks AS remark
      FROM qc_inspection.warehouse_inspection_response wir
      JOIN qc_inspection.warehouse_checklist_template wct ON wct.checkpoint_id = wir.checkpoint_id
      WHERE wir.wh_inspection_id = $1 AND wir.result = 'fail'
      ORDER BY wct.sort_order
    `, [req.params.id]);

    const { rows: updated } = await db.query(`
      UPDATE qc_inspection.warehouse_inspection
      SET status = 'submitted_for_qa', submitted_at = NOW()
      WHERE wh_inspection_id = $1
      RETURNING *
    `, [req.params.id]);

    const { rows: qaUsers } = await db.query(
      `SELECT email FROM qc_inspection.team_stakeholder WHERE role IN ('qa', 'admin')`
    );
    const qaEmails = qaUsers.map(u => u.email).filter(Boolean);

    const extraMsg = JSON.stringify({
      wh_inspection_id: req.params.id,
      po_no: wi.po_no,
      item_name: wi.item_name,
      supplier_name: wi.supplier_name,
      stage: wi.stage,
      failed_checkpoints: failedRows,
    });

    await sendNotification(null, 'WH_SUBMITTED_FOR_QA', 'qa', qaEmails, extraMsg);

    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/warehouse-inspections/:id/qa-review — QA approves or rejects
router.post('/:id/qa-review', async (req, res) => {
  try {
    if (!['qa', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { action, remarks } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ error: 'action must be approve or reject' });

    const { rows: wiRows } = await db.query(
      `SELECT wi.*, im.name AS item_name, s.name AS supplier_name
       FROM qc_inspection.warehouse_inspection wi
       JOIN qc_inspection.item_master im ON im.item_code = wi.item_code
       JOIN qc_inspection.po_master p ON p.po_no = wi.po_no
       LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
       WHERE wi.wh_inspection_id = $1`,
      [req.params.id]
    );
    if (!wiRows.length) return res.status(404).json({ error: 'Not found' });
    const wi = wiRows[0];

    if (!['submitted_for_qa', 'deviation_reviewed'].includes(wi.status))
      return res.status(400).json({ error: 'Inspection must be submitted for QA before review' });

    const newStatus = action === 'approve' ? 'qa_approved' : 'qa_rejected';
    const { rows: updated } = await db.query(`
      UPDATE qc_inspection.warehouse_inspection
      SET status = $1, qa_reviewer_id = $2, qa_remarks = $3, qa_reviewed_at = NOW()
      WHERE wh_inspection_id = $4
      RETURNING *
    `, [newStatus, req.user.user_id, remarks || null, req.params.id]);

    const { rows: whUsers } = await db.query(
      `SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'warehouse'`
    );
    const whEmails = whUsers.map(u => u.email).filter(Boolean);

    const eventType = action === 'approve' ? 'WH_QA_APPROVED' : 'WH_QA_REJECTED';
    const extraMsg = JSON.stringify({
      wh_inspection_id: req.params.id,
      po_no: wi.po_no,
      item_name: wi.item_name,
      supplier_name: wi.supplier_name,
      stage: wi.stage,
      reviewer_name: req.user.name || req.user.email,
      remarks: remarks || null,
    });

    await sendNotification(null, eventType, 'warehouse', whEmails, extraMsg);

    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: load inspection with PO + supplier + assigned buyer info
async function loadInspectionContext(id) {
  const { rows } = await db.query(`
    SELECT wi.*, im.name AS item_name, s.name AS supplier_name,
           p.buyer_id AS po_buyer_id,
           b.email AS po_buyer_email, b.name AS po_buyer_name
    FROM qc_inspection.warehouse_inspection wi
    JOIN qc_inspection.item_master im ON im.item_code = wi.item_code
    JOIN qc_inspection.po_master p ON p.po_no = wi.po_no
    LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
    LEFT JOIN qc_inspection.team_stakeholder b ON b.user_id = p.buyer_id
    WHERE wi.wh_inspection_id = $1
  `, [id]);
  return rows[0] || null;
}

// POST /api/warehouse-inspections/:id/request-deviation — QA asks Buying for a deviation
router.post('/:id/request-deviation', async (req, res) => {
  try {
    if (!['qa', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { reason } = req.body;
    if (!reason || !reason.trim())
      return res.status(400).json({ error: 'A deviation reason is required' });

    const wi = await loadInspectionContext(req.params.id);
    if (!wi) return res.status(404).json({ error: 'Not found' });

    if (wi.status !== 'submitted_for_qa')
      return res.status(400).json({ error: 'Deviation can only be requested while the inspection is pending QA review' });

    const { rows: updated } = await db.query(`
      UPDATE qc_inspection.warehouse_inspection
      SET status = 'deviation_requested', deviation_reason = $1,
          deviation_requested_by = $2, deviation_requested_at = NOW()
      WHERE wh_inspection_id = $3
      RETURNING *
    `, [reason.trim(), req.user.user_id, req.params.id]);

    const extraMsg = JSON.stringify({
      wh_inspection_id: req.params.id,
      po_no: wi.po_no,
      item_name: wi.item_name,
      supplier_name: wi.supplier_name,
      stage: wi.stage,
      requester_name: req.user.name || req.user.email,
      reason: reason.trim(),
    });

    if (wi.po_buyer_id && wi.po_buyer_email) {
      // Notify the PO's assigned buyer, tagged with their user_id for the bell
      await sendNotification(null, 'WH_DEVIATION_REQUESTED', 'buying', [wi.po_buyer_email], extraMsg, null, null, null, wi.po_buyer_id);
    } else {
      // No buyer assigned to this PO — ask admins to assign one
      const { rows: admins } = await db.query(
        `SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'admin'`
      );
      const adminEmails = admins.map(a => a.email).filter(Boolean);
      await sendNotification(null, 'WH_DEVIATION_NO_BUYER', 'admin', adminEmails, extraMsg);
    }

    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/warehouse-inspections/:id/buyer-deviation — Buying approves/rejects the deviation
router.post('/:id/buyer-deviation', async (req, res) => {
  try {
    if (!['buying', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });

    const { action, remarks } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ error: 'action must be approve or reject' });

    const wi = await loadInspectionContext(req.params.id);
    if (!wi) return res.status(404).json({ error: 'Not found' });

    if (wi.status !== 'deviation_requested')
      return res.status(400).json({ error: 'No pending deviation request for this inspection' });

    // Only the PO's assigned buyer (or admin) may decide the deviation
    if (req.user.role === 'buying' && wi.po_buyer_id && wi.po_buyer_id !== req.user.user_id)
      return res.status(403).json({ error: 'This PO is assigned to a different buyer' });

    const decision = action === 'approve' ? 'approved' : 'rejected';
    const { rows: updated } = await db.query(`
      UPDATE qc_inspection.warehouse_inspection
      SET status = 'deviation_reviewed', buyer_decision = $1,
          buyer_reviewer_id = $2, buyer_remarks = $3, buyer_decided_at = NOW()
      WHERE wh_inspection_id = $4
      RETURNING *
    `, [decision, req.user.user_id, remarks || null, req.params.id]);

    // Notify QA users so they can make the final decision
    const { rows: qaUsers } = await db.query(
      `SELECT email FROM qc_inspection.team_stakeholder WHERE role IN ('qa', 'admin')`
    );
    const qaEmails = qaUsers.map(u => u.email).filter(Boolean);

    const eventType = action === 'approve' ? 'WH_DEVIATION_APPROVED' : 'WH_DEVIATION_REJECTED';
    const extraMsg = JSON.stringify({
      wh_inspection_id: req.params.id,
      po_no: wi.po_no,
      item_name: wi.item_name,
      supplier_name: wi.supplier_name,
      stage: wi.stage,
      buyer_name: req.user.name || req.user.email,
      deviation_reason: wi.deviation_reason,
      remarks: remarks || null,
    });

    await sendNotification(null, eventType, 'qa', qaEmails, extraMsg);

    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/:id/images
router.get('/:id/images', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT image_id, wh_inspection_id, section_key, file_name, file_type, file_size, uploaded_at
       FROM qc_inspection.warehouse_inspection_image WHERE wh_inspection_id = $1 ORDER BY uploaded_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/warehouse-inspections/:id/images/:imageId/file
router.get('/:id/images/:imageId/file', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT file_name, file_type, file_data FROM qc_inspection.warehouse_inspection_image WHERE image_id = $1 AND wh_inspection_id = $2`,
      [req.params.imageId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Image not found' });
    res.set('Content-Type', rows[0].file_type);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(rows[0].file_data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/warehouse-inspections/:id/images
router.post('/:id/images', upload.single('image'), async (req, res) => {
  try {
    if (!WAREHOUSE_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM qc_inspection.warehouse_inspection_image WHERE wh_inspection_id = $1 AND section_key = $2`,
      [req.params.id, req.body.section_key || '__general__']
    );
    if (parseInt(countRows[0].count) >= 10)
      return res.status(400).json({ error: 'Maximum 10 images per section' });

    const { rows } = await db.query(`
      INSERT INTO qc_inspection.warehouse_inspection_image
        (wh_inspection_id, section_key, file_name, file_type, file_size, file_data)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING image_id, wh_inspection_id, section_key, file_name, file_type, file_size, uploaded_at
    `, [req.params.id, req.body.section_key || '__general__', req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/warehouse-inspections/:id/images/:imageId
router.delete('/:id/images/:imageId', async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM qc_inspection.warehouse_inspection_image WHERE image_id = $1 AND wh_inspection_id = $2`,
      [req.params.imageId, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Image not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
