const express = require('express')
const XLSX = require('xlsx')
const db = require('../db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

const SEED_COMPLAINTS = [
  { complaint_ref: 'CMP-001', days_ago: 320, customer_name: 'Homebase UK', description: 'Product paint finish peeling off after 3 months of use', severity: 'high', status: 'resolved', resolution: 'Supplier updated coating process; new batch tested and confirmed pass' },
  { complaint_ref: 'CMP-002', days_ago: 280, customer_name: 'B&Q Retail', description: 'Packaging damaged in transit causing product scratches on 12% of units', severity: 'medium', status: 'resolved', resolution: 'Improved inner foam padding spec; added to packing checklist' },
  { complaint_ref: 'CMP-003', days_ago: 200, customer_name: 'Next Home', description: 'Assembly instructions unclear — missing step 4 diagram entirely', severity: 'low', status: 'closed', resolution: 'Instruction manual revised; digital version added to QR code on box' },
  { complaint_ref: 'CMP-004', days_ago: 150, customer_name: 'Dunelm Ltd', description: 'Product dimensions 5mm shorter than stated spec on all units in order', severity: 'critical', status: 'resolved', resolution: 'Full recall of affected batch; factory tooling corrected and re-validated' },
  { complaint_ref: 'CMP-005', days_ago: 90, customer_name: 'TK Maxx UK', description: 'Colour variation between units — inconsistent dye lot', severity: 'medium', status: 'investigating', resolution: null },
  { complaint_ref: 'CMP-006', days_ago: 45, customer_name: 'Wayfair EU', description: 'Label artwork shows wrong country of origin — states China instead of Vietnam', severity: 'high', status: 'open', resolution: null },
  { complaint_ref: 'CMP-007', days_ago: 20, customer_name: 'John Lewis', description: 'Two units per display carton missing screws in accessory bag', severity: 'medium', status: 'open', resolution: null },
]

const SEED_CLAIMS = [
  { claim_ref: 'CLM-001', days_ago: 300, customer_name: 'Homebase UK', reason: 'Full return of defective batch — paint finish failure, 480 units', claim_amount: 14400.00, status: 'settled', resolution: 'Supplier credited 80% of invoice; 20% offset against replacement shipment' },
  { claim_ref: 'CLM-002', days_ago: 240, customer_name: 'B&Q Retail', reason: 'Markdown allowance — damaged packaging, 200 units sold at discount', claim_amount: 3200.00, status: 'approved', resolution: 'Credit note issued; agreed as one-time allowance' },
  { claim_ref: 'CLM-003', days_ago: 180, customer_name: 'Dunelm Ltd', reason: 'Recall logistics — returning undersized units from 6 stores', claim_amount: 8750.00, status: 'under_review', resolution: null },
  { claim_ref: 'CLM-004', days_ago: 120, customer_name: 'Next Home', reason: 'Labour cost for re-packing 1200 units with corrected instruction manuals', claim_amount: 2100.00, status: 'approved', resolution: 'Supplier agreed; credit applied to next PO' },
  { claim_ref: 'CLM-005', days_ago: 60, customer_name: 'TK Maxx UK', reason: 'Price reduction allowance on colour-inconsistent stock', claim_amount: 5600.00, status: 'open', resolution: null },
  { claim_ref: 'CLM-006', days_ago: 30, customer_name: 'Wayfair EU', reason: 'Re-labelling cost for 800 units — wrong country of origin on label', claim_amount: 960.00, status: 'open', resolution: null },
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function pick(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n)
}

async function ensureTablesAndSeed() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS qc_inspection.customer_complaints (
      id SERIAL PRIMARY KEY,
      item_code TEXT NOT NULL,
      complaint_ref TEXT,
      complaint_date DATE,
      customer_name TEXT,
      description TEXT,
      severity TEXT CHECK (severity IN ('low','medium','high','critical')),
      status TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
      resolution TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS qc_inspection.item_claims (
      id SERIAL PRIMARY KEY,
      item_code TEXT NOT NULL,
      claim_ref TEXT,
      claim_date DATE,
      customer_name TEXT,
      reason TEXT,
      claim_amount NUMERIC(12,2),
      status TEXT DEFAULT 'open' CHECK (status IN ('open','under_review','approved','rejected','settled')),
      resolution TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)

  // Seed dummy data only if tables are empty
  const { rows: [{ count }] } = await db.query(`SELECT COUNT(*) FROM qc_inspection.customer_complaints`)
  if (Number(count) > 0) return // already seeded

  const items = await db.query(`SELECT item_code FROM qc_inspection.item_master ORDER BY item_code`)
  if (items.rows.length === 0) return

  console.log(`[itemHistory] Seeding dummy data for ${items.rows.length} items...`)
  for (const { item_code } of items.rows) {
    const nc = 2 + Math.floor(Math.random() * 4)
    const nl = 1 + Math.floor(Math.random() * 4)
    for (const c of pick(SEED_COMPLAINTS, nc)) {
      await db.query(
        `INSERT INTO qc_inspection.customer_complaints (item_code,complaint_ref,complaint_date,customer_name,description,severity,status,resolution) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [item_code, `${c.complaint_ref}/${item_code}`, daysAgo(c.days_ago), c.customer_name, c.description, c.severity, c.status, c.resolution]
      )
    }
    for (const cl of pick(SEED_CLAIMS, nl)) {
      await db.query(
        `INSERT INTO qc_inspection.item_claims (item_code,claim_ref,claim_date,customer_name,reason,claim_amount,status,resolution) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [item_code, `${cl.claim_ref}/${item_code}`, daysAgo(cl.days_ago), cl.customer_name, cl.reason, cl.claim_amount, cl.status, cl.resolution]
      )
    }
  }
  console.log(`[itemHistory] Seed complete.`)
}
ensureTablesAndSeed().catch(err => console.error('itemHistory init error:', err))

// ── PAST INSPECTIONS ─────────────────────────────────────────────────────────
// GET /api/item-history/inspections?item_code=XXX
router.get('/inspections', async (req, res) => {
  const { item_code } = req.query
  if (!item_code) return res.status(400).json({ error: 'item_code required' })
  try {
    const result = await db.query(`
      SELECT
        ij.job_id, ij.job_ref, ij.po_no, ij.inspection_stage, ij.status,
        ij.final_outcome, ij.qa_remarks, ij.inspection_date, ij.actual_inspection_date,
        ij.decided_at, ij.submitted_at,
        sm.name AS supplier_name,
        am.name AS agency_name,
        (SELECT COUNT(*) FROM qc_inspection.inspection_response ir
          JOIN qc_inspection.checklist_template ct ON ct.template_id = ir.template_id
          WHERE ir.job_id = ij.job_id AND ir.result = 'fail') AS fail_count,
        (SELECT COUNT(*) FROM qc_inspection.inspection_response ir
          WHERE ir.job_id = ij.job_id) AS total_responses
      FROM qc_inspection.inspection_job ij
      JOIN qc_inspection.job_items ji ON ji.job_id = ij.job_id
      LEFT JOIN qc_inspection.supplier_master sm ON sm.supplier_code = ij.supplier_code
      LEFT JOIN qc_inspection.agency_master am ON am.agency_code = ij.agency_code
      WHERE ji.item_code = $1
        AND ij.status IN ('qa_approved','qa_rejected','submitted_pending_qa')
      ORDER BY ij.decided_at DESC NULLS LAST, ij.submitted_at DESC NULLS LAST
      LIMIT 20
    `, [item_code])
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── CUSTOMER COMPLAINTS ──────────────────────────────────────────────────────
// GET /api/item-history/complaints?item_code=XXX
router.get('/complaints', async (req, res) => {
  const { item_code } = req.query
  if (!item_code) return res.status(400).json({ error: 'item_code required' })
  try {
    const result = await db.query(
      `SELECT * FROM qc_inspection.customer_complaints WHERE item_code = $1 ORDER BY complaint_date DESC NULLS LAST, created_at DESC`,
      [item_code]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/item-history/complaints/all (admin — all items)
router.get('/complaints/all', authorize('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, im.name AS item_name FROM qc_inspection.customer_complaints c
       LEFT JOIN qc_inspection.item_master im ON im.item_code = c.item_code
       ORDER BY c.complaint_date DESC NULLS LAST, c.created_at DESC`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/item-history/complaints
router.post('/complaints', authorize('admin'), async (req, res) => {
  const { item_code, complaint_ref, complaint_date, customer_name, description, severity, status, resolution } = req.body
  if (!item_code) return res.status(400).json({ error: 'item_code required' })
  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.customer_complaints
        (item_code, complaint_ref, complaint_date, customer_name, description, severity, status, resolution)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [item_code, complaint_ref||null, complaint_date||null, customer_name||null, description||null,
       severity||'medium', status||'open', resolution||null]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/item-history/complaints/bulk
router.post('/complaints/bulk', authorize('admin'), async (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array required' })
  try {
    let inserted = 0
    for (const row of rows) {
      const { item_code, complaint_ref, complaint_date, customer_name, description, severity, status, resolution } = row
      if (!item_code) continue
      await db.query(
        `INSERT INTO qc_inspection.customer_complaints
          (item_code, complaint_ref, complaint_date, customer_name, description, severity, status, resolution)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [item_code, complaint_ref||null, complaint_date||null, customer_name||null, description||null,
         severity||'medium', status||'open', resolution||null]
      )
      inserted++
    }
    res.json({ inserted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/item-history/complaints/:id
router.delete('/complaints/:id', authorize('admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM qc_inspection.customer_complaints WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── ITEM CLAIMS ───────────────────────────────────────────────────────────────
// Defect claims (warehouse → QA → buying workflow) are unioned into the claims
// master live, mapped onto the master's shape/status vocabulary.
const DEFECT_CLAIM_AS_MASTER = `
  SELECT
    NULL::int AS id,
    dc.item_code,
    dc.claim_ref,
    dc.raised_at::date AS claim_date,
    ('Internal QC — vs ' || COALESCE(s.name, dc.supplier_code, 'Supplier')) AS customer_name,
    (dc.description || CASE WHEN dc.root_cause IS NOT NULL THEN ' | Root cause: ' || dc.root_cause ELSE '' END) AS reason,
    (dc.claim_amount + dc.penalty_amount) AS claim_amount,
    CASE dc.status
      WHEN 'pending_qa'      THEN 'open'
      WHEN 'pending_buying'  THEN 'under_review'
      WHEN 'pending_imports' THEN 'approved'
      WHEN 'pending_accounts' THEN 'approved'
      WHEN 'submitted'       THEN 'approved'
      WHEN 'settled'         THEN 'settled'
      WHEN 'closed'          THEN 'settled'
      WHEN 'withdrawn'       THEN 'rejected'
    END AS status,
    CASE
      WHEN dc.status IN ('settled','closed') THEN
        'Settled by ' || COALESCE(dc.settlement_mode, '—') ||
        CASE WHEN dc.credit_note_no IS NOT NULL THEN ' — Credit note ' || dc.credit_note_no ELSE '' END ||
        CASE WHEN dc.deduction_remarks IS NOT NULL THEN '. Deduction: ' || dc.deduction_remarks ELSE '' END
      ELSE NULL
    END AS resolution,
    dc.created_at,
    'defect_claim' AS source
  FROM qc_inspection.defect_claim dc
  LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = dc.supplier_code
`

// GET /api/item-history/claims?item_code=XXX
router.get('/claims', async (req, res) => {
  const { item_code } = req.query
  if (!item_code) return res.status(400).json({ error: 'item_code required' })
  try {
    const result = await db.query(
      `SELECT *, 'master' AS source FROM qc_inspection.item_claims WHERE item_code = $1
       UNION ALL
       SELECT * FROM (${DEFECT_CLAIM_AS_MASTER}) dcm WHERE dcm.item_code = $1
       ORDER BY claim_date DESC NULLS LAST, created_at DESC`,
      [item_code]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/item-history/claims/all (admin)
router.get('/claims/all', authorize('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM (
         SELECT c.id, c.item_code, c.claim_ref, c.claim_date, c.customer_name, c.reason,
                c.claim_amount, c.status, c.resolution, c.created_at, 'master' AS source,
                im.name AS item_name
         FROM qc_inspection.item_claims c
         LEFT JOIN qc_inspection.item_master im ON im.item_code = c.item_code
         UNION ALL
         SELECT dcm.*, im2.name AS item_name
         FROM (${DEFECT_CLAIM_AS_MASTER}) dcm
         LEFT JOIN qc_inspection.item_master im2 ON im2.item_code = dcm.item_code
       ) combined
       ORDER BY claim_date DESC NULLS LAST, created_at DESC`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/item-history/claims
router.post('/claims', authorize('admin'), async (req, res) => {
  const { item_code, claim_ref, claim_date, customer_name, reason, claim_amount, status, resolution } = req.body
  if (!item_code) return res.status(400).json({ error: 'item_code required' })
  try {
    const r = await db.query(
      `INSERT INTO qc_inspection.item_claims
        (item_code, claim_ref, claim_date, customer_name, reason, claim_amount, status, resolution)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [item_code, claim_ref||null, claim_date||null, customer_name||null, reason||null,
       claim_amount||null, status||'open', resolution||null]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/item-history/claims/bulk
router.post('/claims/bulk', authorize('admin'), async (req, res) => {
  const { rows } = req.body
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array required' })
  try {
    let inserted = 0
    for (const row of rows) {
      const { item_code, claim_ref, claim_date, customer_name, reason, claim_amount, status, resolution } = row
      if (!item_code) continue
      await db.query(
        `INSERT INTO qc_inspection.item_claims
          (item_code, claim_ref, claim_date, customer_name, reason, claim_amount, status, resolution)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [item_code, claim_ref||null, claim_date||null, customer_name||null, reason||null,
         claim_amount||null, status||'open', resolution||null]
      )
      inserted++
    }
    res.json({ inserted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/item-history/claims/:id
router.delete('/claims/:id', authorize('admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM qc_inspection.item_claims WHERE id = $1`, [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
