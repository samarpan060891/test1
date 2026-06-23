import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getJobs } from '../api/inspectionJobs.js'
import { getNotifications } from '../api/notifications.js'
import { getAdvices } from '../api/inspectionCosts.js'
import InspectionSummaryCard from '../components/InspectionSummaryCard.jsx'
import client from '../api/client.js'
import { useColumnFilter } from '../hooks/useColumnFilter.js'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import { TableScrollWrap } from '../components/TableScrollWrap.jsx'
import { useResizableColumns } from '../hooks/useResizableColumns.js'

const STATUS_META = {
  mapped_awaiting_inspection: { label: 'Awaiting Inspection', bg: '#eff6ff', color: '#1d4ed8' },
  submitted_pending_qa:       { label: 'Pending QA Review',  bg: '#fefce8', color: '#92400e' },
  qa_approved:                { label: 'Approved',           bg: '#f0fdf4', color: '#15803d' },
  qa_rejected:                { label: 'Rejected',           bg: '#fef2f2', color: '#dc2626' },
}

const PAYMENT_META = {
  pending_qa:       { label: 'Pending QA',       bg: '#FEF0EB', color: '#E8470F' },
  pending_buying:   { label: 'Pending Buying',    bg: '#fefce8', color: '#92400e' },
  pending_imports:  { label: 'Pending Imports',   bg: '#eff6ff', color: '#1d4ed8' },
  pending_accounts: { label: 'Pending Accounts',  bg: '#faf5ff', color: '#7e22ce' },
  paid:             { label: 'Paid',              bg: '#f0fdf4', color: '#15803d' },
  rejected:         { label: 'Advice Rejected',   bg: '#fef2f2', color: '#dc2626' },
}

