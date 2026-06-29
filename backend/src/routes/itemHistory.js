const express = require('express')
const XLSX = require('xlsx')
const db = require('../db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

// ── ENSURE TABLES EXIST ──────────────────────────────────────────────────────
async function ensureTables() {
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
}
ensureTables().catch(err => console.error('itemHistory table init error:', err))

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
// GET /api/item-history/claims?item_code=XXX
router.get('/claims', async (req, res) => {
  const { item_code } = req.query
  if (!item_code) return res.status(400).json({ error: 'item_code required' })
  try {
    const result = await db.query(
      `SELECT * FROM qc_inspection.item_claims WHERE item_code = $1 ORDER BY claim_date DESC NULLS LAST, created_at DESC`,
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
      `SELECT c.*, im.name AS item_name FROM qc_inspection.item_claims c
       LEFT JOIN qc_inspection.item_master im ON im.item_code = c.item_code
       ORDER BY c.claim_date DESC NULLS LAST, c.created_at DESC`
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
