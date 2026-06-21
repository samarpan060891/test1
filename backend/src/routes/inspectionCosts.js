const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const router = express.Router();
router.use(authenticate);

// Helper: get emails for QA and Buying teams
async function getInternalTeamEmails() {
  const qa = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'qa' AND email IS NOT NULL");
  const buying = await db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'buying' AND email IS NOT NULL");
  return {
    qaEmails: qa.rows.map(u => u.email),
    buyingEmails: buying.rows.map(u => u.email),
  };
}

// Helper: get agency emails + first linked job_id for an advice
async function getAdviceContext(adviceId) {
  const r = await db.query(
    `SELECT a.advice_ref, a.agency_code, a.total_cost, a.currency, a.cost_bearer,
            ag.name AS agency_name, ag.contact_emails AS agency_emails,
            MIN(ij.job_id) AS first_job_id
     FROM qc_inspection.inspection_charges_advice a
     JOIN qc_inspection.quality_agency_master ag USING (agency_code)
     LEFT JOIN qc_inspection.ica_jobs ij ON ij.advice_id = a.advice_id
     WHERE a.advice_id = $1
     GROUP BY a.advice_id, ag.name, ag.contact_emails`,
    [adviceId]
  );
  return r.rows[0] || null;
}

// ── CONTRACTS ────────────────────────────────────────────────────────────────

