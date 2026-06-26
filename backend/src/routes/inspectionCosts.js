const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, JPG, PNG files are allowed'));
  },
});

const router = express.Router();
router.use(authenticate);

// Helper: get emails for internal teams
async function getInternalTeamEmails() {
  const [qa, buying, imports, accounts] = await Promise.all([
    db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'qa' AND email IS NOT NULL"),
    db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'buying' AND email IS NOT NULL"),
    db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'imports' AND email IS NOT NULL"),
    db.query("SELECT email FROM qc_inspection.team_stakeholder WHERE role = 'accounts' AND email IS NOT NULL"),
  ]);
  return {
    qaEmails: qa.rows.map(u => u.email),
    buyingEmails: buying.rows.map(u => u.email),
    importsEmails: imports.rows.map(u => u.email),
    accountsEmails: accounts.rows.map(u => u.email),
  };
}

// Helper: get agency emails + first linked job_id for an advice
async function getAdviceContext(adviceId) {
  const r = await db.query(
    `SELECT a.advice_ref, a.advice_id, a.agency_code, a.total_cost, a.currency, a.cost_bearer,
            ag.name AS agency_name, ag.contact_emails AS agency_emails,
            (SELECT ij2.job_id FROM qc_inspection.ica_jobs ij2 WHERE ij2.advice_id = a.advice_id LIMIT 1) AS first_job_id
     FROM qc_inspection.inspection_charges_advice a
     JOIN qc_inspection.quality_agency_master ag USING (agency_code)
     WHERE a.advice_id = $1`,
    [adviceId]
  );
  return r.rows[0] || null;
}

// ── CONTRACTS ────────────────────────────────────────────────────────────────

