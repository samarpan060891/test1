const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── CONTRACTS (standard rates per agency) ────────────────────────────────────

// GET /inspection-costs/contracts — qa/buying/admin see all; agency sees own
router.get('/contracts', async (req, res) => {
  const { role, agency_code } = req.user;
  try {
    let q = `SELECT c.*, a.name AS agency_name
             FROM qc_inspection.agency_contract c
             JOIN qc_inspection.quality_agency_master a USING (agency_code)`;
    const params = [];
    if (role === 'agency_user') {
      q += ' WHERE c.agency_code = $1';
      params.push(agency_code);
    }
    q += ' ORDER BY c.created_at DESC';
    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /inspection-costs/contracts — qa/buying/admin create contracts
router.post('/contracts', authorize('qa', 'buying', 'admin'), async (req, res) => {
  const { agency_code, contract_name, rate_type, rate_value, travel_allowance, stay_allowance_per_day, currency, valid_from, valid_to, notes } = req.body;
  if (!agency_code || !rate_type || !rate_value)
    return res.status(400).json({ error: 'agency_code, rate_type and rate_value are required' });
  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.agency_contract
         (agency_code, contract_name, rate_type, rate_value, travel_allowance, stay_allowance_per_day, currency, valid_from, valid_to, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [agency_code, contract_name || 'Standard Rate', rate_type, rate_value,
       travel_allowance || 0, stay_allowance_per_day || 0,
       currency || 'USD', valid_from || null, valid_to || null, notes || null, req.user.user_id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CHARGES ADVICE ────────────────────────────────────────────────────────────

// GET /inspection-costs — list advices (filtered by role)
router.get('/', async (req, res) => {
  const { role, agency_code, user_id } = req.user;
  try {
    let q = `
      SELECT a.*,
             ag.name AS agency_name,
             creator.name AS created_by_name,
             qa_u.name AS qa_user_name,
             buy_u.name AS buying_user_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'job_id', j.job_id, 'job_ref', j.job_ref,
                   'po_no', j.po_no, 'supplier_code', j.supplier_code,
                   'item_name', j.item_name, 'inspection_date', j.inspection_date
                 )
               ) FILTER (WHERE j.job_id IS NOT NULL), '[]'
             ) AS jobs
      FROM qc_inspection.inspection_charges_advice a
      JOIN qc_inspection.quality_agency_master ag USING (agency_code)
      JOIN qc_inspection.team_stakeholder creator ON creator.user_id = a.created_by
      LEFT JOIN qc_inspection.team_stakeholder qa_u ON qa_u.user_id = a.qa_user_id
      LEFT JOIN qc_inspection.team_stakeholder buy_u ON buy_u.user_id = a.buying_user_id
      LEFT JOIN qc_inspection.ica_jobs ij ON ij.advice_id = a.advice_id
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id`;

    const params = [];
    if (role === 'agency_user') {
      q += ' WHERE a.agency_code = $1';
      params.push(agency_code);
    }
    q += ' GROUP BY a.advice_id, ag.name, creator.name, qa_u.name, buy_u.name ORDER BY a.created_at DESC';

    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /inspection-costs/:id — single advice detail
router.get('/:id', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT a.*,
             ag.name AS agency_name,
             creator.name AS created_by_name,
             qa_u.name AS qa_user_name,
             buy_u.name AS buying_user_name,
             rej_u.name AS rejected_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'job_id', j.job_id, 'job_ref', j.job_ref,
                   'po_no', j.po_no, 'supplier_code', j.supplier_code,
                   'item_name', j.item_name, 'inspection_date', j.inspection_date,
                   'quantity', j.quantity
                 )
               ) FILTER (WHERE j.job_id IS NOT NULL), '[]'
             ) AS jobs
      FROM qc_inspection.inspection_charges_advice a
      JOIN qc_inspection.quality_agency_master ag USING (agency_code)
      JOIN qc_inspection.team_stakeholder creator ON creator.user_id = a.created_by
      LEFT JOIN qc_inspection.team_stakeholder qa_u ON qa_u.user_id = a.qa_user_id
      LEFT JOIN qc_inspection.team_stakeholder buy_u ON buy_u.user_id = a.buying_user_id
      LEFT JOIN qc_inspection.team_stakeholder rej_u ON rej_u.user_id = a.rejected_by
      LEFT JOIN qc_inspection.ica_jobs ij ON ij.advice_id = a.advice_id
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
      WHERE a.advice_id = $1
      GROUP BY a.advice_id, ag.name, creator.name, qa_u.name, buy_u.name, rej_u.name`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Advice not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /inspection-costs — agency creates advice
router.post('/', authorize('agency_user'), async (req, res) => {
  const { job_ids, rate_type, rate_value, num_mandays, travel_allowance, stay_allowance, currency, contract_id, notes } = req.body;
  if (!job_ids || !job_ids.length) return res.status(400).json({ error: 'At least one job is required' });
  if (!rate_type || !rate_value) return res.status(400).json({ error: 'rate_type and rate_value are required' });
  if (rate_type === 'manday' && !num_mandays) return res.status(400).json({ error: 'num_mandays is required for manday rate type' });

  try {
    // Validate jobs — reject self-inspection jobs (no charges applicable)
    const jobCheck = await db.query(
      `SELECT job_id, inspection_type, parent_job_id FROM qc_inspection.inspection_job WHERE job_id = ANY($1::uuid[])`,
      [job_ids]
    );
    const selfJobs = jobCheck.rows.filter(j => j.inspection_type === 'self');
    if (selfJobs.length > 0) return res.status(400).json({ error: 'Self-inspection jobs cannot have charges. Please deselect them.' });

    // Determine cost bearer — if any job is a re-inspection (has parent_job_id), supplier bears cost
    const hasReinspection = jobCheck.rows.some(j => j.parent_job_id != null);
    const cost_bearer = hasReinspection ? 'supplier' : 'homes_r_us';

    // Calculate total cost
    let total_cost = 0;
    let po_value = null;

    if (rate_type === 'manday') {
      total_cost = (parseFloat(rate_value) * parseFloat(num_mandays)) +
                   parseFloat(travel_allowance || 0) +
                   parseFloat(stay_allowance || 0);
    } else {
      // percentage — sum PO quantities × need PO value from jobs
      const poRes = await db.query(
        `SELECT COALESCE(SUM(pm.quantity * 1), 0) AS total_qty
         FROM qc_inspection.inspection_job j
         LEFT JOIN qc_inspection.po_master pm ON pm.po_no = j.po_no
         WHERE j.job_id = ANY($1::uuid[])`,
        [job_ids]
      );
      po_value = parseFloat(poRes.rows[0].total_qty) || 0;
      total_cost = (po_value * parseFloat(rate_value)) / 100;
    }

    const r = await db.query(
      `INSERT INTO qc_inspection.inspection_charges_advice
         (agency_code, contract_id, rate_type, rate_value, num_mandays, travel_allowance, stay_allowance,
          currency, po_value, total_cost, cost_bearer, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.agency_code, contract_id || null, rate_type, rate_value, num_mandays || null,
       travel_allowance || 0, stay_allowance || 0, currency || 'USD',
       po_value, total_cost, cost_bearer, notes || null, req.user.user_id]
    );
    const advice = r.rows[0];

    // Link jobs
    for (const job_id of job_ids) {
      await db.query(
        'INSERT INTO qc_inspection.ica_jobs (advice_id, job_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [advice.advice_id, job_id]
      );
    }

    res.status(201).json(advice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /inspection-costs/:id/approve — QA or Buying approves
router.put('/:id/approve', authorize('qa', 'buying'), async (req, res) => {
  const { notes } = req.body;
  const { role, user_id } = req.user;
  try {
    const cur = await db.query('SELECT * FROM qc_inspection.inspection_charges_advice WHERE advice_id = $1', [req.params.id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Advice not found' });
    const advice = cur.rows[0];

    if (advice.status === 'rejected') return res.status(400).json({ error: 'Advice is already rejected' });
    if (advice.status === 'approved') return res.status(400).json({ error: 'Advice is already approved' });

    let update;
    if (role === 'qa') {
      if (advice.status !== 'pending_qa') return res.status(400).json({ error: 'Not pending QA approval' });
      update = await db.query(
        `UPDATE qc_inspection.inspection_charges_advice
         SET status = 'pending_buying', qa_user_id = $1, qa_approved_at = NOW(), qa_notes = $2
         WHERE advice_id = $3 RETURNING *`,
        [user_id, notes || null, req.params.id]
      );
    } else {
      if (advice.status !== 'pending_buying') return res.status(400).json({ error: 'Not pending Buying approval' });
      update = await db.query(
        `UPDATE qc_inspection.inspection_charges_advice
         SET status = 'approved', buying_user_id = $1, buying_approved_at = NOW(), buying_notes = $2
         WHERE advice_id = $3 RETURNING *`,
        [user_id, notes || null, req.params.id]
      );
    }
    res.json(update.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /inspection-costs/:id/reject — QA or Buying rejects
router.put('/:id/reject', authorize('qa', 'buying'), async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });
  try {
    const r = await db.query(
      `UPDATE qc_inspection.inspection_charges_advice
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2
       WHERE advice_id = $3 AND status NOT IN ('approved','rejected') RETURNING *`,
      [req.user.user_id, reason, req.params.id]
    );
    if (r.rows.length === 0) return res.status(400).json({ error: 'Cannot reject — advice not found or already finalised' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
