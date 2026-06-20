import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getAdvices, createAdvice, approveAdvice, rejectAdvice, getContracts, createContract } from '../api/inspectionCosts.js'
import { getJobs } from '../api/inspectionJobs.js'

const STATUS_COLOR = {
  pending_qa:      { bg: '#eff6ff', color: '#1d4ed8', label: 'Pending QA' },
  pending_buying:  { bg: '#fefce8', color: '#92400e', label: 'Pending Buying' },
  approved:        { bg: '#f0fdf4', color: '#166534', label: 'Approved' },
  rejected:        { bg: '#fef2f2', color: '#991b1b', label: 'Rejected' },
}

function StatusBadge({ status }) {
  const s = STATUS_COLOR[status] || { bg: '#f3f4f6', color: '#374151', label: status }
  return (
    <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700' }}>
      {s.label}
    </span>
  )
}

function fmt(num, currency = 'USD') {
  if (num == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(num)
}

export default function InspectionCostPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const role = user?.role

  const [advices, setAdvices]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [showCreate, setShowCreate]   = useState(false)
  const [showApprove, setShowApprove] = useState(null)  // { advice, action: 'approve'|'reject' }
  const [actionNote, setActionNote]   = useState('')
  const [actionMsg, setActionMsg]     = useState('')
  const [actionSaving, setActionSaving] = useState(false)

  // Contract management (QA/Buying/Admin)
  const [showContracts, setShowContracts] = useState(false)
  const [allContracts, setAllContracts]   = useState([])
  const [allAgencies, setAllAgencies]     = useState([])
  const [contractForm, setContractForm]   = useState({ agency_code: '', contract_name: '', rate_type: 'manday', rate_value: '', travel_allowance: '', stay_allowance_per_day: '', currency: 'USD', valid_from: '', valid_to: '', notes: '' })
  const [contractMsg, setContractMsg]     = useState('')
  const [contractSaving, setContractSaving] = useState(false)

  // Create form state
  const [jobs, setJobs]               = useState([])
  const [contracts, setContracts]     = useState([])
  const [selectedJobs, setSelectedJobs] = useState([])
  const [rateType, setRateType]       = useState('manday')
  const [rateValue, setRateValue]     = useState('')
  const [numMandays, setNumMandays]   = useState('')
  const [travel, setTravel]           = useState('')
  const [stay, setStay]               = useState('')
  const [currency, setCurrency]       = useState('USD')
  const [adviceNotes, setAdviceNotes] = useState('')
  const [selectedContract, setSelectedContract] = useState('')
  const [createMsg, setCreateMsg]     = useState('')
  const [creating, setCreating]       = useState(false)

  const load = () => {
    setLoading(true)
    getAdvices().then(r => setAdvices(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const loadContracts = async () => {
    try {
      const [cr, ar] = await Promise.all([getContracts(), import('../api/admin.js').then(m => m.getAgencies())])
      setAllContracts(cr.data || [])
      setAllAgencies(ar.data || [])
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

  const openCreate = async () => {
    setSelectedJobs([]); setRateType('manday'); setRateValue(''); setNumMandays('')
    setTravel(''); setStay(''); setCurrency('USD'); setAdviceNotes(''); setSelectedContract(''); setCreateMsg('')
    try {
      const [jobsRes, contractsRes] = await Promise.all([getJobs(), getContracts()])
      // Show all conducted inspections eligible for raising charges
      setJobs((jobsRes.data || []).filter(j => ['submitted_pending_qa', 'qa_approved', 'qa_rejected'].includes(j.status)))
      setContracts(contractsRes.data || [])
    } catch {}
    setShowCreate(true)
  }

  const applyContract = (contractId) => {
    setSelectedContract(contractId)
    const c = contracts.find(c => c.contract_id === contractId)
    if (!c) return
    setRateType(c.rate_type)
    setRateValue(String(c.rate_value))
    setTravel(String(c.travel_allowance))
    setStay(String(c.stay_allowance_per_day))
    setCurrency(c.currency)
  }

  // Calculated cost preview
  const calcCost = () => {
    if (!rateValue) return null
    if (rateType === 'manday') {
      if (!numMandays) return null
      return (parseFloat(rateValue) * parseFloat(numMandays)) +
             parseFloat(travel || 0) + parseFloat(stay || 0)
    }
    return null // percentage shown as "X% of PO value"
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!selectedJobs.length) { setCreateMsg('Select at least one job'); return }
    setCreating(true); setCreateMsg('')
    try {
      await createAdvice({
        job_ids: selectedJobs,
        rate_type: rateType,
        rate_value: parseFloat(rateValue),
        num_mandays: numMandays ? parseFloat(numMandays) : null,
        travel_allowance: parseFloat(travel || 0),
        stay_allowance: parseFloat(stay || 0),
        currency,
        contract_id: selectedContract || null,
        notes: adviceNotes || null,
      })
      setShowCreate(false)
      load()
    } catch (err) {
      setCreateMsg(err?.response?.data?.error || 'Failed to create advice')
    } finally { setCreating(false) }
  }

  const handleAction = async () => {
    if (!showApprove) return
    if (showApprove.action === 'reject' && !actionNote) { setActionMsg('Please provide rejection reason'); return }
    setActionSaving(true); setActionMsg('')
    try {
      if (showApprove.action === 'approve') {
        await approveAdvice(showApprove.advice.advice_id, actionNote)
      } else {
        await rejectAdvice(showApprove.advice.advice_id, actionNote)
      }
      setShowApprove(null); setActionNote(''); load()
    } catch (err) {
      setActionMsg(err?.response?.data?.error || 'Action failed')
    } finally { setActionSaving(false) }
  }

  const canApprove = (advice) => {
    if (role === 'qa') return advice.status === 'pending_qa'
    if (role === 'buying') return advice.status === 'pending_buying'
    return false
  }

  const toggleJob = (id) => setSelectedJobs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#111827' }}>{t('costs_title')}</h1>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
              {role === 'agency_user' ? t('costs_subtitle_agency') : t('costs_subtitle_review')}
            </p>
          </div>
          {role === 'agency_user' && (
            <button onClick={openCreate} style={{ backgroundColor: '#1e40af', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              {t('costs_new_advice')}
            </button>
          )}
        </div>

        {/* Stats row for qa/buying */}
        {(role === 'qa' || role === 'buying') && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: t('costs_pending_qa'), key: 'pending_qa', color: '#1d4ed8' },
              { label: t('costs_pending_buying'), key: 'pending_buying', color: '#92400e' },
              { label: t('costs_approved'), key: 'approved', color: '#166534' },
              { label: t('costs_rejected'), key: 'rejected', color: '#991b1b' },
            ].map(s => (
              <div key={s.key} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{s.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: '28px', fontWeight: '700', color: s.color }}>
                  {advices.filter(a => a.status === s.key).length}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Standard Contracts (QA / Buying / Admin) */}
        {(role === 'qa' || role === 'buying' || role === 'admin') && (
          <div style={{ marginBottom: '24px' }}>
            <button onClick={() => { setShowContracts(p => !p); if (!showContracts) loadContracts() }}
              style={{ backgroundColor: showContracts ? '#1e40af' : '#fff', color: showContracts ? '#fff' : '#1e40af', border: '1px solid #1e40af', padding: '8px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              {showContracts ? `▲ ${t('costs_hide')}` : `▼ ${t('costs_manage')}`} {t('costs_std_contracts')}
            </button>

            {showContracts && (
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px' }}>
                {/* Contract form */}
                <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: '700' }}>Add / Update Contract</h3>
                  <form onSubmit={handleCreateContract}>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Agency *</label>
                      <select value={contractForm.agency_code} onChange={e => setContractForm(p => ({ ...p, agency_code: e.target.value }))} required
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}>
                        <option value="">Select agency...</option>
                        {allAgencies.map(a => <option key={a.agency_code} value={a.agency_code}>{a.name} ({a.agency_code})</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Rate Structure Name *</label>
                      <input type="text" value={contractForm.contract_name} onChange={e => setContractForm(p => ({ ...p, contract_name: e.target.value }))} required
                        placeholder="e.g. Standard Rate, Weekend Rate, International"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Rate Type *</label>
                      <select value={contractForm.rate_type} onChange={e => setContractForm(p => ({ ...p, rate_type: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}>
                        <option value="manday">Per Manday</option>
                        <option value="percentage">% of PO Value</option>
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Rate Value *</label>
                        <input type="number" min="0" step="0.01" value={contractForm.rate_value} onChange={e => setContractForm(p => ({ ...p, rate_value: e.target.value }))} required placeholder="e.g. 250"
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Currency</label>
                        <select value={contractForm.currency} onChange={e => setContractForm(p => ({ ...p, currency: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}>
                          {['USD','AED','INR','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Travel Allowance</label>
                        <input type="number" min="0" step="0.01" value={contractForm.travel_allowance} onChange={e => setContractForm(p => ({ ...p, travel_allowance: e.target.value }))} placeholder="0"
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Stay/day</label>
                        <input type="number" min="0" step="0.01" value={contractForm.stay_allowance_per_day} onChange={e => setContractForm(p => ({ ...p, stay_allowance_per_day: e.target.value }))} placeholder="0"
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Valid From</label>
                        <input type="date" value={contractForm.valid_from} onChange={e => setContractForm(p => ({ ...p, valid_from: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>Valid To</label>
                        <input type="date" value={contractForm.valid_to} onChange={e => setContractForm(p => ({ ...p, valid_to: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    {contractMsg && <p style={{ margin: '0 0 8px', fontSize: '12px', color: contractMsg.includes('saved') ? '#059669' : '#dc2626' }}>{contractMsg}</p>}
                    <button type="submit" disabled={contractSaving} style={{ width: '100%', backgroundColor: contractSaving ? '#93c5fd' : '#1e40af', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: contractSaving ? 'not-allowed' : 'pointer' }}>
                      {contractSaving ? t('common_saving') : t('costs_save_contract')}
                    </button>
                  </form>
                </div>

                {/* Contracts list */}
                <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7eb' }}>
                    <span style={{ fontWeight: '700', fontSize: '14px' }}>{t('costs_existing_contracts')} ({allContracts.length})</span>
                  </div>
                  {allContracts.length === 0 ? (
                    <p style={{ padding: '20px', color: '#9ca3af', fontSize: '13px' }}>{t('costs_no_contracts')}</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc' }}>
                          {['Agency', 'Structure Name', 'Rate Type', 'Rate', 'Travel', 'Stay/Day', 'Currency', 'Valid'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allContracts.map(c => (
                          <tr key={c.contract_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '9px 12px', fontWeight: '600' }}>{c.agency_name || c.agency_code}</td>
                            <td style={{ padding: '9px 12px', color: '#111827', fontWeight: '500' }}>{c.contract_name || '—'}</td>
                            <td style={{ padding: '9px 12px', color: '#6b7280' }}>{c.rate_type === 'manday' ? 'Manday' : '% PO'}</td>
                            <td style={{ padding: '9px 12px' }}>{c.rate_value}</td>
                            <td style={{ padding: '9px 12px', color: '#6b7280' }}>{c.travel_allowance}</td>
                            <td style={{ padding: '9px 12px', color: '#6b7280' }}>{c.stay_allowance_per_day}</td>
                            <td style={{ padding: '9px 12px', color: '#6b7280' }}>{c.currency}</td>
                            <td style={{ padding: '9px 12px', color: '#6b7280', fontSize: '12px' }}>{c.valid_from || '—'} → {c.valid_to || '∞'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* List */}
        {loading ? <p style={{ color: '#6b7280' }}>{t('common_loading')}</p> : advices.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <p style={{ color: '#9ca3af', fontSize: '15px' }}>{t('costs_no_records')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {advices.map(a => (
              <div key={a.advice_id} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>{a.advice_ref}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                      Agency: <strong style={{ color: '#374151' }}>{a.agency_name}</strong>
                      &nbsp;·&nbsp;
                      {a.rate_type === 'manday'
                        ? `${a.num_mandays} mandays @ ${fmt(a.rate_value, a.currency)}/day`
                        : `${a.rate_value}% of PO value`}
                      &nbsp;·&nbsp;
                      <strong style={{ color: '#111827' }}>Total: {fmt(a.total_cost, a.currency)}</strong>
                      &nbsp;·&nbsp;
                      <span style={{
                        backgroundColor: a.cost_bearer === 'supplier' ? '#fef3c7' : '#ede9fe',
                        color: a.cost_bearer === 'supplier' ? '#92400e' : '#5b21b6',
                        padding: '1px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700'
                      }}>
                        {a.cost_bearer === 'supplier' ? t('costs_supplier') : t('costs_homes_r_us')}
                      </span>
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9ca3af' }}>
                      {(a.jobs || []).length} job(s) &nbsp;·&nbsp; Created by {a.created_by_name} on {new Date(a.created_at).toLocaleDateString()}
                    </p>
                    {/* Job pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                      {(a.jobs || []).map(j => (
                        <span key={j.job_id} style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: '600' }}>
                          {j.job_ref || j.po_no}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {canApprove(a) && (
                      <>
                        <button onClick={() => { setShowApprove({ advice: a, action: 'approve' }); setActionNote(''); setActionMsg('') }}
                          style={{ padding: '6px 14px', fontSize: '13px', fontWeight: '600', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: '6px', cursor: 'pointer' }}>
                          {t('costs_approve')}
                        </button>
                        <button onClick={() => { setShowApprove({ advice: a, action: 'reject' }); setActionNote(''); setActionMsg('') }}
                          style={{ padding: '6px 14px', fontSize: '13px', fontWeight: '600', backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer' }}>
                          {t('costs_reject')}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Approval trail */}
                {(a.qa_user_name || a.buying_user_name || a.rejected_by_name) && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '24px', fontSize: '12px', color: '#6b7280' }}>
                    {a.qa_user_name && (
                      <span>✅ QA: <strong>{a.qa_user_name}</strong> {a.qa_notes ? `— "${a.qa_notes}"` : ''}</span>
                    )}
                    {a.buying_user_name && (
                      <span>✅ Buying: <strong>{a.buying_user_name}</strong> {a.buying_notes ? `— "${a.buying_notes}"` : ''}</span>
                    )}
                    {a.status === 'rejected' && (
                      <span style={{ color: '#991b1b' }}>❌ Rejected: {a.rejection_reason}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Advice Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, overflowY: 'auto', padding: '32px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '32px', width: '600px', maxWidth: '100%' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700' }}>{t('costs_new_advice_modal')}</h2>

            <form onSubmit={handleCreate}>
              {/* Job selection */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#374151', marginBottom: '8px' }}>
                  Select Jobs * ({selectedJobs.length} selected)
                </label>
                <div style={{ border: '1px solid #d1d5db', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {jobs.length === 0 ? (
                    <p style={{ padding: '16px', color: '#9ca3af', fontSize: '13px', margin: 0 }}>No eligible jobs found</p>
                  ) : jobs.map(j => {
                    const isSelf = j.inspection_type === 'self'
                    const isReinspect = !!j.parent_job_id
                    return (
                      <label key={j.job_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.5 : 1, backgroundColor: isSelf ? '#fafafa' : '#fff' }}>
                        <input type="checkbox" checked={selectedJobs.includes(j.job_id)} onChange={() => toggleJob(j.job_id)} disabled={isSelf} />
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '13px', color: '#111827' }}>{j.job_ref || j.job_id?.slice(0, 8)}</span>
                          <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>{j.po_no} · {j.item_name || j.supplier_code}</span>
                          <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '8px' }}>{j.inspection_date}</span>
                          {isSelf && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#dc2626', fontWeight: '600' }}>Self-inspection — no charges</span>}
                          {isReinspect && !isSelf && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600', backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>Re-inspection — supplier bears cost</span>}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Standard contract */}
              {contracts.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Load from Standard Contract</label>
                  <select value={selectedContract} onChange={e => applyContract(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}>
                    <option value="">— Manual entry —</option>
                    {contracts.map(c => (
                      <option key={c.contract_id} value={c.contract_id}>
                        {c.contract_name || 'Standard Rate'} —{' '}
                        {c.rate_type === 'manday' ? `${c.rate_value} ${c.currency}/manday` : `${c.rate_value}% of PO value`}
                        {c.valid_to ? ` (till ${c.valid_to})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Rate type */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Rate Type *</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {['manday', 'percentage'].map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                      <input type="radio" value={t} checked={rateType === t} onChange={() => setRateType(t)} />
                      {t === 'manday' ? 'Per Manday' : '% of PO Value'}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: rateType === 'manday' ? '1fr 1fr' : '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                    {rateType === 'manday' ? 'Rate per Manday *' : 'Percentage (%) *'}
                  </label>
                  <input type="number" min="0" step="0.01" value={rateValue} onChange={e => setRateValue(e.target.value)} required
                    placeholder={rateType === 'manday' ? 'e.g. 250' : 'e.g. 3.5'}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                {rateType === 'manday' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>No. of Mandays *</label>
                    <input type="number" min="0.5" step="0.5" value={numMandays} onChange={e => setNumMandays(e.target.value)} required={rateType === 'manday'}
                      placeholder="e.g. 2"
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Travel Allowance</label>
                  <input type="number" min="0" step="0.01" value={travel} onChange={e => setTravel(e.target.value)} placeholder="0"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Stay Allowance</label>
                  <input type="number" min="0" step="0.01" value={stay} onChange={e => setStay(e.target.value)} placeholder="0"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}>
                    {['USD', 'AED', 'INR', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Cost preview */}
              {calcCost() !== null && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#166534' }}>
                    Estimated Total: <strong>{fmt(calcCost(), currency)}</strong>
                    {rateType === 'manday' && (
                      <span style={{ fontSize: '12px', fontWeight: '400', marginLeft: '8px' }}>
                        ({rateValue} × {numMandays} days + {travel || 0} travel + {stay || 0} stay)
                      </span>
                    )}
                  </p>
                </div>
              )}
              {rateType === 'percentage' && rateValue && (
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1e40af' }}>
                    Cost will be calculated as <strong>{rateValue}%</strong> of the total PO value of selected jobs
                  </p>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Notes</label>
                <textarea value={adviceNotes} onChange={e => setAdviceNotes(e.target.value)} rows={2}
                  placeholder="Any additional details..."
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>

              {createMsg && <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#dc2626' }}>{createMsg}</p>}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" disabled={creating} style={{ flex: 1, backgroundColor: creating ? '#93c5fd' : '#1e40af', color: '#fff', border: 'none', padding: '10px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: creating ? 'not-allowed' : 'pointer' }}>
                  {creating ? t('common_saving') : t('costs_submit_advice')}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #d1d5db', padding: '10px', borderRadius: '7px', fontSize: '14px', cursor: 'pointer' }}>
                  {t('admin_cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Approve / Reject Modal ──────────────────────────────────────── */}
      {showApprove && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '32px', width: '440px' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '700' }}>
              {showApprove.action === 'approve' ? 'Approve' : 'Reject'} Charges Advice
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#6b7280' }}>
              {showApprove.advice.advice_ref} — {fmt(showApprove.advice.total_cost, showApprove.advice.currency)}
            </p>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              {showApprove.action === 'approve' ? 'Notes (optional)' : 'Rejection Reason *'}
            </label>
            <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} rows={3}
              placeholder={showApprove.action === 'approve' ? 'Any remarks...' : 'Please explain the reason for rejection...'}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px', resize: 'vertical' }} />

            {actionMsg && <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#dc2626' }}>{actionMsg}</p>}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleAction} disabled={actionSaving} style={{
                flex: 1, border: 'none', padding: '10px', borderRadius: '7px', fontSize: '14px', fontWeight: '600',
                cursor: actionSaving ? 'not-allowed' : 'pointer',
                backgroundColor: showApprove.action === 'approve' ? '#166534' : '#991b1b',
                color: '#fff',
                opacity: actionSaving ? 0.7 : 1
              }}>
                {actionSaving ? t('common_saving') : showApprove.action === 'approve' ? t('costs_confirm_approval') : t('costs_confirm_rejection')}
              </button>
              <button onClick={() => setShowApprove(null)} style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #d1d5db', padding: '10px', borderRadius: '7px', fontSize: '14px', cursor: 'pointer' }}>
                {t('admin_cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