router.get('/contracts', async (req, res) => {
  const { role, agency_code } = req.user;
  try {
    let q = `SELECT c.*, a.name AS agency_name
             FROM qc_inspection.agency_contract c
             JOIN qc_inspection.quality_agency_master a USING (agency_code)`;
    const params = [];
    if (role === 'agency_user') { q += ' WHERE c.agency_code = $1'; params.push(agency_code); }
    q += ' ORDER BY c.created_at DESC';
    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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

router.get('/', async (req, res) => {
  const { role, agency_code } = req.user;
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
                   'item_name', im.name, 'inspection_date', j.inspection_date
                 )
               ) FILTER (WHERE j.job_id IS NOT NULL), '[]'
             ) AS jobs
      FROM qc_inspection.inspection_charges_advice a
      JOIN qc_inspection.quality_agency_master ag USING (agency_code)
      JOIN qc_inspection.team_stakeholder creator ON creator.user_id = a.created_by
      LEFT JOIN qc_inspection.team_stakeholder qa_u ON qa_u.user_id = a.qa_user_id
      LEFT JOIN qc_inspection.team_stakeholder buy_u ON buy_u.user_id = a.buying_user_id
      LEFT JOIN qc_inspection.ica_jobs ij ON ij.advice_id = a.advice_id
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
      LEFT JOIN qc_inspection.item_master im ON im.item_code = j.item_code`;

    const params = [];
    if (role === 'agency_user') {
      q += ' WHERE a.agency_code = $1';
      params.push(agency_code);
    } else if (role === 'supplier_user') {
      q += ` WHERE a.cost_bearer = 'supplier'
             AND EXISTS (
               SELECT 1 FROM qc_inspection.ica_jobs ij2
               JOIN qc_inspection.inspection_job j2 ON j2.job_id = ij2.job_id
               WHERE ij2.advice_id = a.advice_id AND j2.supplier_code = $1
             )`;
      params.push(req.user.supplier_code);
    }
    q += ' GROUP BY a.advice_id, ag.name, creator.name, qa_u.name, buy_u.name ORDER BY a.created_at DESC';

    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
                   'item_name', im.name, 'inspection_date', j.inspection_date,
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
      LEFT JOIN qc_inspection.item_master im ON im.item_code = j.item_code
      WHERE a.advice_id = $1
      GROUP BY a.advice_id, ag.name, creator.name, qa_u.name, buy_u.name, rej_u.name`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Advice not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — agency raises a new charges advice
// Notifies: QA + Buying
router.post('/', authorize('agency_user'), async (req, res) => {
  const { job_ids, rate_type, rate_value, num_mandays, travel_allowance, stay_allowance, currency, contract_id, notes } = req.body;
  if (!job_ids || !job_ids.length) return res.status(400).json({ error: 'At least one job is required' });
  if (!rate_type || !rate_value) return res.status(400).json({ error: 'rate_type and rate_value are required' });
  if (rate_type === 'manday' && !num_mandays) return res.status(400).json({ error: 'num_mandays is required for manday rate type' });

  try {
    const jobCheck = await db.query(
      `SELECT job_id, inspection_type, parent_job_id FROM qc_inspection.inspection_job WHERE job_id = ANY($1::uuid[])`,
      [job_ids]
    );
    const selfJobs = jobCheck.rows.filter(j => j.inspection_type === 'self');
    if (selfJobs.length > 0) return res.status(400).json({ error: 'Self-inspection jobs cannot have charges. Please deselect them.' });

    const hasReinspection = jobCheck.rows.some(j => j.parent_job_id != null);
    const cost_bearer = hasReinspection ? 'supplier' : 'homes_r_us';

    let total_cost = 0;
    let po_value = null;

    if (rate_type === 'manday') {
      total_cost = (parseFloat(rate_value) * parseFloat(num_mandays)) +
                   parseFloat(travel_allowance || 0) +
                   parseFloat(stay_allowance || 0);
    } else {
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

    for (const job_id of job_ids) {
      await db.query(
        'INSERT INTO qc_inspection.ica_jobs (advice_id, job_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [advice.advice_id, job_id]
      );
    }

    // Notify QA + Buying that a new charges advice has been raised
    const ctx = await getAdviceContext(advice.advice_id);
    const { qaEmails, buyingEmails } = await getInternalTeamEmails();
    const agencyName = ctx?.agency_name || req.user.agency_code;
    const msg = `${agencyName} has submitted an inspection charges advice (${advice.advice_ref || advice.advice_id.slice(0,8)}) for ${advice.currency} ${parseFloat(advice.total_cost).toFixed(2)}. Pending QA approval.`;

    sendNotification(ctx?.first_job_id || null, 'CHARGES_SUBMITTED', 'qa', qaEmails, msg);
    sendNotification(ctx?.first_job_id || null, 'CHARGES_SUBMITTED', 'buying', buyingEmails, msg);

    res.status(201).json(advice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/approve — QA or Buying approves
// QA approves → notifies Buying (their turn) + agency
// Buying approves → notifies agency (fully approved)
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

      // Notify Buying (needs their approval) + Agency (progress update)
      const ctx = await getAdviceContext(req.params.id);
      const { buyingEmails } = await getInternalTeamEmails();
      const agencyEmails = ctx?.agency_emails || [];
      const ref = advice.advice_ref || advice.advice_id.slice(0, 8);
      sendNotification(ctx?.first_job_id || null, 'CHARGES_QA_APPROVED', 'buying', buyingEmails,
        `Inspection charges advice ${ref} has been approved by QA and is now pending your (Buying) approval.`);
      sendNotification(ctx?.first_job_id || null, 'CHARGES_QA_APPROVED', 'agency_user', agencyEmails,
        `Your inspection charges advice ${ref} has been approved by QA and is now pending Buying approval.`);

    } else {
      if (advice.status !== 'pending_buying') return res.status(400).json({ error: 'Not pending Buying approval' });
      update = await db.query(
        `UPDATE qc_inspection.inspection_charges_advice
         SET status = 'approved', buying_user_id = $1, buying_approved_at = NOW(), buying_notes = $2
         WHERE advice_id = $3 RETURNING *`,
        [user_id, notes || null, req.params.id]
      );

      // Notify Agency (fully approved) + supplier if cost_bearer = supplier
      const ctx = await getAdviceContext(req.params.id);
      const agencyEmails = ctx?.agency_emails || [];
      const ref = advice.advice_ref || advice.advice_id.slice(0, 8);
      const amt = `${advice.currency} ${parseFloat(advice.total_cost).toFixed(2)}`;
      sendNotification(ctx?.first_job_id || null, 'CHARGES_APPROVED', 'agency_user', agencyEmails,
        `Your inspection charges advice ${ref} for ${amt} has been fully approved by Buying.`);

      if (advice.cost_bearer === 'supplier') {
        // Get supplier email via linked jobs
        const suppRes = await db.query(
          `SELECT DISTINCT s.contact_email
           FROM qc_inspection.ica_jobs ij
           JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
           JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
           WHERE ij.advice_id = $1`,
          [req.params.id]
        );
        const supplierEmails = suppRes.rows.map(r => r.contact_email).filter(Boolean);
        sendNotification(ctx?.first_job_id || null, 'CHARGES_APPROVED', 'supplier_user', supplierEmails,
          `An inspection charges advice ${ref} for ${amt} that you are liable for has been approved.`);
      }
    }

    res.json(update.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/reject — QA or Buying rejects
// Notifies: agency + other internal role
router.put('/:id/reject', authorize('qa', 'buying'), async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });
  const { role } = req.user;
  try {
    const r = await db.query(
      `UPDATE qc_inspection.inspection_charges_advice
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2
       WHERE advice_id = $3 AND status NOT IN ('approved','rejected') RETURNING *`,
      [req.user.user_id, reason, req.params.id]
    );
    if (r.rows.length === 0) return res.status(400).json({ error: 'Cannot reject — advice not found or already finalised' });
    const advice = r.rows[0];

    // Notify agency of rejection
    const ctx = await getAdviceContext(req.params.id);
    const agencyEmails = ctx?.agency_emails || [];
    const { qaEmails, buyingEmails } = await getInternalTeamEmails();
    const ref = advice.advice_ref || advice.advice_id.slice(0, 8);
    const rejectedBy = role === 'qa' ? 'QA' : 'Buying';
    const msg = `Your inspection charges advice ${ref} has been rejected by ${rejectedBy}. Reason: ${reason}`;

    sendNotification(ctx?.first_job_id || null, 'CHARGES_REJECTED', 'agency_user', agencyEmails, msg);
    // Also notify the other internal team
    if (role === 'qa') {
      sendNotification(ctx?.first_job_id || null, 'CHARGES_REJECTED', 'buying', buyingEmails,
        `Inspection charges advice ${ref} was rejected by QA. Reason: ${reason}`);
    } else {
      sendNotification(ctx?.first_job_id || null, 'CHARGES_REJECTED', 'qa', qaEmails,
        `Inspection charges advice ${ref} was rejected by Buying. Reason: ${reason}`);
    }

    res.json(advice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
