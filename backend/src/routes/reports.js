const express = require('express');
const XLSX = require('xlsx');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const fmt = (val) => (val == null ? '' : val);
const fmtDate = (val) => (val ? new Date(val).toLocaleDateString('en-GB') : '');
const fmtDateTime = (val) => (val ? new Date(val).toLocaleString('en-GB') : '');

router.get('/download', async (req, res) => {
  try {
    const { role, agency_code, supplier_code, user_id } = req.user;
    const { from, to } = req.query;
    const wb = XLSX.utils.book_new();

    // ── 1. INSPECTION JOBS SHEET ─────────────────────────────────────────────
    let jobQuery = `
      SELECT
        j.job_ref, j.po_no, j.item_code, i.name AS item_name,
        j.supplier_code, s.name AS supplier_name,
        j.agency_code, a.name AS agency_name,
        j.inspection_type, j.status,
        j.inspection_date, j.actual_inspection_date,
        j.submitted_at, j.decided_at,
        j.final_outcome, j.qa_notes,
        j.created_at
      FROM qc_inspection.inspection_job j
      JOIN qc_inspection.item_master i ON i.item_code = j.item_code
      JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      LEFT JOIN qc_inspection.quality_agency_master a ON a.agency_code = j.agency_code
      ORDER BY j.created_at DESC
    `;
    let jobParams = [];

    // Role filter
    if (role === 'agency_user') {
      jobParams.push(agency_code);
      jobQuery = jobQuery.replace('ORDER BY', `WHERE j.agency_code = $${jobParams.length} ORDER BY`);
    } else if (role === 'supplier_user') {
      jobParams.push(supplier_code);
      jobQuery = jobQuery.replace('ORDER BY', `WHERE j.supplier_code = $${jobParams.length} ORDER BY`);
    } else if (role === 'buying') {
      jobParams.push(user_id);
      jobQuery = jobQuery.replace('ORDER BY', `WHERE EXISTS (SELECT 1 FROM qc_inspection.po_master pm WHERE pm.po_no = j.po_no AND pm.buyer_id = $${jobParams.length}) ORDER BY`);
    }

    // Date filter
    const hasWhere = jobQuery.includes('WHERE');
    const dateConditions = [];
    if (from) { jobParams.push(from); dateConditions.push(`j.created_at >= $${jobParams.length}::date`); }
    if (to) { jobParams.push(to); dateConditions.push(`j.created_at < ($${jobParams.length}::date + interval '1 day')`); }
    if (dateConditions.length) {
      const clause = dateConditions.join(' AND ');
      jobQuery = hasWhere
        ? jobQuery.replace('ORDER BY', `AND ${clause} ORDER BY`)
        : jobQuery.replace('ORDER BY', `WHERE ${clause} ORDER BY`);
    }

    const jobs = await db.query(jobQuery, jobParams);

    const jobRows = [
      ['Job Ref', 'PO No', 'Item Code', 'Item Name', 'Supplier Code', 'Supplier Name',
       'Agency Code', 'Agency Name', 'Inspection Type', 'Status',
       'Planned Inspection Date', 'Actual Inspection Date',
       'Submitted At', 'QA Decision At', 'Final Outcome', 'QA Notes', 'Created At'],
      ...jobs.rows.map(r => [
        fmt(r.job_ref), fmt(r.po_no), fmt(r.item_code), fmt(r.item_name),
        fmt(r.supplier_code), fmt(r.supplier_name),
        fmt(r.agency_code), fmt(r.agency_name),
        fmt(r.inspection_type), fmt(r.status),
        fmtDate(r.inspection_date), fmtDate(r.actual_inspection_date),
        fmtDateTime(r.submitted_at), fmtDateTime(r.decided_at),
        fmt(r.final_outcome), fmt(r.qa_notes), fmtDateTime(r.created_at)
      ])
    ];
    const wsJobs = XLSX.utils.aoa_to_sheet(jobRows);
    wsJobs['!cols'] = [16,14,10,28,14,28,12,20,14,22,20,20,20,20,14,30,20].map(w => ({ wch: w }));
    // Bold header row
    const jobHeaders = Object.keys(wsJobs).filter(k => k.match(/^[A-Z]+1$/) && k !== '!ref');
    jobHeaders.forEach(k => { if (wsJobs[k]) wsJobs[k].s = { font: { bold: true } }; });
    XLSX.utils.book_append_sheet(wb, wsJobs, 'Inspection Jobs');

    // ── 2. CHECKLIST RESPONSES SHEET ─────────────────────────────────────────
    {
      let respQuery = `
        SELECT
          j.job_ref, j.po_no, j.item_code, i.name AS item_name,
          j.supplier_code, s.name AS supplier_name,
          j.agency_code, ci.section, ci.checkpoint_text, ci.criticality,
          r.result, r.remark
        FROM qc_inspection.inspection_response r
        JOIN qc_inspection.inspection_job j ON j.job_id = r.job_id
        JOIN qc_inspection.item_master i ON i.item_code = j.item_code
        JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
        JOIN qc_inspection.checklist_item ci ON ci.item_id = r.checklist_item_id
        ORDER BY j.created_at DESC, ci.sort_order
      `;
      let respParams = [];
      if (role === 'agency_user') {
        respParams.push(agency_code);
        respQuery = respQuery.replace('ORDER BY', `WHERE j.agency_code = $${respParams.length} ORDER BY`);
      } else if (role === 'supplier_user') {
        respParams.push(supplier_code);
        respQuery = respQuery.replace('ORDER BY', `WHERE j.supplier_code = $${respParams.length} ORDER BY`);
      } else if (role === 'buying') {
        respParams.push(user_id);
        respQuery = respQuery.replace('ORDER BY', `WHERE EXISTS (SELECT 1 FROM qc_inspection.po_master pm WHERE pm.po_no = j.po_no AND pm.buyer_id = $${respParams.length}) ORDER BY`);
      }
      const hasRespWhere = respQuery.includes('WHERE');
      const respDateConds = [];
      if (from) { respParams.push(from); respDateConds.push(`j.created_at >= $${respParams.length}::date`); }
      if (to) { respParams.push(to); respDateConds.push(`j.created_at < ($${respParams.length}::date + interval '1 day')`); }
      if (respDateConds.length) {
        const clause = respDateConds.join(' AND ');
        respQuery = hasRespWhere
          ? respQuery.replace('ORDER BY', `AND ${clause} ORDER BY`)
          : respQuery.replace('ORDER BY', `WHERE ${clause} ORDER BY`);
      }

      const responses = await db.query(respQuery, respParams);
      const respRows = [
        ['Job Ref', 'PO No', 'Item Code', 'Item Name', 'Supplier', 'Agency',
         'Section', 'Checkpoint', 'Criticality', 'Result', 'Remark'],
        ...responses.rows.map(r => [
          fmt(r.job_ref), fmt(r.po_no), fmt(r.item_code), fmt(r.item_name),
          fmt(r.supplier_name), fmt(r.agency_code),
          fmt(r.section), fmt(r.checkpoint_text), fmt(r.criticality),
          fmt(r.result), fmt(r.remark)
        ])
      ];
      const wsResp = XLSX.utils.aoa_to_sheet(respRows);
      wsResp['!cols'] = [10,12,10,24,24,12,16,40,10,8,30].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, wsResp, 'Checklist Responses');
    }

    // ── 3. SUMMARY SHEET ─────────────────────────────────────────────────────
    const totalJobs = jobs.rows.length;
    const approved = jobs.rows.filter(j => j.final_outcome === 'pass').length;
    const rejected = jobs.rows.filter(j => j.final_outcome === 'fail').length;
    const pending = jobs.rows.filter(j => j.status === 'submitted_pending_qa').length;
    const awaiting = jobs.rows.filter(j => j.status === 'mapped_awaiting_inspection').length;

    // Charges summary
    let chargesSummaryQuery = `
      SELECT
        COUNT(*) AS total_advices,
        COUNT(*) FILTER (WHERE status = 'pending_qa') AS pending_qa,
        COUNT(*) FILTER (WHERE status = 'pending_buying') AS pending_buying,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved_charges,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_charges,
        COALESCE(SUM(total_cost) FILTER (WHERE status = 'approved'), 0) AS total_approved_cost
      FROM qc_inspection.inspection_charges_advice a
    `;
    const csp = [];
    if (role === 'agency_user') { chargesSummaryQuery += ` WHERE a.agency_code = $1`; csp.push(agency_code); }
    else if (role === 'supplier_user') {
      chargesSummaryQuery += ` WHERE a.cost_bearer = 'supplier' AND EXISTS (SELECT 1 FROM qc_inspection.ica_jobs ij2 JOIN qc_inspection.inspection_job j2 ON j2.job_id = ij2.job_id WHERE ij2.advice_id = a.advice_id AND j2.supplier_code = $1)`;
      csp.push(supplier_code);
    } else if (role === 'buying') {
      chargesSummaryQuery += ` WHERE EXISTS (SELECT 1 FROM qc_inspection.ica_jobs ij2 JOIN qc_inspection.inspection_job j2 ON j2.job_id = ij2.job_id JOIN qc_inspection.po_master pm ON pm.po_no = j2.po_no WHERE ij2.advice_id = a.advice_id AND pm.buyer_id = $1)`;
      csp.push(user_id);
    }
    const cs = await db.query(chargesSummaryQuery, csp).catch(() => ({ rows: [{}] }));
    const csRow = cs.rows[0] || {};

    const summaryRows = [
      ['Quality Inspection Portal — Report Summary'],
      ['Generated At', fmtDateTime(new Date())],
      ['Generated By', req.user.email],
      ['Role', role],
      [],
      ['── INSPECTION JOBS ──', ''],
      ['Metric', 'Count'],
      ['Total Jobs', totalJobs],
      ['Awaiting Inspection', awaiting],
      ['Pending QA Review', pending],
      ['QA Approved', approved],
      ['QA Rejected', rejected],
      ['In Progress / Other', totalJobs - approved - rejected - pending - awaiting],
      [],
      ['── INSPECTION CHARGES ──', ''],
      ['Metric', 'Count / Value'],
      ['Total Advice Raised', fmt(csRow.total_advices)],
      ['Pending QA Approval', fmt(csRow.pending_qa)],
      ['Pending Buying Approval', fmt(csRow.pending_buying)],
      ['Approved', fmt(csRow.approved_charges)],
      ['Rejected', fmt(csRow.rejected_charges)],
      ['Total Approved Cost (USD)', fmt(csRow.total_approved_cost)],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 24 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // ── 4. INSPECTION CHARGES SHEET ──────────────────────────────────────────
    {
      let chargesQuery = `
        SELECT
          a.advice_ref, a.status AS advice_status,
          ag.name AS agency_name, a.agency_code,
          a.rate_type, a.rate_value, a.num_mandays,
          a.travel_allowance, a.stay_allowance,
          a.total_cost, a.currency,
          a.cost_bearer,
          a.created_at,
          creator.name AS raised_by,
          qa_u.name AS qa_approved_by, a.qa_approved_at, a.qa_notes,
          buy_u.name AS buying_approved_by, a.buying_approved_at, a.buying_notes,
          a.rejection_reason,
          STRING_AGG(j.job_ref, ', ' ORDER BY j.job_ref) AS job_refs,
          STRING_AGG(DISTINCT j.po_no, ', ') AS po_numbers,
          STRING_AGG(DISTINCT j.supplier_code, ', ') AS supplier_codes,
          STRING_AGG(DISTINCT s.name, ', ') AS supplier_names
        FROM qc_inspection.inspection_charges_advice a
        JOIN qc_inspection.quality_agency_master ag USING (agency_code)
        JOIN qc_inspection.team_stakeholder creator ON creator.user_id = a.created_by
        LEFT JOIN qc_inspection.team_stakeholder qa_u ON qa_u.user_id = a.qa_user_id
        LEFT JOIN qc_inspection.team_stakeholder buy_u ON buy_u.user_id = a.buying_user_id
        LEFT JOIN qc_inspection.ica_jobs ij ON ij.advice_id = a.advice_id
        LEFT JOIN qc_inspection.inspection_job j ON j.job_id = ij.job_id
        LEFT JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      `;
      let chargesParams = [];
      let hasChargesWhere = false;

      if (role === 'agency_user') {
        chargesParams.push(agency_code);
        chargesQuery += ` WHERE a.agency_code = $${chargesParams.length}`;
        hasChargesWhere = true;
      } else if (role === 'supplier_user') {
        chargesParams.push(supplier_code);
        chargesQuery += ` WHERE a.cost_bearer = 'supplier'
          AND EXISTS (
            SELECT 1 FROM qc_inspection.ica_jobs ij2
            JOIN qc_inspection.inspection_job j2 ON j2.job_id = ij2.job_id
            WHERE ij2.advice_id = a.advice_id AND j2.supplier_code = $${chargesParams.length}
          )`;
        hasChargesWhere = true;
      } else if (role === 'buying') {
        chargesParams.push(user_id);
        chargesQuery += ` WHERE EXISTS (
          SELECT 1 FROM qc_inspection.ica_jobs ij2
          JOIN qc_inspection.inspection_job j2 ON j2.job_id = ij2.job_id
          JOIN qc_inspection.po_master pm ON pm.po_no = j2.po_no
          WHERE ij2.advice_id = a.advice_id AND pm.buyer_id = $${chargesParams.length}
        )`;
        hasChargesWhere = true;
      }

      if (from) { chargesParams.push(from); chargesQuery += ` ${hasChargesWhere ? 'AND' : 'WHERE'} a.created_at >= $${chargesParams.length}::date`; hasChargesWhere = true; }
      if (to) { chargesParams.push(to); chargesQuery += ` ${hasChargesWhere ? 'AND' : 'WHERE'} a.created_at < ($${chargesParams.length}::date + interval '1 day')`; hasChargesWhere = true; }

      chargesQuery += ` GROUP BY a.advice_id, ag.name, creator.name, qa_u.name, buy_u.name ORDER BY a.created_at DESC`;

      const charges = await db.query(chargesQuery, chargesParams);

      const chargeRows = [
        [
          'Advice Ref', 'Status', 'Agency', 'Rate Type', 'Rate Value',
          'Mandays', 'Travel Allowance', 'Stay Allowance', 'Total Cost', 'Currency',
          'Cost Bearer', 'Job Refs', 'PO Numbers', 'Supplier(s)',
          'Raised By', 'Raised At',
          'QA Approved By', 'QA Approved At', 'QA Notes',
          'Buying Approved By', 'Buying Approved At', 'Buying Notes',
          'Rejection Reason'
        ],
        ...charges.rows.map(r => [
          fmt(r.advice_ref),
          fmt(r.advice_status),
          fmt(r.agency_name),
          fmt(r.rate_type),
          fmt(r.rate_value),
          fmt(r.num_mandays),
          fmt(r.travel_allowance),
          fmt(r.stay_allowance),
          fmt(r.total_cost),
          fmt(r.currency),
          r.cost_bearer === 'supplier' ? 'Supplier' : 'Homes R Us',
          fmt(r.job_refs),
          fmt(r.po_numbers),
          fmt(r.supplier_names),
          fmt(r.raised_by),
          fmtDateTime(r.created_at),
          fmt(r.qa_approved_by),
          fmtDateTime(r.qa_approved_at),
          fmt(r.qa_notes),
          fmt(r.buying_approved_by),
          fmtDateTime(r.buying_approved_at),
          fmt(r.buying_notes),
          fmt(r.rejection_reason),
        ])
      ];

      const wsCharges = XLSX.utils.aoa_to_sheet(chargeRows);
      wsCharges['!cols'] = [14,16,22,12,12,10,16,16,12,10,14,20,20,24,18,20,18,20,24,20,20,24,30].map(w => ({ wch: w }));
      const chargeHeaders = Object.keys(wsCharges).filter(k => k.match(/^[A-Z]+1$/) && k !== '!ref');
      chargeHeaders.forEach(k => { if (wsCharges[k]) wsCharges[k].s = { font: { bold: true } }; });
      XLSX.utils.book_append_sheet(wb, wsCharges, 'Inspection Charges');
    }

    // ── 5. PO LOG SHEET (QA / Buying / Admin only) ───────────────────────────
    if (['qa', 'buying', 'admin'].includes(role)) {
      const logParams = role === 'buying' ? [user_id] : [];
      const logFilter = role === 'buying'
        ? `WHERE EXISTS (SELECT 1 FROM qc_inspection.po_master pm WHERE pm.po_no = j.po_no AND pm.buyer_id = $1)`
        : '';
      const logs = await db.query(`
        SELECT
          l.created_at, j.job_ref, l.po_no, l.author_role,
          ts.name AS author_name, l.message
        FROM qc_inspection.log_entry l
        LEFT JOIN qc_inspection.inspection_job j ON j.job_id = l.job_id
        LEFT JOIN qc_inspection.team_stakeholder ts ON ts.user_id = l.author_id
        ${logFilter}
        ORDER BY l.created_at DESC
        LIMIT 500
      `, logParams);
      const logRows = [
        ['Timestamp', 'Job Ref', 'PO No', 'Author Role', 'Author Name', 'Activity'],
        ...logs.rows.map(r => [
          fmtDateTime(r.created_at), fmt(r.job_ref), fmt(r.po_no),
          fmt(r.author_role), fmt(r.author_name), fmt(r.message)
        ])
      ];
      const wsLog = XLSX.utils.aoa_to_sheet(logRows);
      wsLog['!cols'] = [18,12,12,14,20,50].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, wsLog, 'Activity Log');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Quality_Inspection_Report_${new Date().toISOString().slice(0,10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate report' });
  }
});

// ── Checklist report as JSON (for slide-in panel) ─────────────────────────
router.get('/checklist', async (req, res) => {
  try {
    const { role, agency_code, supplier_code } = req.user;
    const { from, to, po_no, job_id } = req.query;

    const conditions = ['1=1'];
    const params = [];
    const p = (val) => { params.push(val); return `$${params.length}`; };

    if (role === 'agency_user')   conditions.push(`j.agency_code = ${p(agency_code)}`);
    else if (role === 'supplier_user') conditions.push(`j.supplier_code = ${p(supplier_code)}`);
    if (po_no)  conditions.push(`j.po_no ILIKE ${p('%' + po_no + '%')}`);
    if (job_id) { const pv = p('%' + job_id + '%'); conditions.push(`(j.job_ref ILIKE ${pv} OR j.job_id::text ILIKE ${pv})`); }
    if (from)   conditions.push(`j.inspection_date >= ${p(from)}::date`);
    if (to)     conditions.push(`j.inspection_date <= ${p(to)}::date`);

    const q = `
      SELECT
        j.job_ref, j.po_no, j.item_code, i.name AS item_name,
        j.supplier_code, s.name AS supplier_name,
        j.agency_code, ag.name AS agency_name,
        j.status, j.final_outcome, j.inspection_date,
        ci.section, ci.checkpoint_text, ci.criticality,
        r.result, r.remark
      FROM qc_inspection.inspection_response r
      JOIN qc_inspection.inspection_job j ON j.job_id = r.job_id
      JOIN qc_inspection.item_master i ON i.item_code = j.item_code
      JOIN qc_inspection.supplier_master s ON s.supplier_code = j.supplier_code
      LEFT JOIN qc_inspection.quality_agency_master ag ON ag.agency_code = j.agency_code
      JOIN qc_inspection.checklist_item ci ON ci.item_id = r.checklist_item_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY j.inspection_date DESC NULLS LAST, ci.sort_order
    `;

    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Checklist report error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
