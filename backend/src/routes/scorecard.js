const express = require('express')
const db = require('../db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

// ── GET /api/scorecard/config ────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM qc_inspection.scorecard_config WHERE id = 1')
    res.json(rows[0] || {})
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── PUT /api/scorecard/config ────────────────────────────────────────────────
router.put('/config', authorize('admin'), async (req, res) => {
  const {
    weight_complaints, weight_claims, weight_failures,
    grade_excellent, grade_good, grade_average,
    severity_critical, severity_high, severity_medium, severity_low,
    resolved_penalty_factor, claims_full_deduction_pct,
    time_decay_months, time_decay_factor, min_inspections,
  } = req.body

  const total = Number(weight_complaints) + Number(weight_claims) + Number(weight_failures)
  if (Math.abs(total - 100) > 0.01) {
    return res.status(400).json({ error: `Weights must sum to 100 (got ${total})` })
  }

  try {
    const { rows } = await db.query(`
      UPDATE qc_inspection.scorecard_config SET
        weight_complaints         = $1,
        weight_claims             = $2,
        weight_failures           = $3,
        grade_excellent           = $4,
        grade_good                = $5,
        grade_average             = $6,
        severity_critical         = $7,
        severity_high             = $8,
        severity_medium           = $9,
        severity_low              = $10,
        resolved_penalty_factor   = $11,
        claims_full_deduction_pct = $12,
        time_decay_months         = $13,
        time_decay_factor         = $14,
        min_inspections           = $15,
        updated_at                = NOW(),
        updated_by                = $16
      WHERE id = 1
      RETURNING *
    `, [
      weight_complaints, weight_claims, weight_failures,
      grade_excellent, grade_good, grade_average,
      severity_critical, severity_high, severity_medium, severity_low,
      resolved_penalty_factor, claims_full_deduction_pct,
      time_decay_months, time_decay_factor, min_inspections,
      req.user.userId,
    ])
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/scorecard/suppliers ─────────────────────────────────────────────
// Returns scored list. supplier_user sees only their own supplier.
router.get('/suppliers', async (req, res) => {
  const role = req.user.role
  const userId = req.user.userId

  try {
    const cfgRes = await db.query('SELECT * FROM qc_inspection.scorecard_config WHERE id = 1')
    const cfg = cfgRes.rows[0]
    if (!cfg) return res.status(500).json({ error: 'Scorecard config missing' })

    // Resolve supplier filter for supplier_user role
    let supplierFilter = null
    if (role === 'supplier_user') {
      const su = await db.query(
        `SELECT supplier_code FROM qc_inspection.team_stakeholder WHERE user_id = $1`,
        [userId]
      )
      supplierFilter = su.rows[0]?.supplier_code || null
    }

    // 1. All suppliers
    const suppRes = await db.query(`
      SELECT supplier_code, name, country FROM qc_inspection.supplier_master
      ${supplierFilter ? 'WHERE supplier_code = $1' : ''}
      ORDER BY name
    `, supplierFilter ? [supplierFilter] : [])

    const suppliers = suppRes.rows

    // 2. Inspection stats per supplier
    const inspStats = await db.query(`
      SELECT
        p.supplier_code,
        COUNT(DISTINCT ij.job_id)                                           AS total_inspections,
        COUNT(DISTINCT ij.job_id) FILTER (WHERE ij.result = 'fail')        AS failed_inspections
      FROM qc_inspection.inspection_job ij
      JOIN qc_inspection.po_master p ON p.po_no = ij.po_no
      GROUP BY p.supplier_code
    `)
    const inspMap = {}
    inspStats.rows.forEach(r => { inspMap[r.supplier_code] = r })

    // 3. Complaint stats per supplier (with time decay)
    const compRes = await db.query(`
      SELECT
        ij.supplier_code,
        cc.severity,
        cc.status,
        cc.complaint_date
      FROM qc_inspection.customer_complaints cc
      JOIN qc_inspection.inspection_job ij ON ij.job_id = cc.job_id
    `)

    // 4. Claims stats per supplier
    const claimRes = await db.query(`
      SELECT
        ij.supplier_code,
        cl.claim_amount,
        cl.status,
        cl.claim_date
      FROM qc_inspection.claims cl
      JOIN qc_inspection.inspection_job ij ON ij.job_id = cl.job_id
    `)

    // 5. PO value per supplier (for claims % calculation)
    const poValRes = await db.query(`
      SELECT
        p.supplier_code,
        COALESCE(SUM(pl.quantity * pl.unit_price), 0) AS total_po_value
      FROM qc_inspection.po_master p
      LEFT JOIN qc_inspection.po_line_items pl ON pl.po_no = p.po_no
      GROUP BY p.supplier_code
    `)
    const poValMap = {}
    poValRes.rows.forEach(r => { poValMap[r.supplier_code] = Number(r.total_po_value) })

    // Group complaints and claims by supplier
    const compMap = {}
    compRes.rows.forEach(r => {
      if (!compMap[r.supplier_code]) compMap[r.supplier_code] = []
      compMap[r.supplier_code].push(r)
    })
    const claimMap = {}
    claimRes.rows.forEach(r => {
      if (!claimMap[r.supplier_code]) claimMap[r.supplier_code] = []
      claimMap[r.supplier_code].push(r)
    })

    const severityWeight = {
      critical: Number(cfg.severity_critical),
      high:     Number(cfg.severity_high),
      medium:   Number(cfg.severity_medium),
      low:      Number(cfg.severity_low),
    }
    const resolvedFactor  = Number(cfg.resolved_penalty_factor)
    const decayMonths     = Number(cfg.time_decay_months)
    const decayFactor     = Number(cfg.time_decay_factor)
    const wComp           = Number(cfg.weight_complaints)
    const wClaim          = Number(cfg.weight_claims)
    const wFail           = Number(cfg.weight_failures)
    const claimsMaxPct    = Number(cfg.claims_full_deduction_pct) / 100
    const minInsp         = Number(cfg.min_inspections)

    const now = new Date()

    function ageFactor(dateStr) {
      const d = new Date(dateStr)
      const monthsOld = (now - d) / (1000 * 60 * 60 * 24 * 30)
      return monthsOld > decayMonths ? decayFactor : 1
    }

    const scored = suppliers.map(s => {
      const insp   = inspMap[s.supplier_code] || { total_inspections: 0, failed_inspections: 0 }
      const totalI = Number(insp.total_inspections)
      const failI  = Number(insp.failed_inspections)
      const comps  = compMap[s.supplier_code] || []
      const claims = claimMap[s.supplier_code] || []
      const poVal  = poValMap[s.supplier_code] || 0

      const insufficientData = totalI < minInsp

      // ── Failure deduction (0–weight_failures) ──────────────────────────────
      const failRate = totalI > 0 ? failI / totalI : 0
      const failDeduction = failRate * wFail

      // ── Complaint deduction (0–weight_complaints) ──────────────────────────
      let weightedComplaints = 0
      comps.forEach(c => {
        const sw = severityWeight[c.severity] || 1
        const rf = ['resolved', 'closed'].includes(c.status) ? resolvedFactor : 1
        const af = ageFactor(c.complaint_date)
        weightedComplaints += sw * rf * af
      })
      const compIndex = totalI > 0 ? weightedComplaints / totalI : weightedComplaints
      // Full deduction at index = weight_complaints / 12.5 (same as 4 critical per inspection)
      const compDeduction = Math.min(wComp, compIndex * (wComp / (wComp / 12.5)))

      // ── Claims deduction (0–weight_claims) ────────────────────────────────
      let totalClaimed = 0
      claims.forEach(c => {
        const rf = ['settled', 'resolved'].includes(c.status) ? resolvedFactor : 1
        const af = ageFactor(c.claim_date)
        totalClaimed += Number(c.claim_amount) * rf * af
      })
      const claimRate = poVal > 0 ? totalClaimed / poVal : 0
      const claimDeduction = Math.min(wClaim, (claimRate / claimsMaxPct) * wClaim)

      const score = insufficientData
        ? null
        : Math.max(0, Math.round(100 - failDeduction - compDeduction - claimDeduction))

      let grade = null
      if (score !== null) {
        if (score >= Number(cfg.grade_excellent))    grade = 'Excellent'
        else if (score >= Number(cfg.grade_good))    grade = 'Good'
        else if (score >= Number(cfg.grade_average)) grade = 'Average'
        else                                          grade = 'Needs Improvement'
      }

      // Trend: compare last 6 months vs previous 6 months (simplified via inspection fail rate)
      const sixMonthsAgo  = new Date(now); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

      return {
        supplier_code: s.supplier_code,
        name: s.name,
        country: s.country,
        score,
        grade,
        insufficient_data: insufficientData,
        breakdown: {
          total_inspections: totalI,
          failed_inspections: failI,
          fail_rate: totalI > 0 ? Math.round(failRate * 100) : 0,
          total_complaints: comps.length,
          open_complaints: comps.filter(c => c.status === 'open').length,
          total_claims: claims.length,
          total_claimed: Math.round(totalClaimed),
          po_value: Math.round(poVal),
          fail_deduction: Math.round(failDeduction * 10) / 10,
          comp_deduction: Math.round(compDeduction * 10) / 10,
          claim_deduction: Math.round(claimDeduction * 10) / 10,
        },
      }
    })

    // Sort: rated suppliers by score desc, insufficient-data last
    scored.sort((a, b) => {
      if (a.score === null && b.score === null) return a.name.localeCompare(b.name)
      if (a.score === null) return 1
      if (b.score === null) return -1
      return b.score - a.score
    })

    res.json({ suppliers: scored, config: cfg })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
