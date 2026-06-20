import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getJob } from '../api/inspectionJobs.js'
import { getLogs, createLog } from '../api/logEntries.js'
import { searchAgencies } from '../api/masters.js'
import SearchableDropdown from '../components/SearchableDropdown.jsx'
import client from '../api/client.js'

const statusColors = {
  mapped_awaiting_inspection: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  submitted_pending_qa: { backgroundColor: '#fef3c7', color: '#d97706' },
  qa_approved: { backgroundColor: '#d1fae5', color: '#065f46' },
  qa_rejected: { backgroundColor: '#fee2e2', color: '#dc2626' }
}

const statusLabel = {
  mapped_awaiting_inspection: 'Awaiting Inspection',
  submitted_pending_qa: 'Pending QA Review',
  qa_approved: 'Approved',
  qa_rejected: 'Rejected'
}

function StatusBadge({ status, large }) {
  const style = statusColors[status] || { backgroundColor: '#f3f4f6', color: '#374151' }
  return (
    <span style={{
      ...style,
      padding: large ? '6px 16px' : '3px 10px',
      borderRadius: '9999px',
      fontSize: large ? '14px' : '12px',
      fontWeight: '600'
    }}>
      {statusLabel[status] || status}
    </span>
  )
}

const roleBadgeColors = {
  qa: { backgroundColor: '#ede9fe', color: '#5b21b6' },
  buying: { backgroundColor: '#e0f2fe', color: '#0369a1' },
  agency_user: { backgroundColor: '#d1fae5', color: '#065f46' },
  admin: { backgroundColor: '#fee2e2', color: '#dc2626' }
}

