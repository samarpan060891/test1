import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getLogs, createLog } from '../api/logEntries.js'
import { getChecklistReport } from '../api/reports.js'

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

  const [sliderOpen, setSliderOpen]           = useState(false)
  const [checklistRows, setChecklistRows]     = useState([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError]   = useState('')
  const [clPoNo, setClPoNo]   = useState('')
  const [clJobId, setClJobId] = useState('')
  const [clFrom, setClFrom]   = useState('')
  const [clTo, setClTo]       = useState('')
  const sliderRef = useRef(null)

  const fetchChecklist = async (params = {}) => {
    setChecklistLoading(true); setChecklistError('')
    try {
      const res = await getChecklistReport(params)
      setChecklistRows(res.data || [])
    } catch (err) {
      setChecklistError(err?.response?.data?.error || 'Failed to load checklist data')
    } finally { setChecklistLoading(false) }
  }

  const openSlider = () => {
    setSliderOpen(true)
    fetchChecklist({ po_no: appliedPoNo || undefined, job_id: appliedJobId || undefined })
    setClPoNo(appliedPoNo); setClJobId(appliedJobId); setClFrom(''); setClTo('')
  }

  const closeSlider = () => setSliderOpen(false)

  useEffect(() => {
    if (!sliderOpen) return
    const handleKey = (e) => { if (e.key === 'Escape') closeSlider() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [sliderOpen])

  const RESULT_META = {
    pass: { bg: '#f0fdf4', color: '#15803d' },
    fail: { bg: '#fef2f2', color: '#dc2626' },
    na:   { bg: '#f1f5f9', color: '#475569' },
  }
  const CRIT_META = {
    critical: { bg: '#fef2f2', color: '#dc2626' },
    major:    { bg: '#fefce8', color: '#92400e' },
    minor:    { bg: '#f0fdf4', color: '#15803d' },
  }

  // Group checklist rows by job for display
  const groupedByJob = checklistRows.reduce((acc, row) => {
    const key = row.job_ref || row.po_no
    if (!acc[key]) acc[key] = { meta: row, items: [] }
    acc[key].items.push(row)
    return acc
  }, {})

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

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px 24px' }}>
        {/* Header */}
        <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 className="page-title">{t('nav_po_log')}</h1>
            <p className="page-subtitle">{t('po_log_subtitle') || 'View and post log entries for purchase orders and inspection jobs.'}</p>
          </div>
          <button onClick={openSlider} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {t('polog_view_checklist')}
          </button>
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
                {t('polog_job_ref_label')}
              </label>
              <input type="text" value={jobIdFilter} onChange={e => setJobIdFilter(e.target.value)}
                placeholder="e.g. JOB-2026-001" className="input" />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary">{t('common_search')}</button>
              <button type="button" onClick={handleClear} className="btn btn-ghost">{t('common_cancel')}</button>
            </div>
          </form>

          {hasFilter && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{t('common_filtering_by')}:</span>
              {appliedPoNo && <span style={{ background: '#FEF0EB', color: '#E8470F', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>PO: {appliedPoNo}</span>}
              {appliedJobId && <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>Job: {appliedJobId}</span>}
            </div>
          )}
        </div>

        {/* Log feed */}
        <div className="card mb-6" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <h2 className="section-title">
              {t('polog_log_entries')} {!loading && <span style={{ fontWeight: '400', color: '#94a3b8', fontSize: '13px' }}>({logs.length})</span>}
            </h2>
          </div>

          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : error ? (
            <div style={{ padding: '24px' }}><div className="alert alert-error">{error}</div></div>
          ) : logs.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '36px' }}>📝</div>
              <p>{t('polog_no_logs')}{!hasFilter && ` ${t('polog_use_filter')}`}</p>
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
                              {log.job_ref || t('common_view_job')}
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
              placeholder={!hasFilter ? t('polog_use_filter') : t('polog_placeholder_job')}
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
              {!hasFilter && <span style={{ fontSize: '12px', color: '#94a3b8' }}>{t('polog_use_filter')}</span>}
            </div>
          </form>
        </div>
      </div>

      {/* ── Checklist Report Slider ──────────────────────────────────────── */}
      {/* Backdrop */}
      {sliderOpen && (
        <div
          onClick={closeSlider}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 200, backdropFilter: 'blur(2px)', transition: 'opacity 0.2s' }}
        />
      )}

      {/* Panel */}
      <div ref={sliderRef} style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(820px, 92vw)',
        background: '#fff',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        transform: sliderOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Slider header */}
        <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#fff' }}>{t('polog_checklist_title')}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{checklistRows.length} {t('polog_responses')}</div>
          </div>
          <button onClick={closeSlider} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
            ×
          </button>
        </div>

        {/* Slider filters */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px' }}>{t('col_po_no')}</label>
              <input type="text" value={clPoNo} onChange={e => setClPoNo(e.target.value)} placeholder="e.g. PO-2026-001"
                style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', width: '150px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px' }}>{t('polog_job_ref_label')}</label>
              <input type="text" value={clJobId} onChange={e => setClJobId(e.target.value)} placeholder="Job ref…"
                style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', width: '140px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px' }}>{t('common_from')}</label>
              <input type="date" value={clFrom} onChange={e => setClFrom(e.target.value)}
                style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px' }}>{t('common_to')}</label>
              <input type="date" value={clTo} onChange={e => setClTo(e.target.value)}
                style={{ padding: '5px 10px', border: '1.5px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
            </div>
            <button onClick={() => fetchChecklist({ po_no: clPoNo || undefined, job_id: clJobId || undefined, from: clFrom || undefined, to: clTo || undefined })}
              className="btn btn-primary btn-sm" disabled={checklistLoading}>
              {checklistLoading ? '…' : t('common_apply')}
            </button>
            <button onClick={() => { setClPoNo(''); setClJobId(''); setClFrom(''); setClTo(''); fetchChecklist({}) }}
              className="btn btn-ghost btn-sm">{t('common_clear')}</button>
          </div>
        </div>

        {/* Slider body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {checklistLoading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : checklistError ? (
            <div className="alert alert-error">{checklistError}</div>
          ) : checklistRows.length === 0 ? (
            <div className="empty-state"><div style={{ fontSize: '36px' }}>📋</div><p>{t('polog_no_checklist')}</p></div>
          ) : (
            Object.entries(groupedByJob).map(([jobRef, { meta, items }]) => (
              <div key={jobRef} style={{ marginBottom: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                {/* Job header */}
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontWeight: '800', fontSize: '13px', color: '#E8470F' }}>{meta.job_ref}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>PO: <strong>{meta.po_no}</strong></span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{meta.item_name}</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Supplier: <strong>{meta.supplier_name}</strong></span>
                  {meta.inspection_date && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(meta.inspection_date).toLocaleDateString()}</span>}
                  {meta.final_outcome && (
                    <span style={{ background: meta.final_outcome === 'pass' ? '#f0fdf4' : '#fef2f2', color: meta.final_outcome === 'pass' ? '#15803d' : '#dc2626', padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>
                      {meta.final_outcome === 'pass' ? 'Pass' : 'Fail'}
                    </span>
                  )}
                </div>
                {/* Checklist items table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {[t('col_section'), t('col_checkpoint'), t('col_criticality'), t('col_result'), t('col_remark')].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const rm = RESULT_META[item.result] || { bg: '#f1f5f9', color: '#475569' }
                        const cm = CRIT_META[item.criticality] || { bg: '#f1f5f9', color: '#475569' }
                        return (
                          <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td style={{ padding: '6px 10px', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap' }}>{item.section || '—'}</td>
                            <td style={{ padding: '6px 10px', color: '#0f172a', maxWidth: '260px' }}>{item.checkpoint_text}</td>
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                              {item.criticality && <span style={{ ...cm, padding: '2px 7px', borderRadius: '9999px', fontSize: '10px', fontWeight: '700', textTransform: 'capitalize' }}>{item.criticality}</span>}
                            </td>
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                              <span style={{ ...rm, padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>{item.result || '—'}</span>
                            </td>
                            <td style={{ padding: '6px 10px', color: '#64748b', maxWidth: '180px', wordBreak: 'break-word' }}>{item.remark || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
