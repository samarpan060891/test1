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
});

const CLAIM_ROLES = ['warehouse', 'qa', 'buying', 'imports', 'accounts', 'admin'];
router.use((req, res, next) => {
  if (!CLAIM_ROLES.includes(req.user.role))
    return res.status(403).json({ error: 'Access denied' });
  next();
});

// Helper: claim with PO/item/supplier/user context
async function loadClaim(claimId) {
  const { rows } = await db.query(`
    SELECT c.*,
           im.name AS item_name, im.category, im.sub_category,
           s.name  AS supplier_name, s.contact_email AS supplier_email, s.country AS supplier_country,
           p.buyer_id AS po_buyer_id, b.email AS po_buyer_email,
           p.quantity AS po_qty, p.unit_price, p.order_date AS po_order_date,
           (COALESCE(p.quantity,0) * COALESCE(p.unit_price,0))    AS po_value,
           (COALESCE(c.defect_qty,0) * COALESCE(p.unit_price,0))  AS defect_value,
           ru.name AS raised_by_name, qu.name AS qa_reviewed_by_name, bu.name AS buying_submitted_by_name,
           iu.name AS imports_reviewed_by_name, au.name AS accounts_closed_by_name,
           (c.claim_amount + c.penalty_amount) AS total_amount
    FROM qc_inspection.defect_claim c
    LEFT JOIN qc_inspection.item_master im ON im.item_code = c.item_code
    LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = c.supplier_code
    LEFT JOIN qc_inspection.po_master p ON p.po_no = c.po_no
    LEFT JOIN qc_inspection.team_stakeholder b  ON b.user_id = p.buyer_id
    LEFT JOIN qc_inspection.team_stakeholder ru ON ru.user_id = c.raised_by
    LEFT JOIN qc_inspection.team_stakeholder qu ON qu.user_id = c.qa_reviewed_by
    LEFT JOIN qc_inspection.team_stakeholder bu ON bu.user_id = c.buying_submitted_by
    LEFT JOIN qc_inspection.team_stakeholder iu ON iu.user_id = c.imports_reviewed_by
    LEFT JOIN qc_inspection.team_stakeholder au ON au.user_id = c.accounts_closed_by
    WHERE c.claim_id = $1
  `, [claimId]);
  return rows[0] || null;
}

function claimMsg(c, extra = {}) {
  return JSON.stringify({
    claim_id: c.claim_id,
    claim_ref: c.claim_ref,
    po_no: c.po_no,
    item_name: c.item_name,
    supplier_name: c.supplier_name,
    claim_amount: c.claim_amount,
    penalty_amount: c.penalty_amount,
    total_amount: Number(c.claim_amount || 0) + Number(c.penalty_amount || 0),
    defect_qty: c.defect_qty,
    ...extra,
  });
}

async function notifyRole(role, eventType, msg, buyerId = null, extraEmails = []) {
  const { rows } = await db.query(
    `SELECT email FROM qc_inspection.team_stakeholder WHERE role = $1`, [role]
  );
  const emails = [...rows.map(u => u.email), ...extraEmails].filter(Boolean);
  await sendNotification(null, eventType, role, emails, msg, null, null, null, buyerId);
}

