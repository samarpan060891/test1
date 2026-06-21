import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import SearchableDropdown from '../components/SearchableDropdown.jsx'
import { mapJob } from '../api/inspectionJobs.js'
import { searchPOs, searchAgencies } from '../api/masters.js'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function MapInspectionPage() {
  const { t } = useLanguage()

  const STAGES = [
    { key: 'pre_production', label: t('stage_pre_production_full'), desc: t('map_stage_pre_production_desc') },
    { key: 'inline',         label: t('stage_inline_full'),         desc: t('map_stage_inline_desc') },
    { key: 'final',          label: t('stage_final_full'),          desc: t('map_stage_final_desc') },
    { key: 'loading',        label: t('stage_loading_full'),        desc: t('map_stage_loading_desc') },
  ]
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
      setError(t('map_error_po_date') || 'PO and inspection date are required.')
      return
    }
    if (inspectionType === 'agency' && !selectedAgency) {
      setError(t('map_error_agency') || 'Please select an agency for agency inspection.')
      return
    }
    if (!selectedStages.length) {
      setError(t('map_error_stage') || 'Please select at least one inspection stage.')
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
    <div className="page">
      <Navbar />
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '36px 28px' }}>

        <div style={{ marginBottom: '28px' }}>
          <h1 className="page-title">
            {t('map_title')}
          </h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
            {t('map_subtitle')}
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
                  {t('map_no_template_title') || 'No Active Checklist Template'}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#7f1d1d', lineHeight: '1.5' }}>
                  {t('map_no_template_body') || 'No active checklist template found for'} <strong>{noTemplateError}</strong>.
                  {t('map_no_template_hint') || ' Please create and activate one in Checklist Templates before mapping this inspection.'}
                </p>
                <Link to="/checklist-templates" style={{
                  display: 'inline-block', marginTop: '10px',
                  backgroundColor: '#dc2626', color: '#fff',
                  padding: '7px 14px', borderRadius: '6px',
                  textDecoration: 'none', fontSize: '13px', fontWeight: '600',
                }}>
                  {t('nav_checklist_templates')}
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
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: '#15803d' }}>{t('map_success_title')}</h3>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#166534' }}>
              Job: <code style={{ fontFamily: 'monospace', backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>{successJob.job_ref || successJob.job_id}</code>
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Link to={`/jobs/${successJob.job_id}`} style={{ backgroundColor: '#15803d', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>{t('map_view_job')}</Link>
              <button onClick={handleReset} style={{ backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>{t('map_map_another')}</button>
            </div>
          </div>
        )}

        {/* Success — multiple jobs (multiple stages) */}
        {successJobs.length > 0 && (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '600', color: '#15803d' }}>
              {t('map_success_multiple').replace('{n}', successJobs.length)}
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>{t('map_success_per_stage')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {successJobs.map(j => {
                const stageLabel = STAGES.find(s => s.key === j.inspection_stage)?.label || j.inspection_stage
                return (
                  <div key={j.job_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#dcfce7', borderRadius: '6px', padding: '10px 14px' }}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '13px', color: '#166534' }}>{j.job_ref || j.job_id?.slice(0,8)}</span>
                      <span style={{ fontSize: '12px', color: '#15803d', marginLeft: '10px' }}>{stageLabel}</span>
                    </div>
                    <Link to={`/jobs/${j.job_id}`} style={{ fontSize: '12px', color: '#15803d', fontWeight: '600', textDecoration: 'underline' }}>{t('th_view')}</Link>
                  </div>
                )
              })}
            </div>
            <button onClick={handleReset} style={{ backgroundColor: '#15803d', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>{t('map_map_another')}</button>
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
                label={t('map_po')}
                required
                placeholder={t('map_po_placeholder')}
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
                    <div><span style={{ fontWeight: '600' }}>{t('job_item_code')}:</span> {selectedPO.meta.item_name}</div>
                    <div><span style={{ fontWeight: '600' }}>{t('map_category') || 'Category'}:</span> {selectedPO.meta.category} / {selectedPO.meta.sub_category}</div>
                    <div><span style={{ fontWeight: '600' }}>{t('job_supplier')}:</span> {selectedPO.meta.supplier_name}</div>
                    <div><span style={{ fontWeight: '600' }}>{t('map_quantity') || 'Quantity'}:</span> {selectedPO.meta.quantity}</div>
                  </div>
                </div>
              )}

              {/* Inspection Type Toggle */}
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>{t('map_type')} <span style={{ color: '#dc2626' }}>*</span></label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[
                    { value: 'agency', label: `🏢 ${t('map_type_agency')}`, desc: t('map_type_agency_desc') },
                    { value: 'self',   label: `🏭 ${t('map_type_self')}`,   desc: t('map_type_self_desc') },
                  ].map(opt => (
                    <div
                      key={opt.value}
                      onClick={() => { setInspectionType(opt.value); setSelectedAgency(null) }}
                      style={{
                        flex: 1, padding: '14px 16px', borderRadius: '8px', cursor: 'pointer',
                        border: `2px solid ${inspectionType === opt.value ? '#1C1208' : '#e5e7eb'}`,
                        backgroundColor: inspectionType === opt.value ? '#FEF0EB' : '#fff',
                      }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '14px', color: inspectionType === opt.value ? '#1C1208' : '#374151', marginBottom: '4px' }}>
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
                  label={t('map_agency')}
                  required
                  placeholder={t('map_agency_placeholder')}
                  value={selectedAgency}
                  onChange={setSelectedAgency}
                  fetchOptions={fetchAgencies}
                />
              )}

              {/* Inspection Stages */}
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>
                  {t('map_stages')} <span style={{ color: '#dc2626' }}>*</span>
                  <span style={{ fontWeight: '400', color: '#6b7280', fontSize: '13px', marginLeft: '8px' }}>{t('map_stages_hint')}</span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {STAGES.map((stage, idx) => (
                    <label key={stage.key} onClick={() => toggleStage(stage.key)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px',
                      borderRadius: '8px', cursor: 'pointer',
                      border: `2px solid ${selectedStages.includes(stage.key) ? '#1C1208' : '#e5e7eb'}`,
                      backgroundColor: selectedStages.includes(stage.key) ? '#FEF0EB' : '#fff',
                    }}>
                      <input type="checkbox" checked={selectedStages.includes(stage.key)} onChange={() => {}} style={{ marginTop: '2px', accentColor: '#1C1208', width: '16px', height: '16px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: selectedStages.includes(stage.key) ? '#1C1208' : '#374151' }}>
                          {idx + 1}. {stage.label}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{stage.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedStages.length > 1 && (
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#E8470F', fontWeight: '500' }}>
                    {t('map_stages_selected') || `${selectedStages.length} stages selected — ${selectedStages.length} separate jobs will be created`}
                  </p>
                )}
              </div>

              {/* Inspection Date */}
              <div style={{ marginBottom: '32px' }}>
                <label style={labelStyle}>
                  {t('map_date')} <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="date"
                  value={inspectionDate}
                  onChange={e => setInspectionDate(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#1C1208'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? '#93c5fd' : '#1C1208',
                    color: '#fff', border: 'none', padding: '11px 28px',
                    borderRadius: '7px', fontSize: '14px', fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? t('map_submitting') : selectedStages.length > 1 ? t('map_submit_multiple').replace('{n}', selectedStages.length) : t('map_submit')}
                </button>
                <Link to="/dashboard" style={{
                  padding: '11px 20px', borderRadius: '7px', fontSize: '14px',
                  textDecoration: 'none', color: '#374151',
                  border: '1px solid #d1d5db', backgroundColor: '#fff',
                }}>
                  {t('map_cancel')}
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