router.get('/contracts/by-agency/:agency_code', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM qc_inspection.agency_contract WHERE agency_code = $1 ORDER BY created_at DESC`,
      [req.params.agency_code]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
             imp_u.name AS imports_user_name,
             acc_u.name AS accounts_user_name,
             rej_u.name AS rejected_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'job_id', j.job_id, 'job_ref', j.job_ref,
                   'po_no', j.po_no, 'supplier_code', j.supplier_code,
                   'item_name', im.name, 'inspection_date', j.inspection_date,
                   'status', j.status, 'result', j.result,
                   'contract_name', ac.contract_name
                 )
               ) FILTER (WHERE j.job_id IS NOT NULL), '[]'
             ) AS jobs,
             (SELECT ac2.contract_name FROM qc_inspection.agency_contract ac2
              JOIN qc_inspection.inspection_job j2 ON j2.contract_id = ac2.contract_id
              JOIN qc_inspection.ica_jobs ij2 ON ij2.job_id = j2.job_id AND ij2.advice_id = a.advice_id
              LIMIT 1) AS contract_name
      FROM qc_inspection.inspection_charges_advice a
      JOIN qc_inspection.quality_agency_master ag USING (agency_code)
      JOIN qc_inspection.team_stakeholder creator ON creator.user_id = a.created_by
      LEFT JOIN qc_inspection.team_stakeholder qa_u ON qa_u.user_id = a.qa_user_id
      LEFT JOIN qc_inspection.team_stakeholder buy_u ON buy_u.user_id = a.buying_user_id
      LEFT JOIN qc_inspection.team_stakeholder imp_u ON imp_u.user_id = a.imports_user_id
      LEFT JOIN qc_inspection.team_stakeholder acc_u ON acc_u.user_id = a.accounts_user_id
      LEFT JOIN qc_inspection.team_stakeholder rej_u ON rej_u.user_id = a.rejected_by
      LEFT JOIN qc_inspection.ica_jobs ij ON ij.advice_id = a.advice_id
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
      LEFT JOIN qc_inspection.item_master im ON im.item_code = j.item_code
      LEFT JOIN qc_inspection.agency_contract ac ON ac.contract_id = j.contract_id`;

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
    q += ' GROUP BY a.advice_id, ag.name, creator.name, qa_u.name, buy_u.name, imp_u.name, acc_u.name, rej_u.name ORDER BY a.created_at DESC';
    // Note: contract_name uses a correlated subquery so no GROUP BY needed for it

    const r = await db.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error('[GET /inspection-costs] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT a.*,
             ag.name AS agency_name,
             creator.name AS created_by_name,
             qa_u.name AS qa_user_name,
             buy_u.name AS buying_user_name,
             imp_u.name AS imports_user_name,
             acc_u.name AS accounts_user_name,
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
      LEFT JOIN qc_inspection.team_stakeholder imp_u ON imp_u.user_id = a.imports_user_id
      LEFT JOIN qc_inspection.team_stakeholder acc_u ON acc_u.user_id = a.accounts_user_id
      LEFT JOIN qc_inspection.team_stakeholder rej_u ON rej_u.user_id = a.rejected_by
      LEFT JOIN qc_inspection.ica_jobs ij ON ij.advice_id = a.advice_id
      LEFT JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
      LEFT JOIN qc_inspection.item_master im ON im.item_code = j.item_code
      WHERE a.advice_id = $1
      GROUP BY a.advice_id, ag.name, creator.name, qa_u.name, buy_u.name, imp_u.name, acc_u.name, rej_u.name`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Advice not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST — agency raises a new charges advice (multipart: invoice file mandatory)
router.post('/', authorize('agency_user'), upload.single('invoice'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Agency invoice is required. Please upload the invoice (PDF/JPG/PNG).' });

  // Fields come as form-data strings; job_ids is JSON-encoded array
  const { rate_type, rate_value, num_mandays, travel_allowance, stay_allowance, currency, contract_id, notes } = req.body;
  const job_ids = typeof req.body.job_ids === 'string' ? JSON.parse(req.body.job_ids) : req.body.job_ids;

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

    // Fetch PO value: use quantity * unit_price; if unit_price is 0, try po_master.total_value fallback
    const poRes = await db.query(
      `SELECT COALESCE(SUM(
         CASE WHEN pm.unit_price > 0
           THEN pm.quantity * pm.unit_price
           ELSE COALESCE(pm.total_value, 0)
         END
       ), 0) AS total_po_value
       FROM qc_inspection.inspection_job j
       LEFT JOIN qc_inspection.po_master pm ON pm.po_no = j.po_no
       WHERE j.job_id = ANY($1::uuid[])`,
      [job_ids]
    );
    po_value = parseFloat(poRes.rows[0].total_po_value) || 0;

    if (rate_type === 'manday') {
      total_cost = (parseFloat(rate_value) * parseFloat(num_mandays)) +
                   parseFloat(travel_allowance || 0) +
                   parseFloat(stay_allowance || 0);
    } else {
      total_cost = (po_value * parseFloat(rate_value)) / 100;
    }

    const r = await db.query(
      `INSERT INTO qc_inspection.inspection_charges_advice
         (agency_code, contract_id, rate_type, rate_value, num_mandays, travel_allowance, stay_allowance,
          currency, po_value, total_cost, cost_bearer, notes, created_by,
          invoice_file_name, invoice_file_data, invoice_file_type, invoice_uploaded_at, invoice_uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$13) RETURNING *`,
      [req.user.agency_code, contract_id || null, rate_type, rate_value, num_mandays || null,
       travel_allowance || 0, stay_allowance || 0, currency || 'USD',
       po_value, total_cost, cost_bearer, notes || null, req.user.user_id,
       req.file.originalname, req.file.buffer, req.file.mimetype]
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
    const jobCount = job_ids.length;
    const msg = JSON.stringify({
      ref: advice.advice_ref || advice.advice_id.slice(0, 8),
      agency: agencyName,
      amt: parseFloat(advice.total_cost).toFixed(2),
      currency: advice.currency,
      job_count: jobCount,
      submitted_by: req.user.name || req.user.email,
    });

    sendNotification(ctx?.first_job_id || null, 'CHARGES_SUBMITTED', 'qa', qaEmails, msg, ctx?.advice_id || null);
    sendNotification(ctx?.first_job_id || null, 'CHARGES_SUBMITTED', 'buying', buyingEmails, msg, ctx?.advice_id || null);

    res.status(201).json(advice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/approve — multi-step: QA → Buying → Imports → Accounts (paid)
router.put('/:id/approve', authorize('qa', 'buying', 'imports', 'accounts'), async (req, res) => {
  const { notes } = req.body;
  const { role, user_id } = req.user;
  try {
    const cur = await db.query('SELECT * FROM qc_inspection.inspection_charges_advice WHERE advice_id = $1', [req.params.id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Advice not found' });
    const advice = cur.rows[0];

    if (advice.status === 'rejected') return res.status(400).json({ error: 'Advice is already rejected' });
    if (advice.status === 'paid') return res.status(400).json({ error: 'Advice is already paid' });

    const ctx = await getAdviceContext(req.params.id);
    const { qaEmails, buyingEmails, importsEmails, accountsEmails } = await getInternalTeamEmails();
    const agencyEmails = ctx?.agency_emails || [];
    const ref = advice.advice_ref || advice.advice_id.slice(0, 8);
    const approverName = req.user.name || req.user.email;

    const chargesMsg = (extra = {}) => JSON.stringify({
      ref,
      agency: ctx?.agency_name || advice.agency_code,
      amt: parseFloat(advice.total_cost).toFixed(2),
      currency: advice.currency,
      approved_by: approverName,
      notes: notes || null,
      ...extra,
    });

    let update;

    if (role === 'qa') {
      if (advice.status !== 'pending_qa') return res.status(400).json({ error: 'Not pending QA approval' });
      update = await db.query(
        `UPDATE qc_inspection.inspection_charges_advice
         SET status = 'pending_buying', qa_user_id = $1, qa_approved_at = NOW(), qa_notes = $2
         WHERE advice_id = $3 RETURNING *`,
        [user_id, notes || null, req.params.id]
      );
      sendNotification(ctx?.first_job_id || null, 'CHARGES_QA_APPROVED', 'buying', buyingEmails, chargesMsg(), ctx?.advice_id || null);
      sendNotification(ctx?.first_job_id || null, 'CHARGES_QA_APPROVED', 'agency_user', agencyEmails, chargesMsg(), ctx?.advice_id || null);

    } else if (role === 'buying') {
      if (advice.status !== 'pending_buying') return res.status(400).json({ error: 'Not pending Buying approval' });
      update = await db.query(
        `UPDATE qc_inspection.inspection_charges_advice
         SET status = 'pending_imports', buying_user_id = $1, buying_approved_at = NOW(), buying_notes = $2
         WHERE advice_id = $3 RETURNING *`,
        [user_id, notes || null, req.params.id]
      );
      sendNotification(ctx?.first_job_id || null, 'CHARGES_BUYING_APPROVED', 'imports', importsEmails, chargesMsg(), ctx?.advice_id || null);
      sendNotification(ctx?.first_job_id || null, 'CHARGES_BUYING_APPROVED', 'agency_user', agencyEmails, chargesMsg(), ctx?.advice_id || null);

    } else if (role === 'imports') {
      if (advice.status !== 'pending_imports') return res.status(400).json({ error: 'Not pending Imports approval' });
      update = await db.query(
        `UPDATE qc_inspection.inspection_charges_advice
         SET status = 'pending_accounts', imports_user_id = $1, imports_approved_at = NOW(), imports_notes = $2
         WHERE advice_id = $3 RETURNING *`,
        [user_id, notes || null, req.params.id]
      );
      sendNotification(ctx?.first_job_id || null, 'CHARGES_IMPORTS_APPROVED', 'accounts', accountsEmails, chargesMsg(), ctx?.advice_id || null);
      sendNotification(ctx?.first_job_id || null, 'CHARGES_IMPORTS_APPROVED', 'agency_user', agencyEmails, chargesMsg(), ctx?.advice_id || null);

    } else if (role === 'accounts') {
      if (advice.status !== 'pending_accounts') return res.status(400).json({ error: 'Not pending Accounts payment' });
      update = await db.query(
        `UPDATE qc_inspection.inspection_charges_advice
         SET status = 'paid', accounts_user_id = $1, accounts_approved_at = NOW(), accounts_notes = $2
         WHERE advice_id = $3 RETURNING *`,
        [user_id, notes || null, req.params.id]
      );
      sendNotification(ctx?.first_job_id || null, 'CHARGES_PAID', 'agency_user', agencyEmails, chargesMsg(), ctx?.advice_id || null);
      sendNotification(ctx?.first_job_id || null, 'CHARGES_PAID', 'buying', buyingEmails, chargesMsg(), ctx?.advice_id || null);
    }

    res.json(update.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /:id/reject — any approver in the chain can reject
router.put('/:id/reject', authorize('qa', 'buying', 'imports', 'accounts'), async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });
  const { role } = req.user;
  try {
    const r = await db.query(
      `UPDATE qc_inspection.inspection_charges_advice
       SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2
       WHERE advice_id = $3 AND status NOT IN ('paid','rejected') RETURNING *`,
      [req.user.user_id, reason, req.params.id]
    );
    if (r.rows.length === 0) return res.status(400).json({ error: 'Cannot reject — advice not found or already finalised' });
    const advice = r.rows[0];

    const ctx = await getAdviceContext(req.params.id);
    const agencyEmails = ctx?.agency_emails || [];
    const { qaEmails, buyingEmails, importsEmails, accountsEmails } = await getInternalTeamEmails();
    const ref = advice.advice_ref || advice.advice_id.slice(0, 8);
    const rejectedByName = req.user.name || req.user.email;
    const rejectMsg = JSON.stringify({
      ref,
      agency: ctx?.agency_name || advice.agency_code,
      amt: parseFloat(advice.total_cost).toFixed(2),
      currency: advice.currency,
      rejected_by: rejectedByName,
      reason,
    });
    sendNotification(ctx?.first_job_id || null, 'CHARGES_REJECTED', 'agency_user', agencyEmails, rejectMsg, ctx?.advice_id || null);
    const allInternal = [...new Set([...qaEmails, ...buyingEmails, ...importsEmails, ...accountsEmails])];
    sendNotification(ctx?.first_job_id || null, 'CHARGES_REJECTED', 'qa', allInternal, rejectMsg, ctx?.advice_id || null);

    res.json(advice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /:id/invoice — admin/qa can replace invoice if needed (agency uploads at creation)
router.post('/:id/invoice', authorize('admin', 'qa'), upload.single('invoice'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const r = await db.query(
      `UPDATE qc_inspection.inspection_charges_advice
       SET invoice_file_name = $1, invoice_file_data = $2, invoice_file_type = $3,
           invoice_uploaded_at = NOW(), invoice_uploaded_by = $4
       WHERE advice_id = $5 RETURNING advice_id, invoice_file_name, invoice_uploaded_at`,
      [req.file.originalname, req.file.buffer, req.file.mimetype, req.user.user_id, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Advice not found' });
    res.json({ message: 'Invoice uploaded', ...r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /:id/invoice — download the uploaded invoice
router.get('/:id/invoice', authenticate, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT invoice_file_name, invoice_file_data, invoice_file_type FROM qc_inspection.inspection_charges_advice WHERE advice_id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0 || !r.rows[0].invoice_file_data)
      return res.status(404).json({ error: 'No invoice found' });
    const { invoice_file_name, invoice_file_data, invoice_file_type } = r.rows[0];
    res.setHeader('Content-Type', invoice_file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${invoice_file_name}"`);
    res.send(invoice_file_data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
