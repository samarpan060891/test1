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

const STATUS_META = {
  mapped_awaiting_inspection: { label: 'Awaiting Inspection', bg: '#FEF0EB', color: '#E8470F' },
  submitted_pending_qa:       { label: 'Pending QA Review',  bg: '#fefce8', color: '#92400e' },
  qa_approved:                { label: 'Approved',           bg: '#f0fdf4', color: '#15803d' },
  qa_rejected:                { label: 'Rejected',           bg: '#fef2f2', color: '#dc2626' },
}

const STAGE_META = {
  pre_production: { label: 'Pre-Production', bg: '#fefce8', color: '#92400e' },
  inline:         { label: 'Inline',         bg: '#FEF0EB', color: '#E8470F' },
  final:          { label: 'Final',          bg: '#f0fdf4', color: '#15803d' },
  loading:        { label: 'Loading',        bg: '#faf5ff', color: '#7e22ce' },
}

const ROLE_META = {
  qa:            { label: 'QA',       bg: '#ede9fe', color: '#5b21b6' },
  buying:        { label: 'Buying',   bg: '#e0f2fe', color: '#0369a1' },
  agency_user:   { label: 'Agency',   bg: '#dcfce7', color: '#166534' },
  supplier_user: { label: 'Supplier', bg: '#fce7f3', color: '#9d174d' },
  admin:         { label: 'Admin',    bg: '#fee2e2', color: '#991b1b' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{ background: m.bg, color: m.color, padding: '5px 14px', borderRadius: '9999px', fontSize: '13px', fontWeight: '700' }}>
      {m.label}
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

  const [showReinspect, setShowReinspect] = useState(false)
  const [reinspectType, setReinspectType] = useState('agency')
  const [reinspectAgency, setReinspectAgency] = useState(null)
  const [reinspectDate, setReinspectDate] = useState('')
  const [reinspectLoading, setReinspectLoading] = useState(false)
  const [reinspectError, setReinspectError] = useState('')
  const [logFocused, setLogFocused] = useState(false)

  const fetchLogs = () => {
    setLogsLoading(true)
    getLogs({ job_id: id })
      .then(res => setLogs(Array.isArray(res.data) ? res.data : res.data?.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false))
  }

  const fetchJob = () => {
    getJob(id)
      .then(res => setJob(res.data?.job || res.data))
      .catch(() => setError('Failed to load job details.'))
      .finally(() => setJobLoading(false))
  }

  useEffect(() => {
    fetchJob(); fetchLogs()
    const interval = setInterval(() => { fetchJob(); fetchLogs() }, 30000)
    return () => clearInterval(interval)
  }, [id])

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

  return (
    <div className="page">
      <Navbar />

      <div className="page-content-narrow">
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
              <StatusBadge status={job.status} />
            </div>

            {/* Re-inspection banner */}
            {job.reinspection_job && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px' }}>🔁</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#92400e' }}>
                      Re-inspection triggered by {job.reinspection_job.triggered_by_role === 'qa' ? 'QA' : job.reinspection_job.triggered_by_role}
                      {job.reinspection_job.triggered_by_name ? ` — ${job.reinspection_job.triggered_by_name}` : ''}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b45309' }}>
                      New job: <strong>{job.reinspection_job.job_ref}</strong> · Status: <strong>{job.reinspection_job.status?.replace(/_/g, ' ')}</strong> · {new Date(job.reinspection_job.mapped_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Link to={`/jobs/${job.reinspection_job.job_id}`} className="btn btn-warning btn-sm">
                  View Re-inspection →
                </Link>
              </div>
            )}

            {/* Fields grid */}
            <div>
              {job.inspection_stage && (
                <Field label="Stage">
                  {stageMeta && (
                    <span style={{ background: stageMeta.bg, color: stageMeta.color, padding: '3px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' }}>
                      {stageMeta.label}
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
              {job.final_outcome && <Field label="Final Outcome">{job.final_outcome}</Field>}
              {job.qa_remarks && <Field label="QA Remarks"><span style={{ fontStyle: 'italic', color: '#475569' }}>{job.qa_remarks}</span></Field>}
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
              <Link to={`/po-log?job_id=${jobId}`} className="btn btn-ghost">
                📂 {t('nav_po_log')}
              </Link>
              <button onClick={handleDownloadPDF} disabled={pdfLoading} className="btn btn-success">
                {pdfLoading ? '⏳ Generating…' : '⬇ Download Report'}
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

        {/* Activity Log */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <h2 className="section-title">{t('job_activity_log') || 'Activity Log'}</h2>
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
      </div>
    </div>
  )
}
