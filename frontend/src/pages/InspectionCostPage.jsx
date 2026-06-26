import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import { TableScrollWrap } from '../components/TableScrollWrap.jsx'
import { useResizableColumns } from '../hooks/useResizableColumns.js'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import * as XLSX from 'xlsx'
import { getAdvices, createAdvice, approveAdvice, rejectAdvice, getContracts, createContract, uploadInvoice, getInvoiceUrl } from '../api/inspectionCosts.js'
import { getJobs } from '../api/inspectionJobs.js'
import { getAgencies } from '../api/admin.js'
import InspectionSummaryCard from '../components/InspectionSummaryCard.jsx'

const STATUS_META = {
  pending_qa:       { bg: '#FEF0EB', color: '#E8470F',  key: 'status_pending_qa' },
  pending_buying:   { bg: '#fefce8', color: '#92400e',  key: 'status_pending_buying' },
  pending_imports:  { bg: '#eff6ff', color: '#1d4ed8',  key: 'status_pending_imports' },
  pending_accounts: { bg: '#faf5ff', color: '#7e22ce',  key: 'status_pending_accounts' },
  paid:             { bg: '#f0fdf4', color: '#15803d',  key: 'status_paid' },
  rejected:         { bg: '#fef2f2', color: '#991b1b',  key: 'status_rejected' },
}

function StatusBadge({ status, t }) {
  const s = STATUS_META[status] || { bg: '#f1f5f9', color: '#475569', key: null }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700' }}>
      {s.key ? t(s.key) : status}
    </span>
  )
}

