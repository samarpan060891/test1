import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getJobs } from '../api/inspectionJobs.js'
import { getNotifications } from '../api/notifications.js'
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

function StatusBadge({ status }) {
  const style = statusColors[status] || { backgroundColor: '#f3f4f6', color: '#374151' }
  return (
    <span style={{
      ...style,
      padding: '3px 10px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: '600',
      whiteSpace: 'nowrap'
    }}>
      {statusLabel[status] || status}
    </span>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      getJobs().catch(() => ({ data: [] })),
      getNotifications().catch(() => ({ data: [] }))
    ]).then(([jobsRes, notifRes]) => {
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : jobsRes.data?.jobs || [])
      setNotifications(Array.isArray(notifRes.data) ? notifRes.data : notifRes.data?.notifications || [])
    }).catch(err => {
      setError('Failed to load dashboard data.')
    }).finally(() => setLoading(false))
  }, [])

  const totalJobs = jobs.length
  const pendingQA = jobs.filter(j => j.status === 'submitted_pending_qa').length
  const approved = jobs.filter(j => j.status === 'qa_approved').length
  const rejected = jobs.filter(j => j.status === 'qa_rejected').length

  const [downloading, setDownloading] = useState(false)
  const handleDownloadReport = async () => {
    setDownloading(true)
    try {
      const res = await client.get('/reports/download', { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `QC_Inspection_Report_${new Date().toISOString().slice(0,10)}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Failed to download report. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  const statCard = (label, value, color) => (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '10px',
      padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      borderLeft: `4px solid ${color}`,
      minWidth: '140px',
      flex: 1
    }}>
      <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: '32px', fontWeight: '700', color }}>{value}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />

      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '700', color: '#111827' }}>Dashboard</h1>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
              Welcome back, {user?.email}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              style={{
                backgroundColor: downloading ? '#6b7280' : '#059669',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '14px',
                fontWeight: '600',
                cursor: downloading ? 'not-allowed' : 'pointer'
              }}
            >
              {downloading ? 'Downloading...' : '⬇ Download Report'}
            </button>
            {(user?.role === 'qa' || user?.role === 'buying') && (
              <Link
                to="/map-inspection"
                style={{
                  backgroundColor: '#1e40af',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                + Map New Inspection
              </Link>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {statCard('Total Jobs', totalJobs, '#1e40af')}
          {statCard('Pending QA Review', pendingQA, '#d97706')}
          {statCard('Approved', approved, '#059669')}
          {statCard('Rejected', rejected, '#dc2626')}
        </div>

        {/* Main content: table + notifications */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Jobs table */}
          <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>Inspection Jobs</h2>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading jobs...</div>
            ) : error ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>{error}</div>
            ) : jobs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No inspection jobs found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      {['Job ID', 'Stage', 'PO No', 'Item', 'Supplier', 'Agency', 'Status', 'Date', 'Actions'].map(h => (
                        <th key={h} style={{
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          borderBottom: '1px solid #e5e7eb',
                          whiteSpace: 'nowrap'
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job, idx) => (
                      <tr key={job.job_id || job.id || idx} style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.1s'
                      }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                      >
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151', fontFamily: 'monospace' }}>
                          {job.job_ref || String(job.job_id || '').slice(0, 8) + '...'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {job.inspection_stage ? (
                            <span style={{
                              fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px',
                              backgroundColor: { pre_production: '#fef3c7', inline: '#dbeafe', final: '#dcfce7', loading: '#f3e8ff' }[job.inspection_stage] || '#f3f4f6',
                              color: { pre_production: '#92400e', inline: '#1e40af', final: '#166534', loading: '#6b21a8' }[job.inspection_stage] || '#374151',
                            }}>
                              {{ pre_production: 'Pre-Production', inline: 'In-Line', final: 'Final', loading: 'Loading' }[job.inspection_stage] || job.inspection_stage}
                            </span>
                          ) : <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                          {job.po_no || '-'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>
                          {job.item_code || '-'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>
                          {job.supplier_code || '-'}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>
                          {job.agency_code || '-'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <StatusBadge status={job.status} />
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {job.inspection_date ? new Date(job.inspection_date).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <Link
                            to={`/jobs/${job.job_id || job.id}`}
                            style={{
                              color: '#1e40af',
                              fontSize: '13px',
                              fontWeight: '500',
                              textDecoration: 'none',
                              padding: '4px 10px',
                              border: '1px solid #bfdbfe',
                              borderRadius: '5px',
                              backgroundColor: '#eff6ff'
                            }}
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Notifications panel */}
          <div style={{
            width: '300px',
            flexShrink: 0,
            backgroundColor: '#fff',
            borderRadius: '10px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#111827' }}>
                Notifications
              </h2>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  No notifications
                </div>
              ) : (
                notifications.map((n, idx) => (
                  <div key={n.id || idx} style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid #f3f4f6',
                    borderLeft: `3px solid ${n.read ? '#e5e7eb' : '#3b82f6'}`
                  }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: '1.4' }}>
                      {n.message || n.body || JSON.stringify(n)}
                    </p>
                    {n.created_at && (
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9ca3af' }}>
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    )}
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
