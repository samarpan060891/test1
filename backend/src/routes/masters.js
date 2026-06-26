const express = require('express')
const db = require('../db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

// GET /api/masters/pos?search=PO-2026
// Returns POs that have at least one uninspected item; each PO includes an items[] array.
// inspection_status: 'none' | 'partial' | 'complete' (complete POs are excluded from results)
router.get('/pos', authenticate, async (req, res) => {
  const { search = '' } = req.query
  try {
    const result = await db.query(`
      WITH matching_pos AS (
        SELECT DISTINCT p.po_no
        FROM qc_inspection.po_master p
        JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
        LEFT JOIN qc_inspection.po_line_items pl ON pl.po_no = p.po_no
        LEFT JOIN qc_inspection.item_master im ON im.item_code = pl.item_code
        WHERE p.status IN ('open','in_inspection')
          AND (p.po_no ILIKE $1 OR s.name ILIKE $1 OR im.name ILIKE $1)
      ),
      item_status AS (
        SELECT
          pl.po_no, pl.item_code, pl.quantity, pl.unit_price, pl.line_no,
          im.name AS item_name, im.category, im.sub_category,
          EXISTS (
            SELECT 1 FROM qc_inspection.job_items ji
            JOIN qc_inspection.inspection_job ij ON ij.job_id = ji.job_id
            WHERE ij.po_no = pl.po_no
              AND ji.item_code = pl.item_code
              AND ij.status IN ('mapped_awaiting_inspection','submitted_pending_qa','qa_approved')
          ) AS is_being_inspected
        FROM qc_inspection.po_line_items pl
        JOIN qc_inspection.item_master im ON im.item_code = pl.item_code
        WHERE pl.po_no IN (SELECT po_no FROM matching_pos)
      ),
      po_stats AS (
        SELECT po_no,
          COUNT(*) AS total_items,
          COUNT(*) FILTER (WHERE is_being_inspected) AS inspected_count
        FROM item_status
        GROUP BY po_no
      )
      SELECT
        p.po_no, p.supplier_code, p.order_date, p.status, p.buyer_id,
        s.name AS supplier_name,
        ps.total_items, ps.inspected_count,
        CASE
          WHEN ps.inspected_count = 0 THEN 'none'
          WHEN ps.inspected_count >= ps.total_items THEN 'complete'
          ELSE 'partial'
        END AS inspection_status,
        json_agg(
          json_build_object(
            'item_code', ist.item_code,
            'item_name', ist.item_name,
            'category', ist.category,
            'sub_category', ist.sub_category,
            'quantity', ist.quantity,
            'unit_price', ist.unit_price,
            'line_no', ist.line_no,
            'is_being_inspected', ist.is_being_inspected
          ) ORDER BY ist.line_no, ist.item_code
        ) AS items
      FROM qc_inspection.po_master p
      JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
      JOIN item_status ist ON ist.po_no = p.po_no
      JOIN po_stats ps ON ps.po_no = p.po_no
      WHERE ps.inspected_count < ps.total_items
      GROUP BY p.po_no, p.supplier_code, p.order_date, p.status, p.buyer_id, s.name, ps.total_items, ps.inspected_count
      ORDER BY p.po_no
      LIMIT 20
    `, [`%${search}%`])
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch POs' })
  }
})

// GET /api/masters/agencies?search=Bureau
router.get('/agencies', authenticate, async (req, res) => {
  const { search = '' } = req.query
  try {
    const result = await db.query(
      `SELECT agency_code, name, contact_name, country
       FROM qc_inspection.quality_agency_master
       WHERE name ILIKE $1 OR agency_code ILIKE $1
       ORDER BY name
       LIMIT 20`,
      [`%${search}%`]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch agencies' })
  }
})

// GET /api/masters/items?search=sofa
router.get('/items', authenticate, async (req, res) => {
  const { search = '' } = req.query
  try {
    const result = await db.query(
      `SELECT item_code, name, category, sub_category
       FROM qc_inspection.item_master
       WHERE name ILIKE $1 OR item_code ILIKE $1 OR category ILIKE $1
       ORDER BY name
       LIMIT 20`,
      [`%${search}%`]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch items' })
  }
})

// GET /api/masters/suppliers?search=shanghai
router.get('/suppliers', authenticate, async (req, res) => {
  const { search = '' } = req.query
  try {
    const result = await db.query(
      `SELECT supplier_code, name, country, contact_name
       FROM qc_inspection.supplier_master
       WHERE name ILIKE $1 OR supplier_code ILIKE $1
       ORDER BY name
       LIMIT 20`,
      [`%${search}%`]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch suppliers' })
  }
})

// GET /api/masters/buyers — list of buying-role users for PO assignment
router.get('/buyers', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT user_id, name, email FROM qc_inspection.team_stakeholder WHERE role = 'buying' ORDER BY name`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch buyers' })
  }
})

module.exports = router