const STAGE_META = {
  pre_production: { label: 'Pre-Prod', bg: '#fefce8', color: '#92400e' },
  inline:         { label: 'Inline',   bg: '#eff6ff', color: '#1d4ed8' },
  final:          { label: 'Final',    bg: '#f0fdf4', color: '#15803d' },
  loading:        { label: 'Loading',  bg: '#faf5ff', color: '#7e22ce' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{ background: m.bg, color: m.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11.5px', fontWeight: '700', whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function PaymentBadge({ status }) {
  if (!status) return <span style={{ color: '#94a3b8', fontSize: '12px' }}>No Advice</span>
  const m = PAYMENT_META[status] || { label: status, bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{ background: m.bg, color: m.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11.5px', fontWeight: '700', whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

function StageBadge({ stage, t }) {
  const m = STAGE_META[stage]
  if (!m) return <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
  return (
    <span style={{ background: m.bg, color: m.color, padding: '2px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      {m.label}
    </span>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [jobs, setJobs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [advices, setAdvices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true)
    return Promise.all([
      getJobs().catch(() => ({ data: [] })),
      getNotifications().catch(() => ({ data: [] })),
      getAdvices().catch(() => ({ data: [] })),
    ]).then(([jobsRes, notifRes, adviceRes]) => {
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : jobsRes.data?.jobs || [])
      setNotifications(Array.isArray(notifRes.data) ? notifRes.data : notifRes.data?.notifications || [])
      setAdvices(Array.isArray(adviceRes.data) ? adviceRes.data : [])
    }).catch(() => {
      if (!silent) setError('Failed to load dashboard data.')
    }).finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(true), 30000)
    return () => clearInterval(interval)
  }, [])

  const [activeFilter, setActiveFilter] = useState(null)

  const totalJobs = jobs.length
  const pendingQA = jobs.filter(j => j.status === 'submitted_pending_qa').length
  const approved  = jobs.filter(j => j.status === 'qa_approved').length
  const rejected  = jobs.filter(j => j.status === 'qa_rejected').length

  const cardFilteredJobs = activeFilter === 'pending' ? jobs.filter(j => j.status === 'submitted_pending_qa')
    : activeFilter === 'approved' ? jobs.filter(j => j.status === 'qa_approved')
    : activeFilter === 'rejected' ? jobs.filter(j => j.status === 'qa_rejected')
    : jobs

  const toggleFilter = (key) => setActiveFilter(p => p === key ? null : key)

  const JOB_COLS = [
    { key: 'job_ref',        label: 'Job ID' },
    { key: 'inspection_stage', label: 'Stage' },
    { key: 'po_no',          label: 'PO No' },
    { key: 'item_code',      label: 'Item' },
    { key: 'supplier_code',  label: 'Supplier' },
    { key: 'agency_code',    label: 'Agency' },
    { key: 'status',         label: 'Activity Status' },
    { key: 'payment_status', label: 'Payment Status' },
    { key: 'inspection_date',label: 'Date' },
    { key: null,             label: 'Actions' },
  ]
  const JOB_WIDTHS = [120, 90, 120, 90, 100, 100, 160, 160, 100, 80]
  const { filters: jobFilters, setFilter: setJobFilter, filtered: filteredJobs, hasActive: hasJobFilter, clearFilters: clearJobFilters } = useColumnFilter(cardFilteredJobs, JOB_COLS)
  const { widths: colWidths, getHandleProps } = useResizableColumns(JOB_WIDTHS)

  const [downloading, setDownloading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const handleDownloadReport = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append('from', dateFrom)
      if (dateTo) params.append('to', dateTo)
      const res = await client.get(`/reports/download?${params.toString()}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      const suffix = dateFrom || dateTo
        ? `_${dateFrom || 'start'}_to_${dateTo || 'today'}`
        : `_${new Date().toISOString().slice(0, 10)}`
      a.download = `Quality_Inspection_Summary${suffix}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      setShowDatePicker(false)
    } catch {
      alert('Failed to download. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page">
      <Navbar />

      <div className="page-content">
        {/* Inspection Charges Summary — topmost, matching InspectionCostPage */}
        {!loading && advices.length > 0 && (
          <InspectionSummaryCard advices={advices} showLink />
        )}

        {/* Page header */}
        <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 className="page-title">{t('dashboard_title')}</h1>
            <p className="page-subtitle">{t('dashboard_welcome')}, <strong>{user?.email}</strong></p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Download button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDatePicker(p => !p)}
                disabled={downloading}
                className="btn btn-success"
              >
                {downloading ? `⏳ ${t('dashboard_downloading')}` : `⬇ ${t('dashboard_download_summary')}`}
              </button>

              {showDatePicker && (
                <div style={{
                  position: 'absolute', top: '44px', right: 0, zIndex: 50,
                  background: '#fff', borderRadius: '12px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                  padding: '20px', width: '290px',
                  border: '1px solid #e2e8f0',
                }}>
                  <p style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{t('dashboard_date_range')}</p>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('dashboard_date_from')}</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ padding: '8px 12px', fontSize: '13px' }} />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('dashboard_date_to')}</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ padding: '8px 12px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleDownloadReport} disabled={downloading} className="btn btn-success" style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}>
                      {downloading ? `${t('dashboard_downloading')}` : `⬇ ${t('dashboard_download_btn')}`}
                    </button>
                    <button onClick={() => { setShowDatePicker(false); setDateFrom(''); setDateTo('') }} className="btn btn-ghost" style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}>
                      {t('common_cancel')}
                    </button>
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>{t('dashboard_leave_blank')}</p>
                </div>
              )}
            </div>

            {(user?.role === 'qa' || user?.role === 'buying') && (
              <Link to="/map-inspection" className="btn btn-primary">
                {t('dashboard_map_new')}
              </Link>
            )}
          </div>
        </div>

        {/* Stats — click to filter jobs table */}
        <div className="stat-grid mb-4">
          {[
            { key: null,       cls: 'blue',  accent: '#E8470F', label: t('dashboard_total_jobs'),   value: totalJobs },
            { key: 'pending',  cls: 'amber', accent: '#d97706', label: t('dashboard_pending_qa'),   value: pendingQA },
            { key: 'approved', cls: 'green', accent: '#059669', label: t('dashboard_approved'),     value: approved  },
            { key: 'rejected', cls: 'red',   accent: '#dc2626', label: t('dashboard_rejected'),     value: rejected  },
          ].map(({ key, cls, accent, label, value }) => {
            const isActive = activeFilter === key
            return (
              <div
                key={String(key)}
                className={`stat-card ${cls}`}
                onClick={() => toggleFilter(key)}
                style={{
                  cursor: 'pointer',
                  transform: isActive ? 'translateY(-2px)' : undefined,
                  transition: 'transform 0.1s',
                  userSelect: 'none',
                }}
              >
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {label}
                  {isActive && <span style={{ fontSize: '10px', fontWeight: '700', opacity: 0.7 }}>✕ FILTER</span>}
                </div>
                <div className="stat-value">{value}</div>
              </div>
            )
          })}
        </div>

        {/* Main layout */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Jobs table */}
          <div className="card" style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="section-title">{t('dashboard_inspection_jobs')}</h2>
                {activeFilter && (
                  <span style={{ background: '#FEF0EB', color: '#E8470F', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px' }}>
                    {activeFilter === 'pending' ? 'Pending QA' : activeFilter === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {filteredJobs.length}{activeFilter ? ` of ${totalJobs}` : ''} job(s)
              </span>
            </div>

            {loading ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : error ? (
              <div style={{ padding: '32px 24px' }}><div className="alert alert-error">{error}</div></div>
            ) : jobs.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '40px' }}>📋</div>
                <p>{t('dashboard_no_jobs')}</p>
              </div>
            ) : (
              <TableScrollWrap>
                <table className="data-table" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                  <colgroup>
                    {JOB_COLS.map((c, i) => <col key={i} style={{ width: colWidths[i] }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      {JOB_COLS.map((c, i) => (
                        <th key={c.label} style={{ position: 'relative', width: colWidths[i] }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            {c.label}
                            {c.key && (
                              <ColumnFilterDropdown
                                colKey={c.key}
                                data={cardFilteredJobs}
                                value={jobFilters[c.key] || ''}
                                onChange={v => setJobFilter(c.key, v)}
                                label={c.label}
                              />
                            )}
                            {!c.key && hasJobFilter && (
                              <button onClick={clearJobFilters} style={{ fontSize: '10px', color: '#E8470F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700', padding: '1px 4px', marginLeft: '2px' }}>✕</button>
                            )}
                          </span>
                          {i < JOB_COLS.length - 1 && (
                            <div className="col-resize-handle" {...getHandleProps(i)} />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job, idx) => (
                      <tr key={job.job_id || job.id || idx}>
                        <td className="text-mono" style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {job.job_ref || String(job.job_id || '').slice(0, 8) + '…'}
                        </td>
                        <td><StageBadge stage={job.inspection_stage} t={t} /></td>
                        <td style={{ fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.po_no || '—'}</td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.item_code || '—'}</td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.supplier_code || '—'}</td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.agency_code || '—'}</td>
                        <td><StatusBadge status={job.status} /></td>
                        <td><PaymentBadge status={job.payment_status} /></td>
                        <td style={{ color: '#94a3b8' }}>
                          {job.inspection_date ? new Date(job.inspection_date).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <Link
                            to={`/jobs/${job.job_id || job.id}`}
                            className="btn btn-outline btn-sm"
                          >
                            {t('th_view')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollWrap>
            )}
          </div>

          {/* Notifications */}
          <div className="card" style={{ width: '280px', flexShrink: 0, overflow: 'hidden' }}>
            <div className="card-header">
              <h2 className="section-title">{t('dashboard_notifications')}</h2>
              {notifications.length > 0 && (
                <span style={{
                  background: '#E8470F', color: '#fff',
                  fontSize: '11px', fontWeight: '700',
                  padding: '2px 8px', borderRadius: '9999px',
                }}>
                  {notifications.length}
                </span>
              )}
            </div>
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div className="empty-state" style={{ padding: '36px 20px' }}>
                  <div style={{ fontSize: '32px' }}>🔔</div>
                  <p>{t('dashboard_no_notifications')}</p>
                </div>
              ) : (
                notifications.map((n, idx) => {
                  // Translate standard events; REMARK_POSTED has dynamic content after the label
                  const eventKey = n.event_type ? `notif_${n.event_type}` : null
                  const translatedBase = eventKey ? t(eventKey) : null
                  let displayMsg
                  if (translatedBase && translatedBase !== eventKey) {
                    // For REMARK_POSTED, append the remark excerpt from the stored message
                    if (n.event_type === 'REMARK_POSTED' && n.message) {
                      const quoteMatch = n.message.match(/"(.+)"/)
                      displayMsg = quoteMatch ? `${translatedBase}: "${quoteMatch[1]}"` : translatedBase
                    } else {
                      displayMsg = translatedBase
                    }
                  } else {
                    displayMsg = n.message || n.body || n.event_type || ''
                  }
                  return (
                    <div key={n.id || idx} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                      <p className="notif-text">{displayMsg}</p>
                      <p className="notif-time">
                        {new Date(n.sent_at || n.created_at).toLocaleString()}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
