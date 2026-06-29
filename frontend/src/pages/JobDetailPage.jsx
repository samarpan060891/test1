import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getJob } from '../api/inspectionJobs.js'
import { getLogs, createLog } from '../api/logEntries.js'
import { getResponses } from '../api/inspectionResponses.js'
import { searchAgencies } from '../api/masters.js'
import SearchableDropdown from '../components/SearchableDropdown.jsx'
import client from '../api/client.js'
import { generateInspectionReport } from '../utils/generateInspectionReport.js'
import { getChecklistReport } from '../api/reports.js'
import { getDocuments, getDocumentFile } from '../api/documents.js'
import { getPastInspections, getComplaints, getClaims } from '../api/itemHistory.js'
import { useCurrency } from '../context/CurrencyContext.jsx'
import * as XLSX from 'xlsx'

const STATUS_META = {
  mapped_awaiting_inspection: { key: 'status_awaiting_inspection', bg: '#FEF0EB', color: '#E8470F' },
  submitted_pending_qa:       { key: 'status_pending_qa_review',  bg: '#fefce8', color: '#92400e' },
  qa_approved:                { key: 'status_approved',           bg: '#f0fdf4', color: '#15803d' },
  qa_rejected:                { key: 'status_rejected',           bg: '#fef2f2', color: '#dc2626' },
}

const STAGE_META = {
  pre_production: { key: 'stage_pre_production', bg: '#fefce8', color: '#92400e' },
  inline:         { key: 'stage_inline',          bg: '#FEF0EB', color: '#E8470F' },
  final:          { key: 'stage_final',           bg: '#f0fdf4', color: '#15803d' },
  loading:        { key: 'stage_loading',         bg: '#faf5ff', color: '#7e22ce' },
}

const ROLE_META = {
  qa:            { label: 'QA',       bg: '#ede9fe', color: '#5b21b6' },
  buying:        { label: 'Buying',   bg: '#e0f2fe', color: '#0369a1' },
  agency_user:   { label: 'Agency',   bg: '#dcfce7', color: '#166534' },
  supplier_user: { label: 'Supplier', bg: '#fce7f3', color: '#9d174d' },
  admin:         { label: 'Admin',    bg: '#fee2e2', color: '#991b1b' },
}

function StatusBadge({ status, t }) {
  const m = STATUS_META[status] || { key: null, bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{ background: m.bg, color: m.color, padding: '5px 14px', borderRadius: '9999px', fontSize: '13px', fontWeight: '700' }}>
      {m.key ? t(m.key) : status}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ width: '190px', flexShrink: 0, fontSize: '12.5px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: '2px' }}>
        {label}
      </span>
      <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: '500' }}>
        {children || <span style={{ color: '#cbd5e1' }}>—</span>}
      </span>
    </div>
  )
}

