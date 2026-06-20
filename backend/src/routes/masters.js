const express = require('express')
const db = require('../db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

// GET /api/masters/pos?search=PO-2026
router.get('/pos', authenticate, async (req, res) => {
  const { search = '' } = req.query
  try {
    const result = await db.query(
      `SELECT p.po_no, p.quantity, p.status, p.order_date,
              i.name AS item_name, i.category, i.sub_category,
              s.name AS supplier_name
       FROM qc_inspection.po_master p
       JOIN qc_inspection.item_master i ON i.item_code = p.item_code
       JOIN qc_inspection.supplier_master s ON s.supplier_code = p.supplier_code
       WHERE p.status IN ('open','in_inspection')
         AND (
           p.po_no ILIKE $1 OR
           i.name ILIKE $1 OR
           s.name ILIKE $1
         )
         AND NOT EXISTS (
           SELECT 1 FROM qc_inspection.inspection_job ij
           WHERE ij.po_no = p.po_no
             AND ij.status IN ('mapped_awaiting_inspection', 'submitted_pending_qa', 'qa_approved')
         )
       ORDER BY p.po_no
       LIMIT 20`,
      [`%${search}%`]
    )
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

module.exports = router
