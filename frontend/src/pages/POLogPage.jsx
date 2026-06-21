import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getLogs, createLog } from '../api/logEntries.js'

const ROLE_META = {
  qa:            { label: 'QA',       bg: '#ede9fe', color: '#5b21b6' },
  buying:        { label: 'Buying',   bg: '#e0f2fe', color: '#0369a1' },
  agency_user:   { label: 'Agency',   bg: '#dcfce7', color: '#166534' },
  supplier_user: { label: 'Supplier', bg: '#fce7f3', color: '#9d174d' },
  admin:         { label: 'Admin',    bg: '#fee2e2', color: '#991b1b' },
}

export default function POLogPage() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const [poNoFilter, setPoNoFilter]   = useState(searchParams.get('po_no') || '')
  const [jobIdFilter, setJobIdFilter] = useState(searchParams.get('job_id') || '')
  const [appliedPoNo, setAppliedPoNo]   = useState(searchParams.get('po_no') || '')
  const [appliedJobId, setAppliedJobId] = useState(searchParams.get('job_id') || '')

  const [logs, setLogs]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [posting, setPosting]     = useState(false)
  const [postError, setPostError] = useState('')
  const [postSuccess, setPostSuccess] = useState('')
  const [textFocused, setTextFocused] = useState(false)

  const fetchLogs = async (poNo, jobId) => {
    setLoading(true); setError('')
    try {
      const params = {}
      if (poNo) params.po_no = poNo
      if (jobId) params.job_id = jobId
      const res = await getLogs(params)
      setLogs(Array.isArray(res.data) ? res.data : res.data?.logs || [])
    } catch { setError('Failed to load log entries.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchLogs(appliedPoNo, appliedJobId)
    const interval = setInterval(() => fetchLogs(appliedPoNo, appliedJobId), 30000)
    return () => clearInterval(interval)
  }, [appliedPoNo, appliedJobId])

  const handleFilter = (e) => {
    e.preventDefault()
    setAppliedPoNo(poNoFilter.trim()); setAppliedJobId(jobIdFilter.trim())
    const params = {}
    if (poNoFilter.trim()) params.po_no = poNoFilter.trim()
    if (jobIdFilter.trim()) params.job_id = jobIdFilter.trim()
    setSearchParams(params)
  }

  const handleClear = () => {
    setPoNoFilter(''); setJobIdFilter('')
    setAppliedPoNo(''); setAppliedJobId('')
    setSearchParams({})
  }

  const handlePost = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return
    if (!appliedPoNo && !appliedJobId) { setPostError('Filter by PO Number or Job ID before posting.'); return }
    setPosting(true); setPostError(''); setPostSuccess('')
    try {
      const data = { message: newMessage.trim() }
      if (appliedPoNo) data.po_no = appliedPoNo
      if (appliedJobId) data.job_id = appliedJobId
      await createLog(data)
      setNewMessage('')
      setPostSuccess('Remark posted successfully.')
      fetchLogs(appliedPoNo, appliedJobId)
    } catch { setPostError('Failed to post remark.') }
    finally { setPosting(false) }
  }

  const hasFilter = appliedPoNo || appliedJobId

  return (
    <div className="page">
      <Navbar />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '36px 28px' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 className="page-title">{t('nav_po_log')}</h1>
          <p className="page-subtitle">{t('po_log_subtitle') || 'View and post log entries for purchase orders and inspection jobs.'}</p>
        </div>

        {/* Filter */}
        <div className="card mb-6" style={{ padding: '20px 24px' }}>
          <h2 className="section-title" style={{ marginBottom: '16px' }}>{t('po_log_filter') || 'Filter Entries'}</h2>
          <form onSubmit={handleFilter} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('th_po_no')}
              </label>
              <input type="text" value={poNoFilter} onChange={e => setPoNoFilter(e.target.value)}
                placeholder="e.g. PO-2024-001" className="input" />
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('th_job_id')}
              </label>
              <input type="text" value={jobIdFilter} onChange={e => setJobIdFilter(e.target.value)}
                placeholder="Job ID or ref…" className="input" />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary">{t('common_search')}</button>
              <button type="button" onClick={handleClear} className="btn btn-ghost">{t('common_cancel')}</button>
            </div>
          </form>

          {hasFilter && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Filtering by:</span>
              {appliedPoNo && <span style={{ background: '#FEF0EB', color: '#E8470F', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>PO: {appliedPoNo}</span>}
              {appliedJobId && <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>Job: {appliedJobId.slice(0, 12)}…</span>}
            </div>
          )}
        </div>

        {/* Log feed */}
        <div className="card mb-6" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <h2 className="section-title">
              Log Entries {!loading && <span style={{ fontWeight: '400', color: '#94a3b8', fontSize: '13px' }}>({logs.length})</span>}
            </h2>
          </div>

          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : error ? (
            <div style={{ padding: '24px' }}><div className="alert alert-error">{error}</div></div>
          ) : logs.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '36px' }}>📝</div>
              <p>No log entries found.{!hasFilter && ' Use the filter above to search by PO Number or Job ID.'}</p>
            </div>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {logs.map((log, idx) => {
                const rm = ROLE_META[log.author_role] || { label: log.author_role, bg: '#f1f5f9', color: '#475569' }
                return (
                  <div key={log.id || idx} style={{
                    padding: '16px 24px',
                    borderBottom: idx < logs.length - 1 ? '1px solid #f1f5f9' : 'none',
                    display: 'flex', gap: '14px', alignItems: 'flex-start',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: rm.bg, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: '700', color: rm.color,
                    }}>
                      {rm.label.charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="flex-between" style={{ marginBottom: '5px', flexWrap: 'wrap', gap: '6px' }}>
                        <div className="flex-center" style={{ flexWrap: 'wrap', gap: '6px' }}>
                          <span style={{ background: rm.bg, color: rm.color, fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {rm.label}
                          </span>
                          {log.po_no && <span style={{ fontSize: '12px', color: '#64748b' }}>PO: <strong>{log.po_no}</strong></span>}
                          {log.job_id && (
                            <Link to={`/jobs/${log.job_id}`} style={{ fontSize: '12px', color: '#E8470F', textDecoration: 'none', fontWeight: '500' }}>
                              Job: {log.job_ref || String(log.job_id).slice(0, 8) + '…'}
                            </Link>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: '1.55' }}>{log.message}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Post remark */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="section-title" style={{ marginBottom: '16px' }}>{t('job_post_remark')}</h2>

          {postError && <div className="alert alert-error mb-4">{postError}</div>}
          {postSuccess && <div className="alert alert-success mb-4">{postSuccess}</div>}

          <form onSubmit={handlePost}>
            <textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder={!hasFilter ? 'Filter by PO Number or Job ID first, then post a remark…' : 'Type your remark here…'}
              rows={4}
              disabled={!hasFilter}
              className="textarea"
              style={{
                borderColor: textFocused ? '#E8470F' : '#e2e8f0',
                boxShadow: textFocused ? '0 0 0 3px rgba(232,71,15,0.12)' : 'none',
                background: !hasFilter ? '#f8fafc' : '#fff',
              }}
              onFocus={() => setTextFocused(true)}
              onBlur={() => setTextFocused(false)}
            />
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                type="submit"
                disabled={posting || !newMessage.trim() || !hasFilter}
                className="btn btn-primary"
              >
                {posting ? t('common_saving') : t('job_post_remark')}
              </button>
              {!hasFilter && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Filter by PO No or Job ID to enable posting</span>}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