export default function JobDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useLanguage()
  const { formatAmount, currentCurrency } = useCurrency()
  const navigate = useNavigate()

  const [job, setJob] = useState(null)
  const [logs, setLogs] = useState([])
  const [logMessage, setLogMessage] = useState('')
  const [jobLoading, setJobLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)
  const [error, setError] = useState('')
  const [logError, setLogError] = useState('')
  const [logSubmitting, setLogSubmitting] = useState(false)
  const [logSuccess, setLogSuccess] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)

  const [sliderOpen, setSliderOpen] = useState(false)
  const [checklistRows, setChecklistRows] = useState([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState('')

  const [showReinspect, setShowReinspect] = useState(false)
  const [reinspectType, setReinspectType] = useState('agency')
  const [reinspectAgency, setReinspectAgency] = useState(null)
  const [reinspectDate, setReinspectDate] = useState('')
  const [reinspectLoading, setReinspectLoading] = useState(false)
  const [reinspectError, setReinspectError] = useState('')
  const [logFocused, setLogFocused] = useState(false)

  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [viewFile, setViewFile] = useState(null) // { url, type, name }
  const [viewLoading, setViewLoading] = useState(null) // doc_id being loaded

  // History panel state
  const [historyPanel, setHistoryPanel] = useState(null) // { type: 'complaints'|'claims', item_code, data[] }
  const [histPastInspections, setHistPastInspections] = useState([])
  const [histComplaints, setHistComplaints] = useState([])
  const [histClaims, setHistClaims] = useState([])
  const [histLoading, setHistLoading] = useState(false)

  const fetchLogs = () => {
    setLogsLoading(true)
    getLogs({ job_id: id })
      .then(res => setLogs(Array.isArray(res.data) ? res.data : res.data?.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false))
  }

  const fetchJob = () => {
    getJob(id)
      .then(res => {
        const j = res.data?.job || res.data
        setJob(j)
        if (j?.item_code && j?.supplier_code) { fetchDocs(j.item_code, j.supplier_code); fetchHistory(j.item_code) }
      })
      .catch(() => setError('Failed to load job details.'))
      .finally(() => setJobLoading(false))
  }

  const fetchHistory = (item_code) => {
    setHistLoading(true)
    Promise.all([
      getPastInspections(item_code).then(r => setHistPastInspections(r.data || [])).catch(() => {}),
      getComplaints(item_code).then(r => setHistComplaints(r.data || [])).catch(() => {}),
      getClaims(item_code).then(r => setHistClaims(r.data || [])).catch(() => {}),
    ]).finally(() => setHistLoading(false))
  }

  const fetchDocs = (item_code, supplier_code) => {
    setDocsLoading(true)
    getDocuments()
      .then(res => {
        const group = (res.data || []).find(g => g.item_code === item_code && g.supplier_code === supplier_code)
        setDocs(group?.docs?.filter(d => d.file_name && d.status !== 'not_applicable') || [])
      })
      .catch(() => {})
      .finally(() => setDocsLoading(false))
  }

  const handleViewDoc = async (doc) => {
    if (viewLoading) return
    setViewLoading(doc.id)
    try {
      const res = await getDocumentFile(doc.id)
      const url = URL.createObjectURL(res.data)
      setViewFile({ url, type: res.data.type, name: doc.file_name, docType: doc.doc_type })
    } catch {}
    finally { setViewLoading(null) }
  }

  const DOC_TYPE_LABELS = {
    product_image: 'Product Image', bill_of_materials: 'Bill of Materials',
    msds: 'MSDS', swatch_details: 'Swatch Details', test_reports: 'Test Reports',
    cb_reports: 'CB Reports', line_drawings: 'Line Drawings',
    assembly_instruction_manual: 'Assembly Instruction', user_care_manual: 'User Care Manual',
    packing_details: 'Packing Details', label_artwork: 'Label Artwork',
    certificate_of_conformity: 'Certificate of Conformity', inspection_checklist: 'Inspection Checklist',
  }

  const STATUS_COLORS = {
    approved: { bg: '#f0fdf4', color: '#15803d', label: 'Approved' },
    qa_approved: { bg: '#eff6ff', color: '#1d4ed8', label: 'QA Approved' },
    pending_approval: { bg: '#fef9c3', color: '#92400e', label: 'Pending QA' },
    rejected: { bg: '#fef2f2', color: '#991b1b', label: 'Rejected' },
  }

  useEffect(() => {
    fetchJob(); fetchLogs()
    const interval = setInterval(() => { fetchJob(); fetchLogs() }, 30000)
    return () => clearInterval(interval)
  }, [id])

  const openChecklist = async () => {
    setSliderOpen(true)
    setChecklistLoading(true)
    setChecklistError('')
    try {
      const r = await getChecklistReport({ job_id: id })
      setChecklistRows(r.data || [])
    } catch {
      setChecklistError('Failed to load checklist report.')
    } finally {
      setChecklistLoading(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSliderOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const handleLogSubmit = async (e) => {
    e.preventDefault()
    if (!logMessage.trim()) return
    setLogSubmitting(true)
    setLogError(''); setLogSuccess('')
    try {
      await createLog({ job_id: id, message: logMessage.trim() })
      setLogMessage('')
      setLogSuccess('Remark posted successfully.')
      fetchLogs()
    } catch (err) {
      setLogError(err?.response?.data?.error || 'Failed to post log entry.')
    } finally {
      setLogSubmitting(false)
    }
  }

  const handleDownloadPDF = async () => {
    setPdfLoading(true)
    try {
      const [responsesRes, logsRes] = await Promise.all([
        getResponses(jobId).catch(() => ({ data: [] })),
        getLogs({ job_id: jobId }).catch(() => ({ data: [] })),
      ])
      await generateInspectionReport(job, responsesRes.data || [], Array.isArray(logsRes.data) ? logsRes.data : logsRes.data?.logs || [])
    } catch (err) {
      console.error('PDF generation failed:', err)
    } finally {
      setPdfLoading(false)
    }
  }

  const fetchAgencies = async (search) => {
    const rows = await searchAgencies(search)
    return rows.map(r => ({ value: r.agency_code, label: r.name, sublabel: r.agency_code, meta: r }))
  }

  const handleReinspect = async (e) => {
    e.preventDefault()
    setReinspectError('')
    if (!reinspectDate) { setReinspectError('Inspection date is required.'); return }
    if (reinspectType === 'agency' && !reinspectAgency) { setReinspectError('Please select an agency.'); return }
    setReinspectLoading(true)
    try {
      const res = await client.post(`/inspection-jobs/${jobId}/reinspect`, {
        agency_code: reinspectType === 'agency' ? reinspectAgency.value : undefined,
        inspection_date: reinspectDate,
        inspection_type: reinspectType,
      })
      const newJobId = res.data.job_id || res.data.jobId || (res.data.job && res.data.job.job_id)
      if (!newJobId) throw new Error('No job ID returned from server')
      setShowReinspect(false)
      navigate(`/jobs/${newJobId}`)
    } catch (err) {
      setReinspectError(err?.response?.data?.error || 'Failed to create re-inspection.')
    } finally {
      setReinspectLoading(false)
    }
  }

  if (jobLoading) {
    return (
      <div className="page"><Navbar />
        <div className="loading-center"><div className="spinner" /></div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="page"><Navbar />
        <div style={{ maxWidth: '700px', margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
          <div className="alert alert-error">{error || 'Job not found.'}</div>
          <Link to="/dashboard" className="btn btn-ghost" style={{ marginTop: '16px' }}>{t('nav_dashboard')}</Link>
        </div>
      </div>
    )
  }

  const jobId = job.job_id || job.id
  const stageMeta = STAGE_META[job.inspection_stage]

  // History Excel export
  const exportHistoryExcel = (type, data) => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, type)
    XLSX.writeFile(wb, `${type}_${job?.item_code}_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const STAGE_COLORS = { pre_production: '#92400e', inline: '#E8470F', final: '#15803d', loading: '#7e22ce' }
  const OUTCOME_COLORS = { approved: { bg: '#f0fdf4', color: '#15803d' }, rejected: { bg: '#fef2f2', color: '#dc2626' } }
  const SEV_COLORS = { critical: { bg: '#fef2f2', color: '#991b1b' }, high: { bg: '#fff7ed', color: '#c2410c' }, medium: { bg: '#fefce8', color: '#92400e' }, low: { bg: '#f0fdf4', color: '#15803d' } }
  const CLAIM_STAT_COLORS = { open: { bg: '#fef2f2', color: '#991b1b' }, under_review: { bg: '#fff7ed', color: '#c2410c' }, approved: { bg: '#f0fdf4', color: '#15803d' }, rejected: { bg: '#fef2f2', color: '#dc2626' }, settled: { bg: '#eff6ff', color: '#1d4ed8' } }

  return (
    <div className="page">
      <Navbar />

      {/* Two-column layout: main content + history panel */}
      <div style={{ display: 'flex', gap: '0', alignItems: 'stretch', minHeight: 'calc(100vh - 52px)' }}>

      {/* Left: main content */}
      <div style={{ flex: '1 1 0', minWidth: 0, padding: '20px 24px', maxWidth: '1100px' }}>
      <div>
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <Link to="/dashboard">{t('nav_dashboard')}</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">Job {job?.job_ref || String(jobId).slice(0, 8) + '…'}</span>
        </div>

        {/* Header card */}
        <div className="card mb-6" style={{ overflow: 'hidden' }}>
          {/* Colored top bar by stage */}
          {stageMeta && (
            <div style={{ height: '4px', background: stageMeta.color, opacity: 0.6 }} />
          )}

          <div style={{ padding: '28px 32px' }}>
            <div className="flex-between" style={{ marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px', marginBottom: '6px' }}>
                  {t('job_detail_title')}
                </h1>
                {job.job_ref && (
                  <p style={{ fontSize: '13px', color: '#94a3b8', fontFamily: 'monospace' }}>
                    Ref: {job.job_ref}
                  </p>
                )}
              </div>
              <StatusBadge status={job.status} t={t} />
            </div>

            {/* Re-inspection banner */}
            {job.reinspection_job && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>🔁</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#92400e' }}>
                      {t('jobdetail_reinspect_triggered')} {job.reinspection_job.triggered_by_role === 'qa' ? 'QA' : job.reinspection_job.triggered_by_role}
                      {job.reinspection_job.triggered_by_name ? ` — ${job.reinspection_job.triggered_by_name}` : ''}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b45309' }}>
                      {t('jobdetail_new_job')} <strong>{job.reinspection_job.job_ref}</strong> · {t('jobdetail_status_label')} <strong>{job.reinspection_job.status?.replace(/_/g, ' ')}</strong> · {new Date(job.reinspection_job.mapped_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Link to={`/jobs/${job.reinspection_job.job_id}`} className="btn btn-warning btn-sm">
                  {t('jobdetail_view_reinspect')}
                </Link>
              </div>
            )}

            {/* Fields grid */}
            <div>
              {job.inspection_stage && (
                <Field label={t('col_stage')}>
                  {stageMeta && (
                    <span style={{ background: stageMeta.bg, color: stageMeta.color, padding: '3px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                      {t(stageMeta.key)}
                    </span>
                  )}
                </Field>
              )}
              <Field label={t('job_po_number')}>{job.po_no}</Field>
              <Field label={t('job_item_code')}>{job.item_code}</Field>
              <Field label={t('job_supplier')}>{job.supplier_code}</Field>
              <Field label={t('job_agency')}>{job.agency_code}</Field>
              <Field label={t('job_planned_date')}>{job.inspection_date ? new Date(job.inspection_date).toLocaleDateString() : null}</Field>
              <Field label={t('job_actual_date')}>{job.actual_inspection_date ? new Date(job.actual_inspection_date).toLocaleDateString() : null}</Field>
              <Field label={t('job_submitted_at')}>{job.submitted_at ? new Date(job.submitted_at).toLocaleString() : null}</Field>
              <Field label={t('job_decided_at')}>{job.decided_at ? new Date(job.decided_at).toLocaleString() : null}</Field>
              <Field label={t('job_created_at')}>{job.created_at ? new Date(job.created_at).toLocaleString() : null}</Field>
              {job.final_outcome && <Field label={t('jobdetail_final_outcome')}>{job.final_outcome}</Field>}
              {job.qa_remarks && <Field label={t('jobdetail_qa_remarks')}><span style={{ fontStyle: 'italic', color: '#475569' }}>{job.qa_remarks}</span></Field>}
            </div>

            {/* Actions */}
            <div style={{ marginTop: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {user?.role === 'qa' && job.status === 'qa_rejected' && job.reinspection_job?.status !== 'qa_approved' && (
                <button onClick={() => setShowReinspect(true)} className="btn btn-warning">
                  🔁 {t('job_re_inspect')}
                </button>
              )}
              {user?.role === 'agency_user' && job.status === 'mapped_awaiting_inspection' && job.inspection_type !== 'self' && (
                <button onClick={() => navigate(`/jobs/${jobId}/fill`)} className="btn btn-primary">
                  📝 {t('job_fill_checklist')}
                </button>
              )}
              {user?.role === 'supplier_user' && job.status === 'mapped_awaiting_inspection' && job.inspection_type === 'self' && (
                <button onClick={() => navigate(`/jobs/${jobId}/fill`)} className="btn btn-primary">
                  📝 {t('job_fill_checklist_self')}
                </button>
              )}
              {user?.role === 'qa' && job.status === 'submitted_pending_qa' && (
                <button onClick={() => navigate(`/jobs/${jobId}/review`)} className="btn" style={{ background: '#7c3aed', color: '#fff' }}>
                  🔍 {t('job_review')}
                </button>
              )}
              <Link to={`/po-log?job_id=${job?.job_ref || jobId}`} className="btn btn-ghost">
                📂 {t('nav_po_log')}
              </Link>
              <button onClick={openChecklist} className="btn" style={{ background: '#1C1208', color: '#fff' }}>
                {t('jobdetail_view_checklist')}
              </button>
              <button onClick={handleDownloadPDF} disabled={pdfLoading} className="btn btn-success">
                {pdfLoading ? t('jobdetail_generating') : t('jobdetail_download_report')}
              </button>
            </div>
          </div>
        </div>

        {/* Re-inspection Modal */}
        {showReinspect && (
          <div className="modal-overlay">
            <div className="modal-box">
              <p className="modal-title">{t('job_re_inspect')}</p>
              <p className="modal-subtitle">PO: <strong>{job.po_no}</strong> — a new inspection job will be created.</p>

              {reinspectError && <div className="alert alert-error mb-4">{reinspectError}</div>}

              <form onSubmit={handleReinspect}>
                <div className="field">
                  <label>{t('map_type')}</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[{ value: 'agency', label: '🏢 Agency' }, { value: 'self', label: '🏭 Self' }].map(opt => (
                      <div key={opt.value}
                        onClick={() => { setReinspectType(opt.value); setReinspectAgency(null) }}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                          border: `2px solid ${reinspectType === opt.value ? '#E8470F' : '#e2e8f0'}`,
                          background: reinspectType === opt.value ? '#FEF0EB' : '#f8fafc',
                          fontWeight: '600', fontSize: '13px',
                          color: reinspectType === opt.value ? '#E8470F' : '#475569',
                          transition: 'all 0.15s',
                        }}>
                        {opt.label}
                      </div>
                    ))}
                  </div>
                </div>

                {reinspectType === 'agency' && (
                  <SearchableDropdown label="Quality Agency" required placeholder="Search agency…"
                    value={reinspectAgency} onChange={setReinspectAgency} fetchOptions={fetchAgencies} />
                )}

                <div className="field">
                  <label>{t('map_date')} <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="date" value={reinspectDate} onChange={e => setReinspectDate(e.target.value)} className="input" />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" disabled={reinspectLoading} className="btn btn-warning" style={{ flex: 1 }}>
                    {reinspectLoading ? t('common_saving') : t('job_re_inspect')}
                  </button>
                  <button type="button" onClick={() => { setShowReinspect(false); setReinspectError('') }} className="btn btn-ghost" style={{ flex: 1 }}>
                    {t('common_cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Checklist Report Slide-in Panel ─────────────────────────── */}
        {sliderOpen && (
          <div onClick={() => setSliderOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1200 }} />
        )}
        <div style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: '820px', maxWidth: '96vw',
          background: '#fff', zIndex: 1300, boxShadow: '-8px 0 32px rgba(0,0,0,0.16)',
          display: 'flex', flexDirection: 'column',
          transform: sliderOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}>
          {/* Panel header */}
          <div style={{ background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: '800', fontSize: '16px', color: '#fff' }}>{t('jobdetail_checklist_report')}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                {job?.job_ref} · {job?.po_no}
              </div>
            </div>
            <button onClick={() => setSliderOpen(false)} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {checklistLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
            ) : checklistError ? (
              <div className="alert alert-error">{checklistError}</div>
            ) : checklistRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
                <p>{t('jobdetail_no_checklist')}</p>
              </div>
            ) : (() => {
              const RESULT_META = {
                pass:    { bg: '#f0fdf4', color: '#15803d', key: 'result_pass' },
                fail:    { bg: '#fef2f2', color: '#991b1b', key: 'result_fail' },
                na:      { bg: '#f8fafc', color: '#64748b', key: 'result_na' },
                pending: { bg: '#fefce8', color: '#92400e', key: 'result_pending' },
              }
              const CRIT_META = {
                critical: { bg: '#fef2f2', color: '#991b1b' },
                major:    { bg: '#fff7ed', color: '#c2410c' },
                minor:    { bg: '#f8fafc', color: '#64748b' },
              }
              // Group by item first, then by section within each item
              const byItem = []
              const itemKeyOrder = []
              checklistRows.forEach(r => {
                const itemKey = r.item_code || 'default'
                let itemGroup = byItem.find(g => g.itemKey === itemKey)
                if (!itemGroup) {
                  itemGroup = { itemKey, itemName: r.item_name || null, sections: {} }
                  byItem.push(itemGroup)
                }
                const s = r.section || 'General'
                if (!itemGroup.sections[s]) itemGroup.sections[s] = []
                itemGroup.sections[s].push(r)
              })
              const multiItem = byItem.length > 1
              return (
                <div>
                  {/* Job meta strip */}
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '20px', fontSize: '12px', color: '#475569' }}>
                    {!multiItem && checklistRows[0]?.item_name && <span><strong>{t('col_item')}:</strong> {checklistRows[0].item_name}</span>}
                    {checklistRows[0]?.supplier_name && <span><strong>{t('col_supplier')}:</strong> {checklistRows[0].supplier_name}</span>}
                    {checklistRows[0]?.agency_name   && <span><strong>{t('col_agency')}:</strong> {checklistRows[0].agency_name}</span>}
                    {checklistRows[0]?.inspection_date && <span><strong>{t('col_date')}:</strong> {new Date(checklistRows[0].inspection_date).toLocaleDateString()}</span>}
                    <span><strong>{t('jobdetail_responses')}</strong> {checklistRows.length}</span>
                    <span style={{ color: checklistRows.filter(r => r.result === 'fail').length > 0 ? '#dc2626' : '#15803d', fontWeight: '700' }}>
                      {checklistRows.filter(r => r.result === 'fail').length} {t('jobdetail_fails')}
                    </span>
                  </div>

                  {byItem.map(({ itemKey, itemName, sections }) => (
                    <div key={itemKey} style={{ marginBottom: multiItem ? '24px' : '0' }}>
                      {multiItem && itemName && (
                        <div style={{ background: '#1e293b', padding: '10px 16px', fontSize: '13px', fontWeight: '700', color: '#f8fafc', borderRadius: '8px 8px 0 0', marginBottom: '0', letterSpacing: '0.03em' }}>
                          {itemName}
                        </div>
                      )}
                      {Object.entries(sections).map(([section, items]) => (
                        <div key={section} style={{ marginBottom: '8px', borderRadius: multiItem ? '0' : '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                          <div style={{ background: '#1C1208', padding: '8px 14px', fontSize: '12px', fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {section}
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc' }}>
                                {['#', t('col_checkpoint'), t('col_criticality'), t('col_result'), t('col_remark')].map(h => (
                                  <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((r, i) => {
                                const rm = RESULT_META[r.result] || RESULT_META.pending
                                const cm = CRIT_META[r.criticality] || {}
                                return (
                                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: r.result === 'fail' ? '#fff8f7' : 'transparent' }}>
                                    <td style={{ padding: '7px 12px', color: '#94a3b8', width: '32px' }}>{r.sort_order ?? i + 1}</td>
                                    <td style={{ padding: '7px 12px', color: '#334155', fontWeight: '500' }}>{r.checkpoint_text}</td>
                                    <td style={{ padding: '7px 12px' }}>
                                      <span style={{ ...cm, padding: '2px 8px', borderRadius: '9999px', fontWeight: '600', fontSize: '11px' }}>{r.criticality}</span>
                                    </td>
                                    <td style={{ padding: '7px 12px' }}>
                                      <span style={{ background: rm.bg, color: rm.color, padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{t(rm.key)}</span>
                                    </td>
                                    <td style={{ padding: '7px 12px', color: '#64748b', fontStyle: r.remarks ? 'normal' : 'italic' }}>{r.remarks || '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Documents */}
        <div className="card mb-6" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <h2 className="section-title">📁 Documents</h2>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{docs.length} uploaded</span>
          </div>
          <div style={{ padding: '16px 24px' }}>
            {docsLoading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>Loading documents...</div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>No documents uploaded for this item/supplier yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Document</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>File</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '8px 14px', textAlign: 'right', color: '#64748b', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(doc => {
                    const sc = STATUS_COLORS[doc.status] || { bg: '#f8fafc', color: '#64748b', label: doc.status }
                    const isLoading = viewLoading === doc.id
                    return (
                      <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: '600', color: '#1e293b' }}>{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>{sc.label}</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button onClick={() => handleViewDoc(doc)} disabled={isLoading}
                              style={{ padding: '4px 12px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                              {isLoading ? '...' : '👁 View'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* File viewer modal */}
        {viewFile && (
          <>
            <div onClick={() => { URL.revokeObjectURL(viewFile.url); setViewFile(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000 }} />
            <div style={{ position: 'fixed', top: '52px', right: 0, width: '480px', height: 'calc(100vh - 52px)', background: '#fff', zIndex: 2100, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>
              <div style={{ background: '#1C1208', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#d4c5a0' }}>{DOC_TYPE_LABELS[viewFile.docType] || viewFile.docType}</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#fff', marginTop: '2px' }}>{viewFile.name}</div>
                </div>
                <button onClick={() => { URL.revokeObjectURL(viewFile.url); setViewFile(null) }} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {viewFile.type?.startsWith('image/') ? (
                  <img src={viewFile.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                ) : viewFile.type === 'application/pdf' ? (
                  <iframe src={viewFile.url} style={{ flex: 1, border: 'none', width: '100%', height: '100%' }} title="doc" />
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>📄 {viewFile.name}</div>
                )}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button onClick={() => { const a = document.createElement('a'); a.href = viewFile.url; a.download = viewFile.name; a.click() }}
                  style={{ padding: '7px 18px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  ⬇ Download
                </button>
              </div>
            </div>
          </>
        )}

        {/* Activity Log */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <h2 className="section-title">{t('jobdetail_activity_log')}</h2>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{logs.length} entries</span>
          </div>

          <div style={{ padding: '16px 24px 8px', maxHeight: '400px', overflowY: 'auto' }}>
            {logsLoading ? (
              <div className="loading-center" style={{ padding: '32px' }}><div className="spinner" /></div>
            ) : logs.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px' }}>
                <div style={{ fontSize: '32px' }}>📝</div>
                <p>{t('common_no_data')}</p>
              </div>
            ) : (
              <div className="timeline">
                {logs.map((log, idx) => {
                  const rm = ROLE_META[log.author_role] || { label: log.author_role, bg: '#f1f5f9', color: '#475569' }
                  return (
                    <div key={log.id || idx} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-card">
                        <div className="flex-between" style={{ marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                          <span style={{ background: rm.bg, color: rm.color, fontSize: '11px', fontWeight: '700', padding: '2px 9px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {rm.label}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: '1.55' }}>
                          {log.message}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Post remark */}
          <div style={{ padding: '20px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#334155', marginBottom: '12px' }}>
              {t('job_post_remark') || 'Post a Remark'}
            </h3>
            {logError && <div className="alert alert-error mb-4">{logError}</div>}
            {logSuccess && <div className="alert alert-success mb-4">{logSuccess}</div>}
            <form onSubmit={handleLogSubmit}>
              <textarea
                value={logMessage}
                onChange={e => setLogMessage(e.target.value)}
                placeholder="Enter your remark or update…"
                rows={3}
                className="textarea"
                style={{
                  borderColor: logFocused ? '#E8470F' : '#e2e8f0',
                  boxShadow: logFocused ? '0 0 0 3px rgba(232,71,15,0.12)' : 'none',
                  background: '#fff',
                }}
                onFocus={() => setLogFocused(true)}
                onBlur={() => setLogFocused(false)}
              />
              <button
                type="submit"
                disabled={logSubmitting || !logMessage.trim()}
                className="btn btn-primary"
                style={{ marginTop: '10px' }}
              >
                {logSubmitting ? t('common_saving') : (t('job_post_remark') || 'Post Remark')}
              </button>
            </form>
          </div>
        </div>

      </div> {/* end left inner */}
      </div> {/* end left column */}

      {/* ── RIGHT: History Panel ──────────────────────────────────────────── */}
      <div style={{ width: '380px', flexShrink: 0, position: 'sticky', top: '52px', height: 'calc(100vh - 52px)', overflowY: 'auto', borderLeft: '1px solid #e5e7eb', background: '#f8fafc' }}>
        <div style={{ background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', position: 'sticky', top: 0, zIndex: 10 }}>
          <span style={{ fontSize: '18px' }}>📊</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '14px', color: '#fff', letterSpacing: '-0.2px' }}>QC History Panel</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '1px' }}>Item: {job?.item_code}</div>
          </div>
        </div>

        <div style={{ background: '#fff' }}>
          {histLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading history…</div>
          ) : (
            <>
              {/* ─ Section 1: Past Inspections ─ */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Past Inspections
                  </div>
                  <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px' }}>
                    {histPastInspections.length}
                  </span>
                </div>

                {histPastInspections.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>No past inspection records found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {histPastInspections.slice(0, 5).map((insp, i) => {
                      const outColor = OUTCOME_COLORS[insp.final_outcome] || { bg: '#fefce8', color: '#92400e' }
                      const stageColor = STAGE_COLORS[insp.inspection_stage] || '#64748b'
                      return (
                        <div key={insp.job_id || i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', borderLeft: `3px solid ${stageColor}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>{insp.job_ref || String(insp.job_id).slice(0,8)}</div>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                {insp.inspection_stage?.replace(/_/g,' ')} · {insp.po_no}
                              </div>
                              {insp.agency_name && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{insp.agency_name}</div>}
                            </div>
                            {insp.final_outcome && (
                              <span style={{ background: outColor.bg, color: outColor.color, fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '9999px', flexShrink: 0, textTransform: 'uppercase' }}>
                                {insp.final_outcome}
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: '6px', display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b' }}>
                            <span>{insp.decided_at ? new Date(insp.decided_at).toLocaleDateString() : (insp.inspection_date ? new Date(insp.inspection_date).toLocaleDateString() : '—')}</span>
                            {Number(insp.total_responses) > 0 && (
                              <span style={{ color: Number(insp.fail_count) > 0 ? '#dc2626' : '#15803d', fontWeight: '600' }}>
                                {insp.fail_count}/{insp.total_responses} fails
                              </span>
                            )}
                          </div>
                          {insp.qa_remarks && (
                            <div style={{ marginTop: '5px', fontSize: '11px', color: '#475569', fontStyle: 'italic', lineHeight: 1.4, borderTop: '1px solid #e2e8f0', paddingTop: '5px' }}>
                              "{insp.qa_remarks}"
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {histPastInspections.length > 5 && (
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, textAlign: 'center' }}>
                        +{histPastInspections.length - 5} more inspection(s)
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ─ Section 2: Customer Complaints ─ */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Customer Complaints
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ background: histComplaints.length > 0 ? '#fef2f2' : '#f1f5f9', color: histComplaints.length > 0 ? '#dc2626' : '#64748b', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px' }}>
                      {histComplaints.length}
                    </span>
                    {histComplaints.length > 0 && (
                      <button onClick={() => setHistoryPanel({ type: 'complaints', data: histComplaints })}
                        style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>
                        View Details
                      </button>
                    )}
                  </div>
                </div>

                {histComplaints.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>No customer complaints on record.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Severity summary */}
                    {['critical','high','medium','low'].map(sev => {
                      const cnt = histComplaints.filter(c => c.severity === sev).length
                      if (cnt === 0) return null
                      const sc = SEV_COLORS[sev] || { bg: '#f8fafc', color: '#64748b' }
                      return (
                        <div key={sev} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{sev}</span>
                          <span style={{ color: '#374151', fontWeight: '600' }}>{cnt} complaint{cnt > 1 ? 's' : ''}</span>
                        </div>
                      )
                    })}
                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#94a3b8' }}>
                      {histComplaints.filter(c => c.status === 'open' || c.status === 'investigating').length} open · {histComplaints.filter(c => c.status === 'resolved' || c.status === 'closed').length} resolved
                    </div>
                  </div>
                )}
              </div>

              {/* ─ Section 3: Claims ─ */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Claims
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ background: histClaims.length > 0 ? '#fff7ed' : '#f1f5f9', color: histClaims.length > 0 ? '#c2410c' : '#64748b', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px' }}>
                      {histClaims.length}
                    </span>
                    {histClaims.length > 0 && (
                      <button onClick={() => setHistoryPanel({ type: 'claims', data: histClaims })}
                        style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>
                        View Details
                      </button>
                    )}
                  </div>
                </div>

                {histClaims.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>No claims on record for this item.</p>
                ) : (
                  <div>
                    {/* Total claim amount */}
                    {histClaims.some(c => c.claim_amount) && (
                      <div style={{ background: '#fff7ed', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#92400e', fontWeight: '600' }}>Total claimed</span>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: '#c2410c' }}>
                          {formatAmount(histClaims.reduce((sum, c) => sum + (Number(c.claim_amount) || 0), 0))}
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {['open','under_review','approved','rejected','settled'].map(st => {
                        const cnt = histClaims.filter(c => c.status === st).length
                        if (cnt === 0) return null
                        const sc = CLAIM_STAT_COLORS[st] || { bg: '#f8fafc', color: '#64748b' }
                        return (
                          <div key={st} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                            <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{st.replace(/_/g,' ')}</span>
                            <span style={{ color: '#374151', fontWeight: '600' }}>{cnt}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div> {/* end two-column flex */}

      {/* ── History Detail Slide Panel ──────────────────────────────────── */}
      {historyPanel && (
        <div onClick={() => setHistoryPanel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1500 }} />
      )}
      <div style={{
        position: 'fixed', top: '52px', right: 0, width: '780px', maxWidth: '96vw',
        height: 'calc(100vh - 52px)', background: '#fff', zIndex: 1600,
        display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 30px rgba(0,0,0,0.18)',
        transform: historyPanel ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {historyPanel && (<>
          {/* Panel header */}
          <div style={{ background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: '800', fontSize: '15px', color: '#fff' }}>
                {historyPanel.type === 'complaints' ? '⚠️ Customer Complaints' : '📋 Claims'}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                Item: {job?.item_code} · {historyPanel.data.length} record{historyPanel.data.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => exportHistoryExcel(historyPanel.type, historyPanel.data)}
                style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                ⬇ Export Excel
              </button>
              <button onClick={() => setHistoryPanel(null)}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          </div>

          {/* Panel body: Excel-style table */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            {historyPanel.type === 'complaints' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '700px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                  <tr>
                    {['Ref No.','Date','Customer','Description','Severity','Status','Resolution'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f8fafc' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyPanel.data.map((row, i) => {
                    const sc = SEV_COLORS[row.severity] || { bg: '#f8fafc', color: '#64748b' }
                    const stc = { open: { bg: '#fef2f2', color: '#991b1b' }, investigating: { bg: '#fff7ed', color: '#c2410c' }, resolved: { bg: '#f0fdf4', color: '#15803d' }, closed: { bg: '#f8fafc', color: '#64748b' } }[row.status] || { bg: '#f8fafc', color: '#64748b' }
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: '600', whiteSpace: 'nowrap' }}>{row.complaint_ref || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.complaint_date ? row.complaint_date.slice(0,10) : '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#334155', whiteSpace: 'nowrap' }}>{row.customer_name || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#475569', maxWidth: '240px' }}>{row.description || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {row.severity ? <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{row.severity}</span> : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: stc.bg, color: stc.color, padding: '2px 8px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{row.status?.replace(/_/g,' ')}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748b', maxWidth: '180px' }}>{row.resolution || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '700px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                  <tr>
                    {['Ref No.','Date','Customer','Reason',`Amount (${currentCurrency.code})`,'Status','Resolution'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f8fafc' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyPanel.data.map((row, i) => {
                    const sc = CLAIM_STAT_COLORS[row.status] || { bg: '#f8fafc', color: '#64748b' }
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: '600', whiteSpace: 'nowrap' }}>{row.claim_ref || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{row.claim_date ? row.claim_date.slice(0,10) : '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#334155', whiteSpace: 'nowrap' }}>{row.customer_name || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#475569', maxWidth: '220px' }}>{row.reason || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#c2410c', fontWeight: '700', textAlign: 'right' }}>{row.claim_amount ? formatAmount(Number(row.claim_amount)) : '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{row.status?.replace(/_/g,' ')}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#64748b', maxWidth: '180px' }}>{row.resolution || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* Footer: total */}
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e5e7eb' }}>
                    <td colSpan={4} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '700', color: '#374151' }}>Total</td>
                    <td style={{ padding: '10px 14px', color: '#c2410c', fontWeight: '800', fontSize: '13px', textAlign: 'right' }}>
                      {formatAmount(historyPanel.data.reduce((sum, c) => sum + (Number(c.claim_amount) || 0), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>)}
      </div>

    </div>
  )
}