export default function JobDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
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

  // Re-inspection state
  const [showReinspect, setShowReinspect] = useState(false)
  const [reinspectType, setReinspectType] = useState('agency')
  const [reinspectAgency, setReinspectAgency] = useState(null)
  const [reinspectDate, setReinspectDate] = useState('')
  const [reinspectLoading, setReinspectLoading] = useState(false)
  const [reinspectError, setReinspectError] = useState('')

  const fetchLogs = () => {
    setLogsLoading(true)
    getLogs({ job_id: id })
      .then(res => setLogs(Array.isArray(res.data) ? res.data : res.data?.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false))
  }

  useEffect(() => {
    getJob(id)
      .then(res => setJob(res.data?.job || res.data))
      .catch(() => setError('Failed to load job details.'))
      .finally(() => setJobLoading(false))

    fetchLogs()
  }, [id])

  const handleLogSubmit = async (e) => {
    e.preventDefault()
    if (!logMessage.trim()) return
    setLogSubmitting(true)
    setLogError('')
    setLogSuccess('')
    try {
      await createLog({ job_id: id, message: logMessage.trim() })
      setLogMessage('')
      setLogSuccess('Log entry posted.')
      fetchLogs()
    } catch (err) {
      setLogError('Failed to post log entry.')
    } finally {
      setLogSubmitting(false)
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

  const fieldRow = (label, value) => (
    <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '12px 0' }}>
      <span style={{ width: '180px', flexShrink: 0, fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>{label}</span>
      <span style={{ fontSize: '14px', color: '#111827', fontWeight: '500', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )

  if (jobLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <p style={{ color: '#6b7280' }}>Loading job details...</p>
        </div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Navbar />
        <div style={{ maxWidth: '700px', margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ color: '#dc2626', fontSize: '16px' }}>{error || 'Job not found.'}</p>
          <Link to="/dashboard" style={{ color: '#1e40af', fontSize: '14px' }}>Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const jobId = job.job_id || job.id

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '20px', fontSize: '13px', color: '#6b7280' }}>
          <Link to="/dashboard" style={{ color: '#1e40af', textDecoration: 'none' }}>Dashboard</Link>
          <span style={{ margin: '0 8px' }}>/</span>
          <span>Job {job?.job_ref || String(jobId).slice(0, 8) + '...'}</span>
        </div>

        {/* Header card */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '10px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          padding: '28px 32px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '700', color: '#111827' }}>
                Inspection Job
              </h1>
              <code style={{ fontSize: '13px', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '3px 8px', borderRadius: '4px' }}>
                {jobId}
              </code>
            </div>
            <StatusBadge status={job.status} large />
          </div>

          {/* Fields */}
          <div>
            {fieldRow('Job Reference', job.job_ref || '—')}
            {job.inspection_stage && fieldRow('Inspection Stage', (() => {
              const map = { pre_production: 'Pre-Production Sample', inline: 'In-Line Production', final: 'Final Inspection', loading: 'Container Loading' }
              const colors = { pre_production: ['#fef3c7','#92400e'], inline: ['#dbeafe','#1e40af'], final: ['#dcfce7','#166534'], loading: ['#f3e8ff','#6b21a8'] }
              const [bg, color] = colors[job.inspection_stage] || ['#f3f4f6','#374151']
              return <span style={{ backgroundColor: bg, color, padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700' }}>{map[job.inspection_stage] || job.inspection_stage}</span>
            })())}
            {fieldRow('PO Number', job.po_no)}
            {fieldRow('Item Code', job.item_code)}
            {fieldRow('Supplier Code', job.supplier_code)}
            {fieldRow('Agency Code', job.agency_code)}
            {fieldRow('Planned Inspection Date', job.inspection_date ? new Date(job.inspection_date).toLocaleDateString() : null)}
            {fieldRow('Actual Inspection Date', job.actual_inspection_date ? new Date(job.actual_inspection_date).toLocaleDateString() : '—')}
            {fieldRow('Submitted At', job.submitted_at ? new Date(job.submitted_at).toLocaleString() : '—')}
            {fieldRow('QA Decision At', job.decided_at ? new Date(job.decided_at).toLocaleString() : '—')}
            {fieldRow('Created At', job.created_at ? new Date(job.created_at).toLocaleString() : null)}
            {job.final_outcome && fieldRow('Final Outcome', job.final_outcome)}
            {job.qa_remarks && fieldRow('QA Remarks', job.qa_remarks)}
          </div>

          {/* Action buttons */}
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {['qa', 'buying'].includes(user?.role) && job.status === 'qa_rejected' && (
              <button
                onClick={() => setShowReinspect(true)}
                style={{
                  backgroundColor: '#d97706', color: '#fff', border: 'none',
                  padding: '10px 22px', borderRadius: '7px', fontSize: '14px',
                  fontWeight: '600', cursor: 'pointer'
                }}
              >
                Create Re-inspection
              </button>
            )}
            {user?.role === 'agency_user' && job.status === 'mapped_awaiting_inspection' && job.inspection_type !== 'self' && (
              <button
                onClick={() => navigate(`/jobs/${jobId}/fill`)}
                style={{
                  backgroundColor: '#1e40af',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '7px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Fill Checklist
              </button>
            )}
            {user?.role === 'supplier_user' && job.status === 'mapped_awaiting_inspection' && job.inspection_type === 'self' && (
              <button
                onClick={() => navigate(`/jobs/${jobId}/fill`)}
                style={{
                  backgroundColor: '#1e40af',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '7px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Fill Checklist (Self Inspection)
              </button>
            )}
            {user?.role === 'qa' && job.status === 'submitted_pending_qa' && (
              <button
                onClick={() => navigate(`/jobs/${jobId}/review`)}
                style={{
                  backgroundColor: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '7px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Review & Decide
              </button>
            )}
            <Link
              to={`/po-log?job_id=${jobId}`}
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                padding: '10px 18px',
                borderRadius: '7px',
                fontSize: '14px',
                fontWeight: '500',
                textDecoration: 'none'
              }}
            >
              View PO Log
            </Link>
          </div>
        </div>

        {/* Re-inspection Modal */}
        {showReinspect && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
          }}>
            <div style={{
              backgroundColor: '#fff', borderRadius: '12px', padding: '32px',
              width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
            }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                Create Re-inspection
              </h2>
              <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#6b7280' }}>
                PO: <strong>{job.po_no}</strong> — a new inspection job will be created.
              </p>

              {reinspectError && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>
                  {reinspectError}
                </div>
              )}

              <form onSubmit={handleReinspect}>
                {/* Inspection Type */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>Inspection Type</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[{ value: 'agency', label: '🏢 Agency' }, { value: 'self', label: '🏭 Self' }].map(opt => (
                      <div key={opt.value} onClick={() => { setReinspectType(opt.value); setReinspectAgency(null) }}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '7px', cursor: 'pointer', textAlign: 'center',
                          border: `2px solid ${reinspectType === opt.value ? '#1e40af' : '#e5e7eb'}`,
                          backgroundColor: reinspectType === opt.value ? '#eff6ff' : '#fff',
                          fontWeight: '600', fontSize: '13px', color: reinspectType === opt.value ? '#1e40af' : '#374151'
                        }}>
                        {opt.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agency */}
                {reinspectType === 'agency' && (
                  <SearchableDropdown
                    label="Quality Agency"
                    required
                    placeholder="Search agency..."
                    value={reinspectAgency}
                    onChange={setReinspectAgency}
                    fetchOptions={fetchAgencies}
                  />
                )}

                {/* Date */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                    Inspection Date <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input type="date" value={reinspectDate} onChange={e => setReinspectDate(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="submit" disabled={reinspectLoading}
                    style={{ flex: 1, backgroundColor: reinspectLoading ? '#93c5fd' : '#d97706', color: '#fff', border: 'none', padding: '11px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: reinspectLoading ? 'not-allowed' : 'pointer' }}>
                    {reinspectLoading ? 'Creating...' : 'Create Job'}
                  </button>
                  <button type="button" onClick={() => { setShowReinspect(false); setReinspectError('') }}
                    style={{ flex: 1, backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', padding: '11px', borderRadius: '7px', fontSize: '14px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Log Entries */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '10px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>Activity Log</h2>
          </div>

          {/* Timeline */}
          <div style={{ padding: '8px 24px', maxHeight: '360px', overflowY: 'auto' }}>
            {logsLoading ? (
              <p style={{ color: '#6b7280', padding: '16px 0', fontSize: '14px' }}>Loading logs...</p>
            ) : logs.length === 0 ? (
              <p style={{ color: '#9ca3af', padding: '20px 0', fontSize: '14px', textAlign: 'center' }}>No log entries yet.</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: '20px' }}>
                {/* Vertical line */}
                <div style={{
                  position: 'absolute',
                  left: '7px',
                  top: '12px',
                  bottom: '12px',
                  width: '2px',
                  backgroundColor: '#e5e7eb'
                }} />
                {logs.map((log, idx) => (
                  <div key={log.id || idx} style={{ position: 'relative', paddingBottom: '20px' }}>
                    {/* Dot */}
                    <div style={{
                      position: 'absolute',
                      left: '-17px',
                      top: '4px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: '#3b82f6',
                      border: '2px solid #fff',
                      boxShadow: '0 0 0 2px #3b82f6'
                    }} />
                    <div style={{
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{
                          ...(roleBadgeColors[log.author_role] || { backgroundColor: '#f3f4f6', color: '#374151' }),
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          textTransform: 'uppercase'
                        }}>
                          {log.author_role?.replace('_', ' ') || 'System'}
                        </span>
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                        {log.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New log form */}
          <div style={{ padding: '20px 24px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#374151' }}>Post a Remark</h3>
            {logError && (
              <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '8px' }}>{logError}</div>
            )}
            {logSuccess && (
              <div style={{ color: '#059669', fontSize: '13px', marginBottom: '8px' }}>{logSuccess}</div>
            )}
            <form onSubmit={handleLogSubmit}>
              <textarea
                value={logMessage}
                onChange={e => setLogMessage(e.target.value)}
                placeholder="Enter your remark or update..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              />
              <button
                type="submit"
                disabled={logSubmitting || !logMessage.trim()}
                style={{
                  marginTop: '10px',
                  backgroundColor: logSubmitting ? '#93c5fd' : '#1e40af',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: (logSubmitting || !logMessage.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                {logSubmitting ? 'Posting...' : 'Post Remark'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