function fmt(num, currency = 'USD') {
  if (num == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(num)
}

const inputSt = { width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit', outline: 'none' }
const labelSt = { display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }

export default function InspectionCostPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const role = user?.role

  const [advices, setAdvices]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [eligibleJobs, setEligibleJobs] = useState([])
  const [jobsLoading, setJobsLoading]   = useState(false)
  const [showCreate, setShowCreate]     = useState(false)
  const [showApprove, setShowApprove]   = useState(null)
  const [actionNote, setActionNote]     = useState('')
  const [actionMsg, setActionMsg]       = useState('')
  const [invoiceFile, setInvoiceFile]   = useState(null)
  const [invoiceUploading, setInvoiceUploading] = useState(false)
  const [invoiceMsg, setInvoiceMsg]     = useState('')
  const [actionSaving, setActionSaving] = useState(false)
  const [activeFilter, setActiveFilter] = useState(null)
  const [advFilters, setAdvFilters] = useState({})
  // Resizable columns for main advice table (max 11 cols)
  const { widths: advColWidths, getHandleProps: advHandleProps } = useResizableColumns([110, 130, 150, 140, 110, 110, 140, 170, 80, 110, 110])

  const [showContracts, setShowContracts] = useState(false)
  const [allContracts, setAllContracts]   = useState([])
  const [allAgencies, setAllAgencies]     = useState([])
  const [contractForm, setContractForm]   = useState({ agency_code: '', contract_name: '', rate_type: 'manday', rate_value: '', travel_allowance: '', stay_allowance_per_day: '', currency: 'USD', valid_from: '', valid_to: '', notes: '' })
  const [contractMsg, setContractMsg]     = useState('')
  const [contractSaving, setContractSaving] = useState(false)

  const [jobs, setJobs]                 = useState([])
  const [contracts, setContracts]       = useState([])
  const [selectedJobs, setSelectedJobs] = useState([])
  const [rateType, setRateType]         = useState('manday')
  const [rateValue, setRateValue]       = useState('')
  const [numMandays, setNumMandays]     = useState('')
  const [travel, setTravel]             = useState('')
  const [stay, setStay]                 = useState('')
  const [currency, setCurrency]         = useState('USD')
  const [adviceNotes, setAdviceNotes]   = useState('')
  const [selectedContract, setSelectedContract] = useState('')
  const [createMsg, setCreateMsg]       = useState('')
  const [creating, setCreating]         = useState(false)

  const [invoicePanel, setInvoicePanel] = useState(null) // { url, name, type }

  const openInvoicePanel = async (adviceId, fileName) => {
    try {
      const token = sessionStorage.getItem(`token_${window.name}`)
      const res = await fetch(`/api/inspection-costs/${adviceId}/invoice`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load invoice')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      // revoke after a short delay so the new tab has time to load
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      if (!win) alert('Pop-up blocked — please allow pop-ups for this site.')
    } catch (e) {
      alert('Could not load invoice: ' + e.message)
    }
  }

  const closeInvoicePanel = () => {
    if (invoicePanel?.url) URL.revokeObjectURL(invoicePanel.url)
    setInvoicePanel(null)
  }

  const load = () => {
    setLoading(true)
    return getAdvices()
      .then(r => { setAdvices(r.data); return r.data })
      .catch(err => { console.error('getAdvices error:', err?.response?.data?.error || err.message); return [] })
      .finally(() => setLoading(false))
  }

  const loadEligibleJobs = async () => {
    if (role !== 'agency_user') return
    setJobsLoading(true)
    try {
      const r = await getJobs()
      setEligibleJobs((r.data || []).filter(j => ['submitted_pending_qa', 'qa_approved', 'qa_rejected'].includes(j.status)))
    } catch {} finally { setJobsLoading(false) }
  }

  useEffect(() => {
    load(); loadEligibleJobs()
    const interval = setInterval(() => { load(); loadEligibleJobs() }, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadContracts = async () => {
    try {
      const [cr, ar] = await Promise.all([getContracts(), getAgencies()])
      setAllContracts(cr.data || [])
      setAllAgencies(Array.isArray(ar.data) ? ar.data : [])
    } catch {}
  }

  const handleCreateContract = async (e) => {
    e.preventDefault()
    setContractSaving(true); setContractMsg('')
    try {
      await createContract(contractForm)
      setContractMsg('Contract saved!')
      setContractForm({ agency_code: '', contract_name: '', rate_type: 'manday', rate_value: '', travel_allowance: '', stay_allowance_per_day: '', currency: 'USD', valid_from: '', valid_to: '', notes: '' })
      loadContracts()
    } catch (err) {
      setContractMsg(err?.response?.data?.error || 'Failed to save contract')
    } finally { setContractSaving(false) }
  }

  const openCreate = async (preSelectJobId = null) => {
    setSelectedJobs(preSelectJobId ? [preSelectJobId] : [])
    setRateType('manday'); setRateValue(''); setNumMandays('')
    setTravel(''); setStay(''); setCurrency('USD'); setAdviceNotes(''); setSelectedContract(''); setCreateMsg(''); setInvoiceFile(null)
    try {
      const [jobsRes, contractsRes] = await Promise.all([getJobs(), getContracts()])
      setJobs((jobsRes.data || []).filter(j => ['submitted_pending_qa', 'qa_approved', 'qa_rejected'].includes(j.status)))
      setContracts(contractsRes.data || [])
    } catch {}
    setShowCreate(true)
  }

  const applyContract = (contractId) => {
    setSelectedContract(contractId)
    const c = contracts.find(c => c.contract_id === contractId)
    if (!c) return
    setRateType(c.rate_type); setRateValue(String(c.rate_value))
    setTravel(String(c.travel_allowance)); setStay(String(c.stay_allowance_per_day)); setCurrency(c.currency)
  }

  const calcCost = () => {
    if (!rateValue) return null
    if (rateType === 'manday') {
      if (!numMandays) return null
      return (parseFloat(rateValue) * parseFloat(numMandays)) + parseFloat(travel || 0) + parseFloat(stay || 0)
    }
    if (rateType === 'percentage') {
      const totalPoValue = selectedJobs.reduce((sum, id) => {
        const j = jobs.find(j => j.job_id === id)
        return sum + (parseFloat(j?.po_value) || parseFloat(j?.quantity) * parseFloat(j?.unit_price) || 0)
      }, 0)
      if (!totalPoValue) return null
      return (totalPoValue * parseFloat(rateValue)) / 100
    }
    return null
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!selectedJobs.length) { setCreateMsg('Select at least one job'); return }
    if (!invoiceFile) { setCreateMsg('Please upload the agency invoice (PDF/JPG/PNG)'); return }
    setCreating(true); setCreateMsg('')
    try {
      await createAdvice({ job_ids: selectedJobs, rate_type: rateType, rate_value: parseFloat(rateValue), num_mandays: numMandays ? parseFloat(numMandays) : null, travel_allowance: parseFloat(travel || 0), stay_allowance: parseFloat(stay || 0), currency, contract_id: selectedContract || null, notes: adviceNotes || null }, invoiceFile)
      setShowCreate(false); load(); loadEligibleJobs()
    } catch (err) {
      setCreateMsg(err?.response?.data?.error || 'Failed to create advice')
    } finally { setCreating(false) }
  }

  const handleInvoiceUpload = async (adviceId, file) => {
    if (!file) return
    setInvoiceUploading(true); setInvoiceMsg('')
    try {
      const res = await uploadInvoice(adviceId, file)
      setInvoiceMsg('Invoice uploaded successfully')
      setInvoiceFile(null)
      // Update advices list and refresh modal state if open
      const updated = await load()
      if (showApprove && showApprove.advice.advice_id === adviceId) {
        const refreshed = (updated || advices).find(a => a.advice_id === adviceId)
        if (refreshed) setShowApprove(p => ({ ...p, advice: refreshed }))
      }
    } catch (err) {
      setInvoiceMsg(err?.response?.data?.error || 'Upload failed')
    } finally { setInvoiceUploading(false) }
  }

  const handleAction = async () => {
    if (!showApprove) return
    if (showApprove.action === 'reject' && !actionNote) { setActionMsg('Please provide rejection reason'); return }
    setActionSaving(true); setActionMsg('')
    try {
      if (showApprove.action === 'approve') await approveAdvice(showApprove.advice.advice_id, actionNote)
      else await rejectAdvice(showApprove.advice.advice_id, actionNote)
      setShowApprove(null); setActionNote(''); load()
    } catch (err) {
      setActionMsg(err?.response?.data?.error || 'Action failed')
      load()
      setTimeout(() => { setShowApprove(null); setActionMsg('') }, 2500)
    } finally { setActionSaving(false) }
  }

  const downloadAdvices = (rows) => {
    const data = rows.map(a => ({
      'Advice Ref':      a.advice_ref,
      'Agency':          a.agency_name,
      'Contract':        a.contract_name ?? '',
      'Jobs':            (a.jobs || []).map(j => j.job_ref || j.po_no).join(', '),
      'Rate Type':       a.rate_type === 'manday' ? 'Manday' : '% of PO',
      'Rate Value':      a.rate_value,
      'Mandays':         a.num_mandays ?? '',
      'Travel':          a.travel_allowance ?? 0,
      'Stay':            a.stay_allowance ?? 0,
      'Total Cost':      a.total_cost,
      'Currency':        a.currency,
      'Cost Bearer':     a.cost_bearer === 'supplier' ? 'Supplier' : 'Company',
      'Status':          a.status,
      'QA Approved By':       a.qa_user_name ?? '',
      'Buying Approved By':   a.buying_user_name ?? '',
      'Imports Approved By':  a.imports_user_name ?? '',
      'Accounts Approved By': a.accounts_user_name ?? '',
      'Accounts Remarks':     a.accounts_notes ?? '',
      'Rejection Reason':     a.rejection_reason ?? '',
      'Created By':      a.created_by_name,
      'Created At':      new Date(a.created_at).toLocaleDateString(),
      'Notes':           a.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inspection Costs')
    XLSX.writeFile(wb, `inspection_costs_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const canApprove = (a) =>
    (role === 'qa'       && a.status === 'pending_qa') ||
    (role === 'buying'   && a.status === 'pending_buying') ||
    (role === 'imports'  && a.status === 'pending_imports') ||
    (role === 'accounts' && a.status === 'pending_accounts')
  const toggleJob = (id) => {
    setSelectedJobs(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      // Auto-fill rate from contract if first job selected has a contract
      if (!prev.includes(id) && next.length === 1) {
        const j = jobs.find(j => j.job_id === id)
        if (j?.contract_id && j?.contract_rate_type) {
          setRateType(j.contract_rate_type)
          setRateValue(String(j.contract_rate_value || ''))
          if (j.contract_currency) setCurrency(j.contract_currency)
          setSelectedContract(j.contract_id)
        }
      }
      return next
    })
  }
  const raisedJobIds = new Set(advices.flatMap(a => (a.jobs || []).map(j => j.job_id)))

  // ── Supplier view ─────────────────────────────────────────────────────
  if (role === 'supplier_user') {
    return (
      <div className="page">
        <Navbar />
        <div className="page-content">
          <div style={{ marginBottom: '24px' }}>
            <h1 className="page-title">Inspection Charges</h1>
            <p className="page-subtitle">Charges raised against your POs where the cost is borne by your company</p>
          </div>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : advices.length === 0 ? (
            <div className="card"><div className="empty-state"><div style={{ fontSize: '40px' }}>💰</div><p>No inspection charges applicable to your account</p></div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {advices.map(a => (
                <div key={a.advice_id} className="card" style={{ padding: '20px 24px' }}>
                  <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div className="flex-center" style={{ marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a' }}>{a.advice_ref}</span>
                        <StatusBadge status={a.status} />
                        <span style={{ background: '#fefce8', color: '#92400e', padding: '2px 9px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>Supplier Bears Cost</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                        Agency: <strong style={{ color: '#334155' }}>{a.agency_name}</strong> ·{' '}
                        {a.rate_type === 'manday' ? `${a.num_mandays} mandays @ ${fmt(a.rate_value, a.currency)}/day` : `${a.rate_value}% of PO value`} ·{' '}
                        <strong style={{ color: '#dc2626' }}>Total: {fmt(a.total_cost, a.currency)}</strong>
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Raised on {new Date(a.created_at).toLocaleDateString()}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                        {(a.jobs || []).map(j => (
                          <span key={j.job_id} style={{ background: '#FEF0EB', color: '#E8470F', padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: '600' }}>
                            {j.job_ref || j.po_no}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {a.status === 'approved' && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#64748b' }}>
                      ✅ Approved by QA{a.qa_user_name ? `: ${a.qa_user_name}` : ''}{a.buying_user_name ? ` · Buying: ${a.buying_user_name}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">
        {/* Summary Card — topmost */}
        {!loading && advices.length > 0 && (
          <InspectionSummaryCard advices={advices} />
        )}

        {/* Header */}
        <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 className="page-title">{t('costs_title')}</h1>
            <p className="page-subtitle">{role === 'agency_user' ? t('costs_subtitle_agency') : t('costs_subtitle_review')}</p>
          </div>
          {role === 'agency_user' && (
            <button onClick={() => openCreate()} className="btn btn-primary">
              {t('costs_new_advice')}
            </button>
          )}
        </div>

        {/* Eligible Jobs (agency only) */}
        {role === 'agency_user' && (
          <div className="card mb-6" style={{ overflow: 'hidden' }}>
            <div className="card-header">
              <h2 className="section-title">{t('costs_completed_inspections')}</h2>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{eligibleJobs.length} {t('costs_ready_for_advice')}</span>
            </div>
            {jobsLoading ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : eligibleJobs.length === 0 ? (
              <div className="empty-state"><div style={{ fontSize: '32px' }}>🔍</div><p>{t('costs_no_completed')}</p></div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>{[t('col_job_ref'), t('col_po_no'), t('col_item'), t('col_supplier'), t('col_insp_date'), t('col_stage'), t('common_status'), ''].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {eligibleJobs.map(j => (
                      <tr key={j.job_id}>
                        <td className="text-mono" style={{ fontWeight: '700', color: '#E8470F' }}>{j.job_ref || j.job_id?.slice(0, 8)}</td>
                        <td style={{ fontWeight: '600' }}>{j.po_no}</td>
                        <td>{j.item_name || '—'}</td>
                        <td style={{ color: '#64748b' }}>{j.supplier_name || j.supplier_code}</td>
                        <td style={{ color: '#94a3b8' }}>{j.inspection_date || '—'}</td>
                        <td style={{ textTransform: 'capitalize', color: '#64748b' }}>{j.inspection_stage || '—'}</td>
                        <td>
                          <span style={{
                            background: j.status === 'qa_approved' ? '#f0fdf4' : j.status === 'qa_rejected' ? '#fef2f2' : '#FEF0EB',
                            color: j.status === 'qa_approved' ? '#15803d' : j.status === 'qa_rejected' ? '#991b1b' : '#E8470F',
                            padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700',
                          }}>
                            {j.status === 'qa_approved' ? t('status_qa_approved') : j.status === 'qa_rejected' ? t('status_qa_rejected') : t('status_submitted')}
                          </span>
                        </td>
                        <td>
                          {raisedJobIds.has(j.job_id) ? (
                            <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>{t('costs_raised')}</span>
                          ) : (
                            <button onClick={() => openCreate(j.job_id)} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>{t('costs_raise_advice')}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Stats for internal roles — click to filter */}
        {(role === 'qa' || role === 'buying' || role === 'imports' || role === 'accounts' || role === 'admin') && (
          <div className="stat-grid mb-4">
            {[
              { label: t('costs_all_advices'),      key: null,              cls: 'blue',  accent: '#E8470F' },
              { label: t('status_pending_qa'),      key: 'pending_qa',      cls: 'blue',  accent: '#E8470F' },
              { label: t('status_pending_buying'),  key: 'pending_buying',  cls: 'amber', accent: '#d97706' },
              { label: t('status_pending_imports'), key: 'pending_imports', cls: 'blue',  accent: '#E8470F' },
              { label: t('status_pending_accounts'),key: 'pending_accounts',cls: 'amber', accent: '#d97706' },
              { label: t('status_paid'),            key: 'paid',            cls: 'green', accent: '#059669' },
              { label: t('status_rejected'),        key: 'rejected',        cls: 'red',   accent: '#dc2626' },
            ].map(s => {
              const isActive = activeFilter === s.key
              return (
                <div key={String(s.key)} className={`stat-card ${s.cls}`}
                  onClick={() => setActiveFilter(p => p === s.key ? null : s.key)}
                  style={{
                    cursor: 'pointer',
                    transform: isActive ? 'translateY(-2px)' : undefined,
                    transition: 'transform 0.1s',
                    userSelect: 'none',
                  }}>
                  <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {s.label}
                    {isActive && <span style={{ fontSize: '10px', fontWeight: '700', opacity: 0.7 }}>✕ FILTER</span>}
                  </div>
                  <div className="stat-value">{s.key === null ? advices.length : advices.filter(a => a.status === s.key).length}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Advice list */}
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : advices.length === 0 ? (
          <div className="card"><div className="empty-state"><div style={{ fontSize: '40px' }}>📋</div><p>{t('costs_no_records')}</p></div></div>
        ) : (() => {
          const STAT_LABELS = { pending_qa: t('status_pending_qa'), pending_buying: t('status_pending_buying'), pending_imports: t('status_pending_imports'), pending_accounts: t('status_pending_accounts'), paid: t('status_paid'), rejected: t('status_rejected') }
          const cardFiltered = activeFilter ? advices.filter(a => a.status === activeFilter) : advices
          const ADVICE_COLS = [
            { key: 'advice_ref',   label: t('col_advice_ref') },
            { key: 'agency_name',  label: t('col_agency') },
            { key: null,           label: t('col_jobs') },
            { key: null,           label: t('col_rate') },
            { key: null,           label: t('col_total_cost') },
            { key: 'cost_bearer',  label: t('col_cost_bearer') },
            { key: 'status',       label: t('common_status') },
            { key: null,           label: t('col_approvals') },
            ...(role === 'imports' || role === 'qa' || role === 'buying' || role === 'accounts' || role === 'admin' ? [{ key: null, label: t('col_invoice') }] : []),
            { key: 'created_by_name', label: t('col_created') },
            ...(advices.some(a => canApprove(a)) ? [{ key: null, label: t('common_actions') }] : []),
          ]
          const displayAdvices = cardFiltered.filter(a =>
            ADVICE_COLS.every(c => {
              if (!c.key) return true
              const fv = advFilters[c.key]
              if (!fv) return true
              return String(a[c.key] ?? '').toLowerCase().includes(fv.toLowerCase())
            })
          )
          const hasAdvFilter = Object.values(advFilters).some(Boolean)
          return (
          <div className="card mb-6">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="section-title">{role === 'agency_user' ? t('costs_submitted_advice') : t('costs_charges_advice_title')}</h2>
                {activeFilter && (
                  <span style={{ background: '#FEF0EB', color: '#E8470F', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px' }}>
                    {STAT_LABELS[activeFilter]}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {displayAdvices.length}{(activeFilter || hasAdvFilter) ? ` of ${advices.length}` : ''} advice(s)
                </span>
                <button
                  onClick={() => downloadAdvices(displayAdvices)}
                  disabled={displayAdvices.length === 0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                    background: displayAdvices.length === 0 ? '#f1f5f9' : '#f0fdf4',
                    color: displayAdvices.length === 0 ? '#94a3b8' : '#15803d',
                    border: `1px solid ${displayAdvices.length === 0 ? '#e2e8f0' : '#86efac'}`,
                    cursor: displayAdvices.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ⬇ Download Excel
                </button>
              </div>
            </div>
            <TableScrollWrap>
              <table className="data-table" style={{ fontSize: '12px', tableLayout: 'fixed', minWidth: '100%' }}>
                <colgroup>
                  {ADVICE_COLS.map((_, i) => <col key={i} style={{ width: advColWidths[i] || 110 }} />)}
                </colgroup>
                <thead>
                  <tr>
                    {ADVICE_COLS.map((c, i) => (
                      <th key={c.label} style={{ position: 'relative', width: advColWidths[i] || 110 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          {c.label}
                          {c.key && (
                            <ColumnFilterDropdown
                              colKey={c.key}
                              data={cardFiltered}
                              value={advFilters[c.key] || []}
                              onChange={v => setAdvFilters(p => ({ ...p, [c.key]: v }))}
                              label={c.label}
                            />
                          )}
                          {!c.key && c === ADVICE_COLS[ADVICE_COLS.length - 1] && hasAdvFilter && (
                            <button onClick={() => setAdvFilters({})} style={{ fontSize: '10px', color: '#E8470F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700', padding: '1px 4px', marginLeft: '2px' }}>✕</button>
                          )}
                        </span>
                        {i < ADVICE_COLS.length - 1 && (
                          <div className="col-resize-handle" {...advHandleProps(i)} />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayAdvices.map(a => (
                    <tr key={a.advice_id}>
                      <td style={{ fontWeight: '800', color: '#E8470F', whiteSpace: 'nowrap' }}>{a.advice_ref}</td>
                      <td style={{ fontWeight: '600', color: '#0f172a' }}>{a.agency_name}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                          {(a.jobs || []).map(j => (
                            <span key={j.job_id} style={{ background: '#FEF0EB', color: '#E8470F', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                              {j.job_ref || j.po_no}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
                        {a.rate_type === 'manday' ? `${a.num_mandays}d @ ${fmt(a.rate_value, a.currency)}/d` : `${a.rate_value}% of PO`}
                      </td>
                      <td style={{ fontWeight: '700', color: '#0f172a', whiteSpace: 'nowrap' }}>{fmt(a.total_cost, a.currency)}</td>
                      <td>
                        <span style={{
                          background: a.cost_bearer === 'supplier' ? '#fefce8' : '#f5f3ff',
                          color: a.cost_bearer === 'supplier' ? '#92400e' : '#5b21b6',
                          padding: '2px 7px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap',
                        }}>
                          {a.cost_bearer === 'supplier' ? t('costs_supplier_bears') : t('costs_company_bears')}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}><StatusBadge status={a.status} t={t} /></td>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '120px' }}>
                          {a.contract_name && <span style={{ color: '#1d4ed8', fontWeight: '700', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px', alignSelf: 'flex-start', marginBottom: '2px' }}>📋 {a.contract_name}</span>}
                          {a.qa_user_name       && <span>✅ QA: <strong>{a.qa_user_name}</strong></span>}
                          {a.buying_user_name   && <span>✅ Buying: <strong>{a.buying_user_name}</strong></span>}
                          {a.imports_user_name  && <span>✅ Imports: <strong>{a.imports_user_name}</strong></span>}
                          {a.accounts_user_name && <span style={{ color: '#15803d', fontWeight: '700' }}>💰 <strong>{a.accounts_user_name}</strong></span>}
                          {a.accounts_notes && <span style={{ color: '#15803d', fontStyle: 'italic' }}>{a.accounts_notes}</span>}
                          {a.status === 'rejected' && <span style={{ color: '#991b1b' }}>❌ {a.rejection_reason}</span>}
                          {!a.contract_name && !a.qa_user_name && !a.buying_user_name && !a.imports_user_name && !a.accounts_user_name && !a.rejection_reason && <span style={{ color: '#cbd5e1' }}>—</span>}
                        </div>
                      </td>
                      {(role === 'imports' || role === 'qa' || role === 'buying' || role === 'accounts' || role === 'admin') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {a.invoice_file_name ? (
                            <button onClick={() => openInvoicePanel(a.advice_id, a.invoice_file_name)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', fontWeight: '600', fontSize: '11px', textDecoration: 'underline', padding: 0 }}>
                              📄 View
                            </button>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '11px' }}>—</span>
                          )}
                        </td>
                      )}
                      <td style={{ color: '#94a3b8', whiteSpace: 'nowrap', fontSize: '11px' }}>
                        <div>{a.created_by_name}</div>
                        <div>{new Date(a.created_at).toLocaleDateString()}</div>
                      </td>
                      {advices.some(a => canApprove(a)) && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {canApprove(a) ? (
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button onClick={() => { setShowApprove({ advice: a, action: 'approve' }); setActionNote(''); setActionMsg('') }}
                                style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {role === 'accounts' ? t('costs_paid_confirm') : t('costs_approve')}
                              </button>
                              <button onClick={() => { setShowApprove({ advice: a, action: 'reject' }); setActionNote(''); setActionMsg('') }}
                                style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                                ✕
                              </button>
                            </div>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScrollWrap>
          </div>
        )})()}


        {/* Standard Contracts toggle */}
        {(role === 'qa' || role === 'buying' || role === 'imports' || role === 'accounts' || role === 'admin') && (
          <div style={{ marginBottom: '24px' }}>
            <button
              onClick={() => { setShowContracts(p => !p); if (!showContracts) loadContracts() }}
              className={showContracts ? 'btn btn-primary' : 'btn btn-outline'}
            >
              {showContracts ? `▲ ${t('costs_hide')}` : `▼ ${t('costs_manage')}`} {t('costs_std_contracts')}
            </button>

            {showContracts && (
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '370px 1fr', gap: '20px' }}>
                {/* Contract form */}
                <div className="card" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '16px' }}>{t('costs_add_contract')}</h3>
                  <form onSubmit={handleCreateContract} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={labelSt}>{t('col_agency')} *</label>
                      <select value={contractForm.agency_code} onChange={e => setContractForm(p => ({ ...p, agency_code: e.target.value }))} required style={inputSt}>
                        <option value="">Select agency…</option>
                        {allAgencies.map(a => <option key={a.agency_code} value={a.agency_code}>{a.name} ({a.agency_code})</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelSt}>{t('costs_rate_structure')}</label>
                      <input type="text" value={contractForm.contract_name} onChange={e => setContractForm(p => ({ ...p, contract_name: e.target.value }))} required placeholder="e.g. Standard Rate" style={inputSt} />
                    </div>
                    <div>
                      <label style={labelSt}>{t('costs_rate_type_label')}</label>
                      <select value={contractForm.rate_type} onChange={e => setContractForm(p => ({ ...p, rate_type: e.target.value }))} style={inputSt}>
                        <option value="manday">{t('costs_per_manday')}</option>
                        <option value="percentage">{t('costs_pct_po')}</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={labelSt}>
                          {contractForm.rate_type === 'percentage' ? 'Percentage of PO Value (%) *' : t('costs_rate_value')}
                        </label>
                        <input
                          type="number" min="0" step="0.01"
                          value={contractForm.rate_value}
                          onChange={e => setContractForm(p => ({ ...p, rate_value: e.target.value }))}
                          required
                          placeholder={contractForm.rate_type === 'percentage' ? 'e.g. 3.5 (means 3.5%)' : 'e.g. 250'}
                          style={inputSt}
                        />
                        {contractForm.rate_type === 'percentage' && (
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                            Enter the % of the total PO value to charge as inspection fee
                          </p>
                        )}
                      </div>
                      <div>
                        <label style={{ ...labelSt, color: contractForm.rate_type === 'percentage' ? '#94a3b8' : undefined }}>
                          {t('col_currency')}{contractForm.rate_type === 'percentage' ? ' (N/A for %)' : ''}
                        </label>
                        <select value={contractForm.currency} onChange={e => setContractForm(p => ({ ...p, currency: e.target.value }))} disabled={contractForm.rate_type === 'percentage'} style={{ ...inputSt, opacity: contractForm.rate_type === 'percentage' ? 0.4 : 1, cursor: contractForm.rate_type === 'percentage' ? 'not-allowed' : 'auto' }}>
                          {['USD','AED','INR','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={labelSt}>{t('costs_valid_from')}</label>
                        <input type="date" value={contractForm.valid_from} onChange={e => setContractForm(p => ({ ...p, valid_from: e.target.value }))} style={inputSt} />
                      </div>
                      <div>
                        <label style={labelSt}>{t('costs_valid_to')}</label>
                        <input type="date" value={contractForm.valid_to} onChange={e => setContractForm(p => ({ ...p, valid_to: e.target.value }))} style={inputSt} />
                      </div>
                    </div>
                    {contractMsg && <div className={`alert ${contractMsg.includes('saved') ? 'alert-success' : 'alert-error'}`}>{contractMsg}</div>}
                    <button type="submit" disabled={contractSaving} className="btn btn-primary" style={{ width: '100%' }}>
                      {contractSaving ? t('common_saving') : t('costs_save_contract')}
                    </button>
                  </form>
                </div>

                {/* Contracts list */}
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div className="card-header">
                    <h3 className="section-title">{t('costs_existing_contracts')} ({allContracts.length})</h3>
                  </div>
                  {allContracts.length === 0 ? (
                    <div className="empty-state"><p>{t('costs_no_contracts')}</p></div>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>{[t('col_agency'), t('col_structure'), t('col_rate_type'), t('col_rate'), t('col_currency'), t('col_valid')].map(h => <th key={h}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {allContracts.map(c => (
                            <tr key={c.contract_id}>
                              <td style={{ fontWeight: '600' }}>{c.agency_name || c.agency_code}</td>
                              <td style={{ fontWeight: '500' }}>{c.contract_name || '—'}</td>
                              <td>{c.rate_type === 'manday' ? 'Manday' : '% PO'}</td>
                              <td>{c.rate_type === 'percentage' ? `${c.rate_value}%` : c.rate_value}</td>
                              <td>{c.rate_type === 'percentage' ? '—' : c.currency}</td>
                              <td className="text-mono" style={{ color: '#94a3b8' }}>{c.valid_from || '—'} → {c.valid_to || '∞'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Create Advice Modal ────────────────────────────────────────── */}
      {showCreate && (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', overflowY: 'auto', padding: '32px 16px' }}>
          <div className="modal-box" style={{ maxWidth: '620px' }}>
            <p className="modal-title">{t('costs_new_advice_modal')}</p>
            <p className="modal-subtitle">{t('costs_select_jobs')}</p>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label style={{ ...labelSt, fontSize: '13px', textTransform: 'none', letterSpacing: 0 }}>Select Jobs * ({selectedJobs.length} selected)</label>
                <div style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                  {jobs.length === 0 ? (
                    <p style={{ padding: '16px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>{t('costs_no_eligible_jobs')}</p>
                  ) : jobs.map(j => {
                    const isSelf = j.inspection_type === 'self'
                    const isReinspect = !!j.parent_job_id
                    return (
                      <label key={j.job_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.5 : 1 }}>
                        <input type="checkbox" checked={selectedJobs.includes(j.job_id)} onChange={() => toggleJob(j.job_id)} disabled={isSelf} />
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>{j.job_ref || j.job_id?.slice(0, 8)}</span>
                          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>{j.po_no} · {j.item_name || j.supplier_code}</span>
                          {isSelf && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#dc2626', fontWeight: '600' }}>{t('costs_self_no_charge')}</span>}
                          {isReinspect && !isSelf && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600', background: '#fefce8', padding: '1px 6px', borderRadius: '4px' }}>{t('costs_reinspect_supplier')}</span>}
                          {j.contract_name && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#1d4ed8', fontWeight: '600', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px' }}>📋 {j.contract_name}</span>}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {contracts.length > 0 && (
                <div>
                  <label style={labelSt}>{t('costs_load_contract')}</label>
                  <select value={selectedContract} onChange={e => applyContract(e.target.value)} style={inputSt}>
                    <option value="">{t('costs_manual_entry')}</option>
                    {contracts.map(c => (
                      <option key={c.contract_id} value={c.contract_id}>
                        {c.contract_name || 'Standard Rate'} — {c.rate_type === 'manday' ? `${c.rate_value} ${c.currency}/manday` : `${c.rate_value}% of PO value`}{c.valid_to ? ` (till ${c.valid_to})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedContract && (() => {
                const c = contracts.find(c => c.contract_id === selectedContract)
                const jobWithContract = jobs.find(j => j.contract_id === selectedContract)
                const name = c?.contract_name || jobWithContract?.contract_name
                return name ? (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📋</span>
                    <span><strong>Per Contract:</strong> {name} — rates auto-filled (excl. taxes). Travel & stay to be entered as actuals.</span>
                  </div>
                ) : null
              })()}

              <div>
                <label style={labelSt}>{t('costs_rate_type_label')}</label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  {['manday', 'percentage'].map(rt => (
                    <label key={rt} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#334155', fontWeight: '500' }}>
                      <input type="radio" value={rt} checked={rateType === rt} onChange={() => setRateType(rt)} />
                      {rt === 'manday' ? t('costs_per_manday') : t('costs_pct_po')}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: rateType === 'manday' ? '1fr 1fr' : '1fr', gap: '12px' }}>
                <div>
                  <label style={labelSt}>{rateType === 'manday' ? t('costs_rate_manday') : t('costs_percentage')}</label>
                  <input type="number" min="0" step="0.01" value={rateValue} onChange={e => setRateValue(e.target.value)} required placeholder={rateType === 'manday' ? 'e.g. 250' : 'e.g. 3.5'} style={inputSt} />
                </div>
                {rateType === 'manday' && (
                  <div>
                    <label style={labelSt}>{t('costs_num_mandays')}</label>
                    <input type="number" min="0.5" step="0.5" value={numMandays} onChange={e => setNumMandays(e.target.value)} required placeholder="e.g. 2" style={inputSt} />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ ...labelSt, color: rateType === 'percentage' ? '#94a3b8' : undefined }}>{t('costs_travel_allowance')}</label>
                  <input type="number" min="0" step="0.01" value={rateType === 'percentage' ? '' : travel} onChange={e => setTravel(e.target.value)} placeholder="0" style={{ ...inputSt, opacity: rateType === 'percentage' ? 0.4 : 1, cursor: rateType === 'percentage' ? 'not-allowed' : 'auto' }} disabled={rateType === 'percentage'} />
                </div>
                <div>
                  <label style={{ ...labelSt, color: rateType === 'percentage' ? '#94a3b8' : undefined }}>{t('costs_stay_allowance')}</label>
                  <input type="number" min="0" step="0.01" value={rateType === 'percentage' ? '' : stay} onChange={e => setStay(e.target.value)} placeholder="0" style={{ ...inputSt, opacity: rateType === 'percentage' ? 0.4 : 1, cursor: rateType === 'percentage' ? 'not-allowed' : 'auto' }} disabled={rateType === 'percentage'} />
                </div>
                <div>
                  <label style={labelSt}>{t('col_currency')}</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputSt}>
                    {['USD','AED','INR','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {rateType === 'manday' && calcCost() !== null && (
                <div className="alert alert-success">
                  {t('costs_estimated_total')} <strong>{fmt(calcCost(), currency)}</strong>
                  <span style={{ fontSize: '12px', fontWeight: '400', marginLeft: '8px' }}>({rateValue} × {numMandays} days + {travel || 0} travel + {stay || 0} stay)</span>
                </div>
              )}
              {rateType === 'percentage' && rateValue && (
                <div className="alert alert-info">
                  {calcCost() !== null
                    ? <><strong>{t('costs_estimated_total')} {fmt(calcCost(), currency)}</strong></>
                    : <>Cost: <strong>{rateValue}%</strong> of total PO value of selected jobs</>}
                </div>
              )}

              <div>
                <label style={labelSt}>{t('costs_notes_optional')}</label>
                <textarea value={adviceNotes} onChange={e => setAdviceNotes(e.target.value)} rows={2} placeholder="Any additional details…" className="textarea" style={{ ...inputSt, resize: 'vertical' }} />
              </div>

              <div>
                <label style={labelSt}>{t('costs_agency_invoice')} <span style={{ color: '#dc2626' }}>(required)</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: invoiceFile ? '#f0fdf4' : '#fff', border: `1.5px solid ${invoiceFile ? '#86efac' : '#e2e8f0'}`, borderRadius: '7px', padding: '8px 14px', fontSize: '13px', fontWeight: '600', color: invoiceFile ? '#15803d' : '#374151', transition: 'all 0.15s' }}>
                    📄 {invoiceFile ? invoiceFile.name : t('costs_choose_invoice')}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setInvoiceFile(e.target.files[0] || null)} />
                  </label>
                  {invoiceFile && (
                    <button type="button" onClick={() => setInvoiceFile(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                  )}
                </div>
              </div>

              {createMsg && <div className="alert alert-error">{createMsg}</div>}

              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button type="submit" disabled={creating} className="btn btn-primary" style={{ flex: 1 }}>
                  {creating ? t('common_saving') : t('costs_submit_advice')}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost" style={{ flex: 1 }}>
                  {t('admin_cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Approve/Reject Modal ───────────────────────────────────────── */}
      {showApprove && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p className="modal-title">
              {showApprove.action === 'approve' ? t('costs_confirm_approval') : t('costs_confirm_rejection')}
            </p>
            <p className="modal-subtitle">
              {showApprove.advice.advice_ref} — <strong>{fmt(showApprove.advice.total_cost, showApprove.advice.currency)}</strong>
            </p>

            {/* Invoice reference */}
            {showApprove.advice.invoice_file_name && (
              <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #86efac', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <span style={{ color: '#15803d', fontWeight: '700' }}>📄 Invoice:</span>
                <button onClick={() => openInvoicePanel(showApprove.advice.advice_id, showApprove.advice.invoice_file_name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', textDecoration: 'underline', padding: 0, fontSize: '13px' }}>
                  {showApprove.advice.invoice_file_name}
                </button>
              </div>
            )}

            <div className="field">
              <label>{showApprove.action === 'approve' ? t('costs_notes_optional') : t('costs_rejection_reason')}</label>
              <textarea
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                rows={3}
                placeholder={showApprove.action === 'approve' ? t('costs_any_remarks') : t('costs_rejection_placeholder')}
                className="textarea"
              />
            </div>

            {actionMsg && <div className="alert alert-error mb-4">{actionMsg}</div>}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleAction}
                disabled={actionSaving}
                className={showApprove.action === 'approve' ? 'btn btn-success' : 'btn btn-danger'}
                style={{ flex: 1 }}>
                {actionSaving ? t('common_saving') : showApprove.action === 'approve' ? t('costs_confirm_approval') : t('costs_confirm_rejection')}
              </button>
              <button onClick={() => setShowApprove(null)} className="btn btn-ghost" style={{ flex: 1 }}>
                {t('admin_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
