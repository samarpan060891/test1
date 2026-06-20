import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import SearchableDropdown from '../components/SearchableDropdown.jsx'
import { mapJob } from '../api/inspectionJobs.js'
import { searchPOs, searchAgencies } from '../api/masters.js'

export default function MapInspectionPage() {
  const [selectedPO, setSelectedPO] = useState(null)
  const [selectedAgency, setSelectedAgency] = useState(null)
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
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  }

  // Fetch functions for dropdowns
  const fetchPOs = async (search) => {
    const rows = await searchPOs(search)
    return rows.map(r => ({
      value: r.po_no,
      label: r.po_no,
      sublabel: `${r.item_name} · ${r.supplier_name} · Qty: ${r.quantity}`,
      meta: r,
    }))
  }

  const fetchAgencies = async (search) => {
    const rows = await searchAgencies(search)
    return rows.map(r => ({
      value: r.agency_code,
      label: r.name,
      sublabel: `${r.agency_code}${r.country ? ' · ' + r.country : ''}`,
      meta: r,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNoTemplateError(null)
    setSuccessJob(null)

    if (!selectedPO || !selectedAgency || !inspectionDate) {
      setError('All fields are required.')
      return
    }

    setLoading(true)
    try {
      const res = await mapJob({
        po_no: selectedPO.value,
        agency_code: selectedAgency.value,
        inspection_date: inspectionDate,
      })
      setSuccessJob(res.data?.job || res.data)
    } catch (err) {
      const status = err?.response?.status
      const data = err?.response?.data
      if (status === 422 && (data?.code === 'NO_ACTIVE_TEMPLATE' || data?.error?.includes?.('template'))) {
        setNoTemplateError(data?.category || data?.details?.category || 'this category')
      } else {
        setError(data?.message || data?.error || 'Failed to map inspection. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setSelectedPO(null)
    setSelectedAgency(null)
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
            backgroundColor: '#fef2f2', border: '2px solid #f87171',
            borderRadius: '10px', padding: '20px 24px', marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>⚠️</span>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#dc2626' }}>
                  No Active Checklist Template
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#7f1d1d', lineHeight: '1.5' }}>
                  No active checklist template found for <strong>{noTemplateError}</strong>.
                  Please create and activate one in Checklist Templates before mapping this inspection.
                </p>
                <Link to="/checklist-templates" style={{
                  display: 'inline-block', marginTop: '10px',
                  backgroundColor: '#dc2626', color: '#fff',
                  padding: '7px 14px', borderRadius: '6px',
                  textDecoration: 'none', fontSize: '13px', fontWeight: '600',
                }}>
                  Go to Checklist Templates
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Generic error */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2', border: '1px solid #fca5a5',
            color: '#dc2626', padding: '12px 16px', borderRadius: '6px',
            marginBottom: '20px', fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {/* Success */}
        {successJob && (
          <div style={{
            backgroundColor: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: '10px', padding: '20px 24px', marginBottom: '24px',
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
              <Link to={`/jobs/${successJob.job_id || successJob.id}`} style={{
                backgroundColor: '#15803d', color: '#fff', padding: '8px 16px',
                borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: '600',
              }}>
                View Job
              </Link>
              <button onClick={handleReset} style={{
                backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db',
                padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
              }}>
                Map Another
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {!successJob && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '10px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '32px',
          }}>
            <form onSubmit={handleSubmit}>

              {/* PO searchable dropdown */}
              <SearchableDropdown
                label="Purchase Order (PO)"
                required
                placeholder="Search by PO number, item name or supplier..."
                value={selectedPO}
                onChange={setSelectedPO}
                fetchOptions={fetchPOs}
              />

              {/* Show PO details once selected */}
              {selectedPO?.meta && (
                <div style={{
                  marginTop: '-12px', marginBottom: '20px',
                  padding: '12px 16px', backgroundColor: '#f8fafc',
                  borderRadius: '6px', border: '1px solid #e2e8f0',
                  fontSize: '13px', color: '#475569',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div><span style={{ fontWeight: '600' }}>Item:</span> {selectedPO.meta.item_name}</div>
                    <div><span style={{ fontWeight: '600' }}>Category:</span> {selectedPO.meta.category} / {selectedPO.meta.sub_category}</div>
                    <div><span style={{ fontWeight: '600' }}>Supplier:</span> {selectedPO.meta.supplier_name}</div>
                    <div><span style={{ fontWeight: '600' }}>Quantity:</span> {selectedPO.meta.quantity} units</div>
                  </div>
                </div>
              )}

              {/* Agency searchable dropdown */}
              <SearchableDropdown
                label="Quality Agency"
                required
                placeholder="Search by agency name or code..."
                value={selectedAgency}
                onChange={setSelectedAgency}
                fetchOptions={fetchAgencies}
              />

              {/* Inspection Date */}
              <div style={{ marginBottom: '32px' }}>
                <label style={labelStyle}>
                  Inspection Date <span style={{ color: '#dc2626' }}>*</span>
                </label>
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
                    color: '#fff', border: 'none', padding: '11px 28px',
                    borderRadius: '7px', fontSize: '14px', fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Mapping...' : 'Map Inspection'}
                </button>
                <Link to="/dashboard" style={{
                  padding: '11px 20px', borderRadius: '7px', fontSize: '14px',
                  textDecoration: 'none', color: '#374151',
                  border: '1px solid #d1d5db', backgroundColor: '#fff',
                }}>
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
