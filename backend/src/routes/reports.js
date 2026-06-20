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
    const { role, agency_code, supplier_code } = req.user;
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
    const jobParams = [];

    if (role === 'agency_user') {
      jobQuery = jobQuery.replace('ORDER BY', `WHERE j.agency_code = $1 ORDER BY`);
      jobParams.push(agency_code);
    } else if (role === 'supplier_user') {
      jobQuery = jobQuery.replace('ORDER BY', `WHERE j.supplier_code = $1 ORDER BY`);
      jobParams.push(supplier_code);
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
    wsJobs['!cols'] = [10,12,10,24,14,28,12,20,14,22,18,18,18,18,14,30,18].map(w => ({ wch: w }));
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
      const respParams = [];
      if (role === 'agency_user') {
        respQuery = respQuery.replace('ORDER BY', `WHERE j.agency_code = $1 ORDER BY`);
        respParams.push(agency_code);
      } else if (role === 'supplier_user') {
        respQuery = respQuery.replace('ORDER BY', `WHERE j.supplier_code = $1 ORDER BY`);
        respParams.push(supplier_code);
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

    const summaryRows = [
      ['QC Inspection Report Summary'],
      ['Generated At', fmtDateTime(new Date())],
      ['Generated By', req.user.email],
      ['Role', role],
      [],
      ['Metric', 'Count'],
      ['Total Jobs', totalJobs],
      ['Awaiting Inspection', awaiting],
      ['Pending QA Review', pending],
      ['QA Approved', approved],
      ['QA Rejected', rejected],
      ['In Progress / Other', totalJobs - approved - rejected - pending - awaiting],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 24 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // ── 4. PO LOG SHEET (QA / Buying only) ──────────────────────────────────
    if (['qa', 'buying'].includes(role)) {
      const logs = await db.query(`
        SELECT
          l.created_at, j.job_ref, l.po_no, l.author_role,
          ts.name AS author_name, l.message
        FROM qc_inspection.log_entry l
        LEFT JOIN qc_inspection.inspection_job j ON j.job_id = l.job_id
        LEFT JOIN qc_inspection.team_stakeholder ts ON ts.user_id = l.author_id
        ORDER BY l.created_at DESC
        LIMIT 500
      `);
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
    const filename = `QC_Inspection_Report_${new Date().toISOString().slice(0,10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate report' });
  }
});

module.exports = router;
