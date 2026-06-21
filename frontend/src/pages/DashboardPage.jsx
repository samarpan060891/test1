import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getJobs } from '../api/inspectionJobs.js'
import { getNotifications } from '../api/notifications.js'
import client from '../api/client.js'

const STATUS_META = {
  mapped_awaiting_inspection: { label: 'Awaiting Inspection', bg: '#eff6ff', color: '#1d4ed8' },
  submitted_pending_qa:       { label: 'Pending QA Review',  bg: '#fefce8', color: '#92400e' },
  qa_approved:                { label: 'Approved',           bg: '#f0fdf4', color: '#15803d' },
  qa_rejected:                { label: 'Rejected',           bg: '#fef2f2', color: '#dc2626' },
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true)
    return Promise.all([
      getJobs().catch(() => ({ data: [] })),
      getNotifications().catch(() => ({ data: [] }))
    ]).then(([jobsRes, notifRes]) => {
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : jobsRes.data?.jobs || [])
      setNotifications(Array.isArray(notifRes.data) ? notifRes.data : notifRes.data?.notifications || [])
    }).catch(() => {
      if (!silent) setError('Failed to load dashboard data.')
    }).finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(true), 30000)
    return () => clearInterval(interval)
  }, [])

  const totalJobs = jobs.length
  const pendingQA = jobs.filter(j => j.status === 'submitted_pending_qa').length
  const approved  = jobs.filter(j => j.status === 'qa_approved').length
  const rejected  = jobs.filter(j => j.status === 'qa_rejected').length

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
        {/* Page header */}
        <div className="flex-between mb-6" style={{ flexWrap: 'wrap', gap: '16px' }}>
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
                {downloading ? '⏳ Downloading…' : '⬇ Download Summary'}
              </button>

              {showDatePicker && (
                <div style={{
                  position: 'absolute', top: '44px', right: 0, zIndex: 50,
                  background: '#fff', borderRadius: '12px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                  padding: '20px', width: '290px',
                  border: '1px solid #e2e8f0',
                }}>
                  <p style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Select Date Range</p>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ padding: '8px 12px', fontSize: '13px' }} />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ padding: '8px 12px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleDownloadReport} disabled={downloading} className="btn btn-success" style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}>
                      {downloading ? 'Downloading…' : '⬇ Download'}
                    </button>
                    <button onClick={() => { setShowDatePicker(false); setDateFrom(''); setDateTo('') }} className="btn btn-ghost" style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}>
                      Cancel
                    </button>
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>Leave blank to download all data</p>
                </div>
              )}
            </div>

            {(user?.role === 'qa' || user?.role === 'buying') && (
              <Link to="/map-inspection" className="btn btn-primary">
                + Map New Inspection
              </Link>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="stat-grid mb-6">
          <div className="stat-card blue">
            <div className="stat-label">{t('dashboard_total_jobs')}</div>
            <div className="stat-value">{totalJobs}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-label">{t('dashboard_pending_qa')}</div>
            <div className="stat-value">{pendingQA}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">{t('dashboard_approved')}</div>
            <div className="stat-value">{approved}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">{t('dashboard_rejected')}</div>
            <div className="stat-value">{rejected}</div>
          </div>
        </div>

        {/* Main layout */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Jobs table */}
          <div className="card" style={{ flex: 1, overflow: 'hidden' }}>
            <div className="card-header">
              <h2 className="section-title">{t('dashboard_inspection_jobs')}</h2>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{jobs.length} total</span>
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
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {[t('th_job_id'), t('th_stage'), t('th_po_no'), t('th_item'), t('th_supplier'), t('th_agency'), t('th_status'), t('th_date'), t('th_actions')].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job, idx) => (
                      <tr key={job.job_id || job.id || idx}>
                        <td className="text-mono" style={{ color: '#475569' }}>
                          {job.job_ref || String(job.job_id || '').slice(0, 8) + '…'}
                        </td>
                        <td><StageBadge stage={job.inspection_stage} t={t} /></td>
                        <td style={{ fontWeight: '600', color: '#0f172a' }}>{job.po_no || '—'}</td>
                        <td>{job.item_code || '—'}</td>
                        <td>{job.supplier_code || '—'}</td>
                        <td>{job.agency_code || '—'}</td>
                        <td><StatusBadge status={job.status} /></td>
                        <td style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
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
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="card" style={{ width: '300px', flexShrink: 0, overflow: 'hidden' }}>
            <div className="card-header">
              <h2 className="section-title">{t('dashboard_notifications')}</h2>
              {notifications.length > 0 && (
                <span style={{
                  background: '#1d4ed8', color: '#fff',
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
                notifications.map((n, idx) => (
                  <div key={n.id || idx} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                    <p className="notif-text">
                      {n.message || n.body || n.event_type || JSON.stringify(n)}
                    </p>
                    <p className="notif-time">
                      {new Date(n.sent_at || n.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
