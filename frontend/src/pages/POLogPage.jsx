import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getLogs, createLog } from '../api/logEntries.js'

const roleBadgeColors = {
  qa: { backgroundColor: '#ede9fe', color: '#5b21b6' },
  buying: { backgroundColor: '#e0f2fe', color: '#0369a1' },
  agency_user: { backgroundColor: '#d1fae5', color: '#065f46' },
  admin: { backgroundColor: '#fee2e2', color: '#dc2626' }
}

export default function POLogPage() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const [poNoFilter, setPoNoFilter] = useState(searchParams.get('po_no') || '')
  const [jobIdFilter, setJobIdFilter] = useState(searchParams.get('job_id') || '')

  const [appliedPoNo, setAppliedPoNo] = useState(searchParams.get('po_no') || '')
  const [appliedJobId, setAppliedJobId] = useState(searchParams.get('job_id') || '')

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [newMessage, setNewMessage] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const [postSuccess, setPostSuccess] = useState('')

  const fetchLogs = async (poNo, jobId) => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (poNo) params.po_no = poNo
      if (jobId) params.job_id = jobId
      const res = await getLogs(params)
      setLogs(Array.isArray(res.data) ? res.data : res.data?.logs || [])
    } catch (err) {
      setError('Failed to load log entries.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs(appliedPoNo, appliedJobId)
    const interval = setInterval(() => fetchLogs(appliedPoNo, appliedJobId), 30000)
    return () => clearInterval(interval)
  }, [appliedPoNo, appliedJobId])

  const handleFilter = (e) => {
    e.preventDefault()
    setAppliedPoNo(poNoFilter.trim())
    setAppliedJobId(jobIdFilter.trim())
    const params = {}
    if (poNoFilter.trim()) params.po_no = poNoFilter.trim()
    if (jobIdFilter.trim()) params.job_id = jobIdFilter.trim()
    setSearchParams(params)
  }

  const handleClear = () => {
    setPoNoFilter('')
    setJobIdFilter('')
    setAppliedPoNo('')
    setAppliedJobId('')
    setSearchParams({})
  }

  const handlePost = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return
    if (!appliedPoNo && !appliedJobId) {
      setPostError('Please filter by PO Number or Job ID before posting a remark.')
      return
    }
    setPosting(true)
    setPostError('')
    setPostSuccess('')
    try {
      const data = { message: newMessage.trim() }
      if (appliedPoNo) data.po_no = appliedPoNo
      if (appliedJobId) data.job_id = appliedJobId
      await createLog(data)
      setNewMessage('')
      setPostSuccess('Remark posted successfully.')
      fetchLogs(appliedPoNo, appliedJobId)
    } catch (err) {
      setPostError('Failed to post remark.')
    } finally {
      setPosting(false)
    }
  }

  const inputStyle = {
    padding: '9px 13px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '700', color: '#111827' }}>{t('nav_po_log')}</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
            {t('po_log_subtitle') || 'View and post log entries for purchase orders and inspection jobs.'}
          </p>
        </div>

        {/* Filter form */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '10px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          padding: '20px 24px',
          marginBottom: '24px'
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>{t('po_log_filter') || 'Filter Entries'}</h2>
          <form onSubmit={handleFilter} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                {t('th_po_no')}
              </label>
              <input
                type="text"
                value={poNoFilter}
                onChange={e => setPoNoFilter(e.target.value)}
                placeholder="e.g. PO-2024-001"
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                {t('th_job_id')}
              </label>
              <input
                type="text"
                value={jobIdFilter}
                onChange={e => setJobIdFilter(e.target.value)}
                placeholder="e.g. job-uuid..."
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="submit"
                style={{
                  backgroundColor: '#1e40af',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('common_search')}
              </button>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  backgroundColor: '#fff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  padding: '9px 16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {t('common_cancel')}
              </button>
            </div>
          </form>

          {(appliedPoNo || appliedJobId) && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>Filtering by:</span>
              {appliedPoNo && (
                <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500' }}>
                  PO: {appliedPoNo}
                </span>
              )}
              {appliedJobId && (
                <span style={{ backgroundColor: '#f3e8ff', color: '#7c3aed', padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500' }}>
                  Job: {appliedJobId.slice(0, 12)}...
                </span>
              )}
            </div>
          )}
        </div>

        {/* Log feed */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '10px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          marginBottom: '24px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#111827' }}>
              Log Entries {!loading && <span style={{ color: '#6b7280', fontWeight: '400' }}>({logs.length})</span>}
            </h2>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>{t('common_loading')}</div>
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>{error}</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
              No log entries found.
              {(!appliedPoNo && !appliedJobId) && ' Use the filter above to search by PO Number or Job ID.'}
            </div>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {logs.map((log, idx) => (
                <div key={log.id || idx} style={{
                  padding: '16px 24px',
                  borderBottom: idx < logs.length - 1 ? '1px solid #f3f4f6' : 'none',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'flex-start'
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '14px',
                    fontWeight: '700',
                    color: '#374151'
                  }}>
                    {(log.author_role || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{
                        ...(roleBadgeColors[log.author_role] || { backgroundColor: '#f3f4f6', color: '#374151' }),
                        fontSize: '11px',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        textTransform: 'uppercase'
                      }}>
                        {log.author_role?.replace('_', ' ') || 'System'}
                      </span>
                      {log.po_no && (
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>PO: {log.po_no}</span>
                      )}
                      {log.job_id && (
                        <Link
                          to={`/jobs/${log.job_id}`}
                          style={{ fontSize: '12px', color: '#1e40af', textDecoration: 'none' }}
                        >
                          Job: {log.job_ref || String(log.job_id).slice(0, 8) + "..."}
                        </Link>
                      )}
                      <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: 'auto' }}>
                        {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
                      {log.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Post new remark */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '10px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          padding: '24px'
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600', color: '#111827' }}>{t('job_post_remark')}</h2>

          {postError && (
            <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '10px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '6px', border: '1px solid #fca5a5' }}>
              {postError}
            </div>
          )}
          {postSuccess && (
            <div style={{ color: '#059669', fontSize: '13px', marginBottom: '10px', padding: '10px 14px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #86efac' }}>
              {postSuccess}
            </div>
          )}

          <form onSubmit={handlePost}>
            <textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder={
                !appliedPoNo && !appliedJobId
                  ? 'Filter by PO Number or Job ID first, then post a remark...'
                  : 'Type your remark here...'
              }
              rows={4}
              disabled={!appliedPoNo && !appliedJobId}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box',
                outline: 'none',
                fontFamily: 'inherit',
                color: '#374151',
                backgroundColor: (!appliedPoNo && !appliedJobId) ? '#f9fafb' : '#fff'
              }}
            />
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                type="submit"
                disabled={posting || !newMessage.trim() || (!appliedPoNo && !appliedJobId)}
                style={{
                  backgroundColor: (posting || !newMessage.trim() || (!appliedPoNo && !appliedJobId)) ? '#9ca3af' : '#1e40af',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 22px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: (posting || !newMessage.trim() || (!appliedPoNo && !appliedJobId)) ? 'not-allowed' : 'pointer'
                }}
              >
                {posting ? t('common_saving') : t('job_post_remark')}
              </button>
              {(!appliedPoNo && !appliedJobId) && (
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                  Filter by PO No or Job ID to enable posting
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
