import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import SearchableDropdown from '../components/SearchableDropdown.jsx'
import { mapJob } from '../api/inspectionJobs.js'
import { searchPOs, searchAgencies } from '../api/masters.js'

const STAGES = [
  { key: 'pre_production', label: 'Pre-Production Sample Inspection', desc: 'Inspect sample before mass production begins' },
  { key: 'inline',         label: 'In-Line Production Inspection',    desc: 'Inspect during active production run' },
  { key: 'final',          label: 'Final Inspection',                 desc: 'Full inspection after production is complete' },
  { key: 'loading',        label: 'Container Loading Inspection',     desc: 'Inspect goods during container stuffing' },
]

export default function MapInspectionPage() {
  const [selectedPO, setSelectedPO] = useState(null)
  const [selectedAgency, setSelectedAgency] = useState(null)
  const [inspectionDate, setInspectionDate] = useState('')
  const [inspectionType, setInspectionType] = useState('agency')
  const [selectedStages, setSelectedStages] = useState(['final'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [noTemplateError, setNoTemplateError] = useState(null)
  const [successJob, setSuccessJob] = useState(null)
  const [successJobs, setSuccessJobs] = useState([])

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

    if (!selectedPO || !inspectionDate) {
      setError('PO and inspection date are required.')
      return
    }
    if (inspectionType === 'agency' && !selectedAgency) {
      setError('Please select an agency for agency inspection.')
      return
    }
    if (!selectedStages.length) {
      setError('Please select at least one inspection stage.')
      return
    }

    setLoading(true)
    try {
      const res = await mapJob({
        po_no: selectedPO.value,
        agency_code: inspectionType === 'agency' ? selectedAgency.value : undefined,
        inspection_date: inspectionDate,
        inspection_type: inspectionType,
        inspection_stages: selectedStages,
      })
      const data = res.data
      if (data.jobs) {
        setSuccessJobs(data.jobs)
        setSuccessJob(null)
      } else {
        setSuccessJob(data?.job || data)
        setSuccessJobs([])
      }
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

  const toggleStage = (key) => setSelectedStages(p => p.includes(key) ? p.filter(s => s !== key) : [...p, key])

  const handleReset = () => {
    setSelectedPO(null)
    setSelectedAgency(null)
    setInspectionDate('')
    setInspectionType('agency')
    setSelectedStages(['final'])
    setError('')
    setNoTemplateError(null)
    setSuccessJob(null)
    setSuccessJobs([])
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

        {/* Success — single job */}
        {successJob && (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: '#15803d' }}>Inspection Mapped Successfully!</h3>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#166534' }}>
              Job: <code style={{ fontFamily: 'monospace', backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>{successJob.job_ref || successJob.job_id}</code>
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Link to={`/jobs/${successJob.job_id}`} style={{ backgroundColor: '#15803d', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>View Job</Link>
              <button onClick={handleReset} style={{ backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Map Another</button>
            </div>
          </div>
        )}

        {/* Success — multiple jobs (multiple stages) */}
        {successJobs.length > 0 && (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '600', color: '#15803d' }}>
              {successJobs.length} Inspection Jobs Created!
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>One job per selected stage:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {successJobs.map(j => {
                const stageLabel = STAGES.find(s => s.key === j.inspection_stage)?.label || j.inspection_stage
                return (
                  <div key={j.job_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#dcfce7', borderRadius: '6px', padding: '10px 14px' }}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: '#166534' }}>{j.job_ref || j.job_id?.slice(0,8)}</span>
                      <span style={{ fontSize: '12px', color: '#15803d', marginLeft: '10px' }}>{stageLabel}</span>
                    </div>
                    <Link to={`/jobs/${j.job_id}`} style={{ fontSize: '12px', color: '#15803d', fontWeight: '600', textDecoration: 'underline' }}>View</Link>
                  </div>
                )
              })}
            </div>
            <button onClick={handleReset} style={{ backgroundColor: '#15803d', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Map Another</button>
          </div>
        )}

        {/* Form */}
        {!successJob && !successJobs.length && (
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

              {/* Inspection Type Toggle */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Inspection Type <span style={{ color: '#dc2626' }}>*</span></label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { value: 'agency', label: '🏢 Agency Inspection', desc: 'An external QC agency performs the inspection' },
                    { value: 'self',   label: '🏭 Self Inspection',   desc: 'Supplier performs and submits the inspection themselves' },
                  ].map(opt => (
                    <div
                      key={opt.value}
                      onClick={() => { setInspectionType(opt.value); setSelectedAgency(null) }}
                      style={{
                        flex: 1, padding: '14px 16px', borderRadius: '8px', cursor: 'pointer',
                        border: `2px solid ${inspectionType === opt.value ? '#1e40af' : '#e5e7eb'}`,
                        backgroundColor: inspectionType === opt.value ? '#eff6ff' : '#fff',
                      }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '14px', color: inspectionType === opt.value ? '#1e40af' : '#374151', marginBottom: '4px' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agency searchable dropdown — only for agency inspections */}
              {inspectionType === 'agency' && (
                <SearchableDropdown
                  label="Quality Agency"
                  required
                  placeholder="Search by agency name or code..."
                  value={selectedAgency}
                  onChange={setSelectedAgency}
                  fetchOptions={fetchAgencies}
                />
              )}

              {/* Inspection Stages */}
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>
                  Inspection Stages <span style={{ color: '#dc2626' }}>*</span>
                  <span style={{ fontWeight: '400', color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>Select all that apply</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {STAGES.map((stage, idx) => (
                    <label key={stage.key} onClick={() => toggleStage(stage.key)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px',
                      borderRadius: '8px', cursor: 'pointer',
                      border: `2px solid ${selectedStages.includes(stage.key) ? '#1e40af' : '#e5e7eb'}`,
                      backgroundColor: selectedStages.includes(stage.key) ? '#eff6ff' : '#fff',
                    }}>
                      <input type="checkbox" checked={selectedStages.includes(stage.key)} onChange={() => {}} style={{ marginTop: '2px', accentColor: '#1e40af', width: '16px', height: '16px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: selectedStages.includes(stage.key) ? '#1e40af' : '#374151' }}>
                          {idx + 1}. {stage.label}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{stage.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedStages.length > 1 && (
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#1d4ed8', fontWeight: '500' }}>
                    {selectedStages.length} stages selected — {selectedStages.length} separate jobs will be created
                  </p>
                )}
              </div>

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
                  {loading ? 'Mapping...' : selectedStages.length > 1 ? `Map ${selectedStages.length} Inspections` : 'Map Inspection'}
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
