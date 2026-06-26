import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import SearchableDropdown from '../components/SearchableDropdown.jsx'
import { mapJob } from '../api/inspectionJobs.js'
import { getContractsByAgency } from '../api/inspectionCosts.js'
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
  const [selectedItemCodes, setSelectedItemCodes] = useState([])
  const [selectedAgency, setSelectedAgency] = useState(null)
  const [agencyContracts, setAgencyContracts] = useState([])
  const [selectedContractId, setSelectedContractId] = useState('')
  const [inspectionDate, setInspectionDate] = useState('')
  const [inspectionType, setInspectionType] = useState('agency')
  const [selectedStages, setSelectedStages] = useState(['final'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [noTemplateError, setNoTemplateError] = useState(null)
  const [successJob, setSuccessJob] = useState(null)
  const [successJobs, setSuccessJobs] = useState([])

  const inputStyle = {
    width: '100%', padding: '10px 14px', border: '1px solid #d1d5db',
    borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = {
    display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151',
  }

  const fetchPOs = async (search) => {
    const rows = await searchPOs(search)
    return rows.map(r => ({
      value: r.po_no,
      label: r.po_no + (r.inspection_status === 'partial' ? ' [partial]' : ''),
      sublabel: `${r.supplier_name} · ${r.total_items} item(s)${r.inspected_count > 0 ? ` · ${r.inspected_count} being inspected` : ''}`,
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

  const handlePOChange = (po) => {
    setSelectedPO(po)
    // Auto-select all uninspected items
    const available = (po?.meta?.items || []).filter(i => !i.is_being_inspected)
    setSelectedItemCodes(available.map(i => i.item_code))
  }

  const toggleItem = (itemCode) => {
    setSelectedItemCodes(prev =>
      prev.includes(itemCode) ? prev.filter(c => c !== itemCode) : [...prev, itemCode]
    )
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
    if (!selectedItemCodes.length) {
      setError('Please select at least one item to inspect.')
      return
    }

    setLoading(true)
    try {
      const res = await mapJob({
        po_no: selectedPO.value,
        agency_code: inspectionType === 'agency' ? selectedAgency.value : undefined,
        contract_id: inspectionType === 'agency' && selectedContractId ? selectedContractId : undefined,
        inspection_date: inspectionDate,
        inspection_type: inspectionType,
        inspection_stages: selectedStages,
        item_codes: selectedItemCodes,
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
      if (status === 422 && (data?.error_code === 'NO_ACTIVE_TEMPLATE' || data?.error?.includes?.('template'))) {
        setNoTemplateError({ category: data?.category || 'this category', item: data?.item_code || '' })
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
    setSelectedItemCodes([])
    setSelectedAgency(null)
    setAgencyContracts([])
    setSelectedContractId('')
    setInspectionDate('')
    setInspectionType('agency')
    setSelectedStages(['final'])
    setError('')
    setNoTemplateError(null)
    setSuccessJob(null)
    setSuccessJobs([])
  }

  const poItems = selectedPO?.meta?.items || []
  const availableItems = poItems.filter(i => !i.is_being_inspected)

  return (
    <div className="page">
      <Navbar />
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '36px 28px' }}>

        <div style={{ marginBottom: '28px' }}>
          <h1 className="page-title">{t('map_title')}</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>{t('map_subtitle')}</p>
        </div>

        {/* No active template error */}
        {noTemplateError && (
          <div style={{ backgroundColor: '#fef2f2', border: '2px solid #f87171', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>⚠️</span>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#dc2626' }}>
                  {t('map_no_template_title') || 'No Active Checklist Template'}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#7f1d1d', lineHeight: '1.5' }}>
                  No active checklist template found for <strong>{noTemplateError.category}</strong>
                  {noTemplateError.item ? ` (item: ${noTemplateError.item})` : ''}.
                  Please create and activate one in Checklist Templates before mapping this inspection.
                </p>
                <Link to="/checklist-templates" style={{ display: 'inline-block', marginTop: '10px', backgroundColor: '#dc2626', color: '#fff', padding: '7px 14px', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
                  {t('nav_checklist_templates')}
                </Link>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
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

        {/* Success — multiple jobs */}
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
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '32px' }}>
            <form onSubmit={handleSubmit}>

              {/* PO dropdown */}
              <SearchableDropdown
                label={t('map_po')}
                required
                placeholder={t('map_po_placeholder')}
                value={selectedPO}
                onChange={handlePOChange}
                fetchOptions={fetchPOs}
              />

              {/* PO summary + item selection */}
              {selectedPO?.meta && (
                <div style={{ marginTop: '-12px', marginBottom: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                      {selectedPO.meta.supplier_name} — {selectedPO.meta.total_items} line item(s)
                    </span>
                    {selectedPO.meta.inspection_status === 'partial' && (
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>
                        PARTIAL — some items already being inspected
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    Select items to inspect in this job: <span style={{ color: '#dc2626' }}>*</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {poItems.map(item => (
                      <label
                        key={item.item_code}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                          borderRadius: '7px', cursor: item.is_being_inspected ? 'not-allowed' : 'pointer',
                          border: `2px solid ${item.is_being_inspected ? '#e5e7eb' : selectedItemCodes.includes(item.item_code) ? '#1C1208' : '#e5e7eb'}`,
                          backgroundColor: item.is_being_inspected ? '#f9fafb' : selectedItemCodes.includes(item.item_code) ? '#FEF0EB' : '#fff',
                          opacity: item.is_being_inspected ? 0.6 : 1,
                        }}
                        onClick={() => !item.is_being_inspected && toggleItem(item.item_code)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemCodes.includes(item.item_code)}
                          disabled={item.is_being_inspected}
                          onChange={() => {}}
                          style={{ marginTop: '2px', accentColor: '#1C1208', flexShrink: 0 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: item.is_being_inspected ? '#9ca3af' : '#1C1208' }}>
                            {item.item_name}
                            {item.is_being_inspected && (
                              <span style={{ marginLeft: '8px', background: '#e5e7eb', color: '#6b7280', padding: '1px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '400' }}>
                                Being inspected
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                            {item.item_code} · {item.category} / {item.sub_category} · Qty: {item.quantity} · ${parseFloat(item.unit_price || 0).toFixed(2)}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {availableItems.length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => setSelectedItemCodes(availableItems.map(i => i.item_code))}
                        style={{ fontSize: '12px', color: '#1C1208', background: 'none', border: '1px solid #1C1208', borderRadius: '5px', padding: '3px 10px', cursor: 'pointer', fontWeight: '600' }}>
                        Select all available
                      </button>
                      <button type="button" onClick={() => setSelectedItemCodes([])}
                        style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: '1px solid #d1d5db', borderRadius: '5px', padding: '3px 10px', cursor: 'pointer' }}>
                        Clear
                      </button>
                    </div>
                  )}
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
                    <div key={opt.value}
                      onClick={() => { setInspectionType(opt.value); setSelectedAgency(null); setAgencyContracts([]); setSelectedContractId('') }}
                      style={{
                        flex: 1, padding: '14px 16px', borderRadius: '8px', cursor: 'pointer',
                        border: `2px solid ${inspectionType === opt.value ? '#1C1208' : '#e5e7eb'}`,
                        backgroundColor: inspectionType === opt.value ? '#FEF0EB' : '#fff',
                      }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '14px', color: inspectionType === opt.value ? '#1C1208' : '#374151', marginBottom: '4px' }}>{opt.label}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Agency dropdown */}
              {inspectionType === 'agency' && (
                <>
                  <SearchableDropdown
                    label={t('map_agency')}
                    required
                    placeholder={t('map_agency_placeholder')}
                    value={selectedAgency}
                    onChange={async (agency) => {
                      setSelectedAgency(agency)
                      setSelectedContractId('')
                      setAgencyContracts([])
                      if (agency?.value) {
                        try {
                          const r = await getContractsByAgency(agency.value)
                          setAgencyContracts(r.data || [])
                        } catch {}
                      }
                    }}
                    fetchOptions={fetchAgencies}
                  />
                  {agencyContracts.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={labelStyle}>Rate Contract <span style={{ color: '#dc2626' }}>*</span></label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {agencyContracts.map(c => {
                          const rateLabel = c.rate_type === 'manday' ? `${c.rate_value} ${c.currency}/manday` : `${c.rate_value}% of PO value`
                          const validity = c.valid_to ? `valid till ${c.valid_to}` : 'no expiry'
                          return (
                            <label key={c.contract_id} onClick={() => setSelectedContractId(c.contract_id)} style={{
                              display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px',
                              borderRadius: '8px', cursor: 'pointer',
                              border: `2px solid ${selectedContractId === c.contract_id ? '#1C1208' : '#e5e7eb'}`,
                              backgroundColor: selectedContractId === c.contract_id ? '#FEF0EB' : '#fff',
                            }}>
                              <input type="radio" checked={selectedContractId === c.contract_id} onChange={() => {}} style={{ marginTop: '3px', accentColor: '#1C1208', flexShrink: 0 }} />
                              <div>
                                <div style={{ fontWeight: '600', fontSize: '14px', color: selectedContractId === c.contract_id ? '#1C1208' : '#374151' }}>{c.contract_name}</div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{rateLabel} · {validity}</div>
                              </div>
                            </label>
                          )
                        })}
                        <label onClick={() => setSelectedContractId('')} style={{
                          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
                          borderRadius: '8px', cursor: 'pointer',
                          border: `2px solid ${selectedContractId === '' ? '#1C1208' : '#e5e7eb'}`,
                          backgroundColor: selectedContractId === '' ? '#f8fafc' : '#fff',
                        }}>
                          <input type="radio" checked={selectedContractId === ''} onChange={() => {}} style={{ accentColor: '#1C1208', flexShrink: 0 }} />
                          <div style={{ fontSize: '14px', color: '#6b7280' }}>No contract / manual rates</div>
                        </label>
                      </div>
                    </div>
                  )}
                </>
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
                        <div style={{ fontWeight: '600', fontSize: '14px', color: selectedStages.includes(stage.key) ? '#1C1208' : '#374151' }}>{idx + 1}. {stage.label}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{stage.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedStages.length > 1 && (
                  <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#E8470F', fontWeight: '500' }}>
                    {`${selectedStages.length} stages selected — ${selectedStages.length} separate jobs will be created`}
                  </p>
                )}
              </div>

              {/* Inspection Date */}
              <div style={{ marginBottom: '32px' }}>
                <label style={labelStyle}>{t('map_date')} <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#1C1208'}
                  onBlur={e => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" disabled={loading} style={{
                  backgroundColor: loading ? '#93c5fd' : '#1C1208',
                  color: '#fff', border: 'none', padding: '11px 28px',
                  borderRadius: '7px', fontSize: '14px', fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}>
                  {loading ? t('map_submitting') : selectedStages.length > 1 ? t('map_submit_multiple').replace('{n}', selectedStages.length) : t('map_submit')}
                </button>
                <Link to="/dashboard" style={{ padding: '11px 20px', borderRadius: '7px', fontSize: '14px', textDecoration: 'none', color: '#374151', border: '1px solid #d1d5db', backgroundColor: '#fff' }}>
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
