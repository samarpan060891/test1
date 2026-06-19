import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { mapJob } from '../api/inspectionJobs.js'

export default function MapInspectionPage() {
  const [poNo, setPoNo] = useState('')
  const [agencyCode, setAgencyCode] = useState('')
  const [inspectionDate, setInspectionDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [noTemplateError, setNoTemplateError] = useState(null)
  const [successJob, setSuccessJob] = useState(null)

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNoTemplateError(null)
    setSuccessJob(null)

    if (!poNo.trim() || !agencyCode.trim() || !inspectionDate) {
      setError('All fields are required.')
      return
    }

    setLoading(true)
    try {
      const res = await mapJob({
        po_no: poNo.trim(),
        agency_code: agencyCode.trim(),
        inspection_date: inspectionDate
      })
      setSuccessJob(res.data?.job || res.data)
    } catch (err) {
      const status = err?.response?.status
      const data = err?.response?.data

      if (status === 422 && (data?.code === 'NO_ACTIVE_TEMPLATE' || data?.error?.includes?.('template'))) {
        const category = data?.category || data?.details?.category || 'this category'
        setNoTemplateError(category)
      } else {
        const msg = data?.message || data?.error || 'Failed to map inspection job. Please try again.'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setPoNo('')
    setAgencyCode('')
    setInspectionDate('')
    setError('')
    setNoTemplateError(null)
    setSuccessJob(null)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '700', color: '#111827' }}>
            Map New Inspection
          </h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Assign an inspection job to an agency for a given PO.
          </p>
        </div>

        {/* No active template error */}
        {noTemplateError && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '2px solid #f87171',
            borderRadius: '10px',
            padding: '20px 24px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>⚠️</span>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#dc2626' }}>
                  No Active Checklist Template
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#7f1d1d', lineHeight: '1.5' }}>
                  No active checklist template found for <strong>{noTemplateError}</strong>.
                  Please ask QA to create and activate one before mapping this inspection.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Generic error */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Success */}
        {successJob && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '10px',
            padding: '20px 24px',
            marginBottom: '24px'
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: '#15803d' }}>
              Inspection Mapped Successfully!
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#166534' }}>
              Job ID: <code style={{ fontFamily: 'monospace', backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                {successJob.job_id || successJob.id}
              </code>
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Link
                to={`/jobs/${successJob.job_id || successJob.id}`}
                style={{
                  backgroundColor: '#15803d',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                View Job
              </Link>
              <button
                onClick={handleReset}
                style={{
                  backgroundColor: '#fff',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Map Another
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {!successJob && (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            padding: '32px'
          }}>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>PO Number <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="text"
                  value={poNo}
                  onChange={e => setPoNo(e.target.value)}
                  placeholder="e.g. PO-2024-001"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#1e40af'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Agency Code <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="text"
                  value={agencyCode}
                  onChange={e => setAgencyCode(e.target.value)}
                  placeholder="e.g. AGC001"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#1e40af'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
                <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Enter the agency code that will conduct this inspection.
                </p>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={labelStyle}>Inspection Date <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="date"
                  value={inspectionDate}
                  onChange={e => setInspectionDate(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#1e40af'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? '#93c5fd' : '#1e40af',
                    color: '#fff',
                    border: 'none',
                    padding: '11px 28px',
                    borderRadius: '7px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={e => { if (!loading) e.target.style.backgroundColor = '#1d4ed8' }}
                  onMouseLeave={e => { if (!loading) e.target.style.backgroundColor = '#1e40af' }}
                >
                  {loading ? 'Mapping...' : 'Map Inspection'}
                </button>
                <Link
                  to="/dashboard"
                  style={{
                    padding: '11px 20px',
                    borderRadius: '7px',
                    fontSize: '14px',
                    fontWeight: '500',
                    textDecoration: 'none',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#fff'
                  }}
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