// GET /api/claims — list with context
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) { params.push(status); where = `WHERE c.status = $1`; }
    const { rows } = await db.query(`
      SELECT c.*,
             im.name AS item_name, s.name AS supplier_name,
             ru.name AS raised_by_name, qu.name AS qa_reviewed_by_name, bu.name AS buying_submitted_by_name,
             (c.claim_amount + c.penalty_amount) AS total_amount
      FROM qc_inspection.defect_claim c
      LEFT JOIN qc_inspection.item_master im ON im.item_code = c.item_code
      LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = c.supplier_code
      LEFT JOIN qc_inspection.team_stakeholder ru ON ru.user_id = c.raised_by
      LEFT JOIN qc_inspection.team_stakeholder qu ON qu.user_id = c.qa_reviewed_by
      LEFT JOIN qc_inspection.team_stakeholder bu ON bu.user_id = c.buying_submitted_by
      ${where}
      ORDER BY c.created_at DESC
    `, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/claims/:id
router.get('/:id', async (req, res) => {
  try {
    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    res.json(claim);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/claims — Warehouse raises a claim to QA
router.post('/', async (req, res) => {
  try {
    if (!['warehouse', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Only warehouse can raise claims' });

    const {
      po_no, item_code, wh_inspection_id, defect_qty, claim_amount, description,
      country_of_origin, trigger_point, checked_qty, grn_date, trigger_date, qc_done_date,
    } = req.body;
    if (!po_no || !item_code) return res.status(400).json({ error: 'po_no and item_code are required' });
    if (!description || !description.trim()) return res.status(400).json({ error: 'A defect description is required' });
    const amt = parseFloat(claim_amount);
    if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'claim_amount must be a non-negative number' });

    const { rows: poRows } = await db.query(
      `SELECT p.po_no, p.supplier_code, s.country
       FROM qc_inspection.po_master p
       LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
       WHERE p.po_no = $1`, [po_no]
    );
    if (!poRows.length) return res.status(400).json({ error: 'PO not found' });

    const { rows: refRows } = await db.query(`SELECT nextval('qc_inspection.defect_claim_ref_seq') AS n`);
    const claimRef = `CLM-${new Date().getFullYear()}-${String(refRows[0].n).padStart(4, '0')}`;

    const { rows } = await db.query(`
      INSERT INTO qc_inspection.defect_claim
        (claim_ref, po_no, item_code, supplier_code, wh_inspection_id, defect_qty, claim_amount, description, raised_by,
         country_of_origin, trigger_point, checked_qty, grn_date, trigger_date, qc_done_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [claimRef, po_no, item_code, poRows[0].supplier_code || null,
        wh_inspection_id || null, defect_qty || null, amt, description.trim(), req.user.user_id,
        (country_of_origin || poRows[0].country || null), trigger_point || null,
        checked_qty || null, grn_date || null, trigger_date || null, qc_done_date || null]);

    const claim = await loadClaim(rows[0].claim_id);
    await notifyRole('qa', 'CLAIM_RAISED', claimMsg(claim, { raised_by: req.user.name || req.user.email, description: description.trim() }));

    res.status(201).json(claim);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/claims/:id/qa-submit — QA records root cause and forwards to Buying
router.post('/:id/qa-submit', async (req, res) => {
  try {
    if (!['qa', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Only QA can review claims' });

    const { root_cause, corrective_action, preventive_action, rework_possible, rework_scope } = req.body;
    if (!root_cause || !root_cause.trim())
      return res.status(400).json({ error: 'Root cause is required to submit to Buying' });

    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    if (claim.status !== 'pending_qa')
      return res.status(400).json({ error: `Claim is not pending QA review (status: ${claim.status})` });

    const { rows } = await db.query(`
      UPDATE qc_inspection.defect_claim
      SET status = 'pending_buying', root_cause = $1, corrective_action = $2,
          preventive_action = $3, rework_possible = $4, rework_scope = $5,
          root_cause_date = COALESCE(root_cause_date, CURRENT_DATE),
          qa_reviewed_by = $6, qa_reviewed_at = NOW(), return_remarks = NULL
      WHERE claim_id = $7 RETURNING *
    `, [root_cause.trim(), corrective_action?.trim() || null, preventive_action?.trim() || null,
        rework_possible === undefined ? null : !!rework_possible, rework_scope?.trim() || null,
        req.user.user_id, req.params.id]);

    const updated = await loadClaim(rows[0].claim_id);
    const msg = claimMsg(updated, { qa_name: req.user.name || req.user.email, root_cause: root_cause.trim() });
    if (updated.po_buyer_id && updated.po_buyer_email) {
      await sendNotification(null, 'CLAIM_SUBMITTED_TO_BUYING', 'buying', [updated.po_buyer_email], msg, null, null, null, updated.po_buyer_id);
    } else {
      await notifyRole('admin', 'CLAIM_SUBMITTED_TO_BUYING', msg);
    }
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/claims/:id/return — QA returns to warehouse (withdraw) or Buying returns to QA
router.post('/:id/return', async (req, res) => {
  try {
    const { remarks } = req.body;
    if (!remarks || !remarks.trim())
      return res.status(400).json({ error: 'Remarks are required when returning a claim' });

    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });

    if (claim.status === 'pending_qa' && ['qa', 'admin'].includes(req.user.role)) {
      // QA returns to warehouse → claim withdrawn; warehouse may raise a corrected one
      const { rows } = await db.query(`
        UPDATE qc_inspection.defect_claim
        SET status = 'withdrawn', return_remarks = $1
        WHERE claim_id = $2 RETURNING *
      `, [remarks.trim(), req.params.id]);
      const updated = await loadClaim(rows[0].claim_id);
      await notifyRole('warehouse', 'CLAIM_RETURNED', claimMsg(updated, { returned_by: req.user.name || req.user.email, remarks: remarks.trim(), returned_to: 'warehouse' }));
      return res.json(updated);
    }

    if (claim.status === 'pending_buying' && ['buying', 'admin'].includes(req.user.role)) {
      if (req.user.role === 'buying' && claim.po_buyer_id && claim.po_buyer_id !== req.user.user_id)
        return res.status(403).json({ error: 'This PO is assigned to a different buyer' });
      const { rows } = await db.query(`
        UPDATE qc_inspection.defect_claim
        SET status = 'pending_qa', return_remarks = $1
        WHERE claim_id = $2 RETURNING *
      `, [remarks.trim(), req.params.id]);
      const updated = await loadClaim(rows[0].claim_id);
      await notifyRole('qa', 'CLAIM_RETURNED', claimMsg(updated, { returned_by: req.user.name || req.user.email, remarks: remarks.trim(), returned_to: 'qa' }));
      return res.json(updated);
    }

    return res.status(400).json({ error: `Cannot return a claim in status ${claim.status} as ${req.user.role}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/claims/:id/buying-submit — Buying finalises: penalty + settlement mode → Imports
// Modes: replacement | rework | refund. Credit note is mandatory for rework & refund.
router.post('/:id/buying-submit', async (req, res) => {
  try {
    if (!['buying', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Only Buying can submit the final claim' });

    const { penalty_amount, penalty_reason, mode, credit_note_no, settlement_remarks, rework_cost, cost_sheet_note } = req.body;
    const penalty = penalty_amount === undefined || penalty_amount === null || penalty_amount === ''
      ? 0 : parseFloat(penalty_amount);
    if (isNaN(penalty) || penalty < 0)
      return res.status(400).json({ error: 'penalty_amount must be a non-negative number' });
    if (penalty > 0 && (!penalty_reason || !penalty_reason.trim()))
      return res.status(400).json({ error: 'A reason is required when adding a penalty' });
    if (!['replacement', 'rework', 'refund'].includes(mode))
      return res.status(400).json({ error: 'Settlement mode must be replacement, rework or refund' });
    if (['rework', 'refund'].includes(mode) && (!credit_note_no || !credit_note_no.trim()))
      return res.status(400).json({ error: `A credit note number is required for ${mode}` });
    const reworkCost = rework_cost === undefined || rework_cost === null || rework_cost === ''
      ? null : parseFloat(rework_cost);
    if (reworkCost !== null && (isNaN(reworkCost) || reworkCost < 0))
      return res.status(400).json({ error: 'rework_cost must be a non-negative number' });

    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    if (claim.status !== 'pending_buying')
      return res.status(400).json({ error: `Claim is not pending Buying (status: ${claim.status})` });
    if (req.user.role === 'buying' && claim.po_buyer_id && claim.po_buyer_id !== req.user.user_id)
      return res.status(403).json({ error: 'This PO is assigned to a different buyer' });

    const { rows } = await db.query(`
      UPDATE qc_inspection.defect_claim
      SET status = 'pending_imports', penalty_amount = $1, penalty_reason = $2,
          settlement_mode = $3, credit_note_no = $4, settlement_remarks = $5,
          rework_cost = $6, cost_sheet_note = $7,
          buying_submitted_by = $8, buying_submitted_at = NOW()
      WHERE claim_id = $9 RETURNING *
    `, [penalty, penalty_reason?.trim() || null, mode, credit_note_no?.trim() || null,
        settlement_remarks?.trim() || null, reworkCost, cost_sheet_note?.trim() || null,
        req.user.user_id, req.params.id]);

    const updated = await loadClaim(rows[0].claim_id);
    const msg = claimMsg(updated, { buyer_name: req.user.name || req.user.email, settlement_mode: mode, credit_note_no: credit_note_no?.trim() || null });
    // Final claim goes to the supplier; Imports is next to process, QA + warehouse informed
    await sendNotification(null, 'CLAIM_FINAL_SUBMITTED', 'supplier_user', [updated.supplier_email], msg, null, null, updated.supplier_code);
    await notifyRole('imports', 'CLAIM_SUBMITTED_TO_IMPORTS', msg);
    await notifyRole('qa', 'CLAIM_FINAL_SUBMITTED', msg);
    await notifyRole('warehouse', 'CLAIM_FINAL_SUBMITTED', msg);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/claims/:id/imports-review — Imports adds mandatory remarks for Accounts
router.post('/:id/imports-review', async (req, res) => {
  try {
    if (!['imports', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Only Imports can process this claim' });

    const { remarks } = req.body;
    if (!remarks || !remarks.trim())
      return res.status(400).json({ error: 'Remarks for Accounts are required' });

    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    if (claim.status !== 'pending_imports')
      return res.status(400).json({ error: `Claim is not pending Imports (status: ${claim.status})` });

    const { rows } = await db.query(`
      UPDATE qc_inspection.defect_claim
      SET status = 'pending_accounts', imports_remarks = $1,
          imports_reviewed_by = $2, imports_reviewed_at = NOW()
      WHERE claim_id = $3 RETURNING *
    `, [remarks.trim(), req.user.user_id, req.params.id]);
    const updated = await loadClaim(rows[0].claim_id);
    const msg = claimMsg(updated, { imports_name: req.user.name || req.user.email, imports_remarks: remarks.trim() });
    await notifyRole('accounts', 'CLAIM_SUBMITTED_TO_ACCOUNTS', msg);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/claims/:id/accounts-close — Accounts records the deduction and closes the claim
router.post('/:id/accounts-close', async (req, res) => {
  try {
    if (!['accounts', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Only Accounts can close this claim' });

    const { deduction_remarks } = req.body;
    if (!deduction_remarks || !deduction_remarks.trim())
      return res.status(400).json({ error: 'A remark on the deduction done is required to close the claim' });

    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    if (claim.status !== 'pending_accounts')
      return res.status(400).json({ error: `Claim is not pending Accounts (status: ${claim.status})` });

    const { rows } = await db.query(`
      UPDATE qc_inspection.defect_claim
      SET status = 'closed', deduction_remarks = $1, settled_at = NOW(),
          accounts_closed_by = $2, accounts_closed_at = NOW()
      WHERE claim_id = $3 RETURNING *
    `, [deduction_remarks.trim(), req.user.user_id, req.params.id]);
    const updated = await loadClaim(rows[0].claim_id);
    const msg = claimMsg(updated, { accounts_name: req.user.name || req.user.email, deduction_remarks: deduction_remarks.trim(), settlement_mode: updated.settlement_mode });
    await notifyRole('qa', 'CLAIM_CLOSED', msg);
    await notifyRole('buying', 'CLAIM_CLOSED', msg, updated.po_buyer_id);
    await notifyRole('warehouse', 'CLAIM_CLOSED', msg);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/claims/:id/withdraw — Warehouse withdraws its own pending claim
router.post('/:id/withdraw', async (req, res) => {
  try {
    if (!['warehouse', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });
    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    if (claim.status !== 'pending_qa')
      return res.status(400).json({ error: 'Only claims pending QA review can be withdrawn' });

    const { rows } = await db.query(`
      UPDATE qc_inspection.defect_claim SET status = 'withdrawn' WHERE claim_id = $1 RETURNING *
    `, [req.params.id]);
    res.json(await loadClaim(rows[0].claim_id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/claims/:id/details — edit report/descriptive fields while the claim is open
const DETAIL_FIELDS = {
  country_of_origin: 'text', trigger_point: 'text', checked_qty: 'int', defect_qty: 'int',
  grn_date: 'date', trigger_date: 'date', qc_done_date: 'date', root_cause_date: 'date',
  description: 'text', rework_scope: 'text', rework_possible: 'bool',
  corrective_action: 'text', preventive_action: 'text', cost_sheet_note: 'text',
};
router.patch('/:id/details', async (req, res) => {
  try {
    if (!['warehouse', 'qa', 'buying', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });
    const claim = await loadClaim(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Not found' });
    if (['closed', 'settled', 'withdrawn'].includes(claim.status))
      return res.status(400).json({ error: 'Cannot edit a closed or withdrawn claim' });

    const sets = [];
    const vals = [];
    for (const [key, type] of Object.entries(DETAIL_FIELDS)) {
      if (!(key in req.body)) continue;
      let v = req.body[key];
      if (type === 'int')  v = (v === '' || v === null || v === undefined) ? null : parseInt(v, 10);
      if (type === 'bool') v = (v === null || v === undefined) ? null : !!v;
      if (type === 'text') v = (v === null || v === undefined || String(v).trim() === '') ? null : String(v).trim();
      if (type === 'date') v = v || null;
      if ((type === 'int') && v !== null && (isNaN(v) || v < 0))
        return res.status(400).json({ error: `${key} must be a non-negative number` });
      vals.push(v);
      sets.push(`${key} = $${vals.length}`);
    }
    if (!sets.length) return res.json(claim);
    vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE qc_inspection.defect_claim SET ${sets.join(', ')} WHERE claim_id = $${vals.length} RETURNING claim_id`,
      vals
    );
    res.json(await loadClaim(rows[0].claim_id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Attachments: defect images + cost sheets ─────────────────────────────────
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    if (!['warehouse', 'qa', 'buying', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const kind = req.body.kind === 'cost_sheet' ? 'cost_sheet' : 'defect_image';
    const { rows } = await db.query(`
      INSERT INTO qc_inspection.defect_claim_attachment
        (claim_id, kind, file_name, file_type, file_size, file_data, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING attachment_id, claim_id, kind, file_name, file_type, file_size, uploaded_at
    `, [req.params.id, kind, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, req.user.user_id]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/attachments', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT attachment_id, claim_id, kind, file_name, file_type, file_size, uploaded_at
       FROM qc_inspection.defect_claim_attachment WHERE claim_id = $1 ORDER BY uploaded_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/attachments/:aid/file', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT file_name, file_type, file_data FROM qc_inspection.defect_claim_attachment
       WHERE attachment_id = $1 AND claim_id = $2`,
      [req.params.aid, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.set('Content-Type', rows[0].file_type);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(rows[0].file_data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/attachments/:aid', async (req, res) => {
  try {
    if (!['warehouse', 'qa', 'buying', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Access denied' });
    await db.query(
      `DELETE FROM qc_inspection.defect_claim_attachment WHERE attachment_id = $1 AND claim_id = $2`,
      [req.params.aid, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
