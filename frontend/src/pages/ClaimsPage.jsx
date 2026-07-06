import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { TableScrollWrap } from '../components/TableScrollWrap.jsx'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import {
  listClaims, createClaim, qaSubmitClaim, returnClaim,
  buyingSubmitClaim, importsReviewClaim, accountsCloseClaim, withdrawClaim,
  getClaimAttachments, uploadClaimAttachment, deleteClaimAttachment, getClaimAttachmentFile,
  updateClaimDetails, reviseReplacementDate, markReplacementReceived, editClaim,
} from '../api/claims.js'
import { generateClaimReport } from '../utils/generateClaimReport.js'
import client from '../api/client.js'
import * as XLSX from 'xlsx'

const STATUS_META = {
  pending_qa:       { bg: '#fef3c7', color: '#92400e', label: 'Pending QA Review' },
  pending_buying:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Pending Buying' },
  pending_imports:  { bg: '#faf5ff', color: '#7e22ce', label: 'Pending Imports' },
  pending_accounts: { bg: '#f0fdfa', color: '#0f766e', label: 'Pending Accounts' },
  closed:           { bg: '#f0fdf4', color: '#15803d', label: 'Closed' },
  submitted:        { bg: '#faf5ff', color: '#7e22ce', label: 'Submitted' },
  settled:          { bg: '#f0fdf4', color: '#15803d', label: 'Settled' },
  withdrawn:        { bg: '#f1f5f9', color: '#64748b', label: 'Withdrawn' },
}

const thStyle = {
  padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700',
  color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
  background: '#f8fafc', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
}
const tdStyle = {
  padding: '12px 14px', fontSize: '13px', color: '#1e293b',
  borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle',
}
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box',
}
const labelStyle = { fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }

// Role-scoped editable fields — mirrors the backend edit route. Each stage edits
// only its own fields; saving rewinds the claim to that stage for re-approval.
const EDIT_CONFIG = {
  warehouse: [
    { key: 'defect_qty', label: 'Defect Qty', type: 'number' },
    { key: 'checked_qty', label: 'QC Checked Qty', type: 'number' },
    { key: 'claim_amount', label: 'Claim Amount (USD)', type: 'number' },
    { key: 'country_of_origin', label: 'Country of Origin', type: 'text' },
    { key: 'trigger_point', label: 'Trigger Point', type: 'text' },
    { key: 'grn_date', label: 'PO / GRN Date', type: 'date' },
    { key: 'trigger_date', label: 'Issue Trigger Date', type: 'date' },
    { key: 'qc_done_date', label: 'QC Done Date', type: 'date' },
    { key: 'description', label: 'Defect Description', type: 'textarea' },
  ],
  qa: [
    { key: 'root_cause', label: 'Root Cause', type: 'textarea' },
    { key: 'corrective_action', label: 'Corrective Action', type: 'textarea' },
    { key: 'preventive_action', label: 'Preventive Action', type: 'textarea' },
    { key: 'rework_scope', label: 'Scope of Rework', type: 'text' },
    { key: 'rework_type', label: 'Rework Type', type: 'select', options: [['', '—'], ['full', 'Full Rework'], ['partial', 'Rework + Replacement']] },
    { key: 'replacement_parts', label: 'Replacement Parts / Cartons', type: 'textarea' },
    { key: 'root_cause_date', label: 'Root Cause Date', type: 'date' },
  ],
  buying: [
    { key: 'penalty_amount', label: 'Penalty (USD)', type: 'number' },
    { key: 'penalty_reason', label: 'Penalty Reason', type: 'textarea' },
    { key: 'settlement_mode', label: 'Settlement Mode', type: 'select', options: [['', '—'], ['replacement', 'Replacement'], ['rework', 'Rework'], ['refund', 'Refund']] },
    { key: 'credit_note_no', label: 'Credit Note No.', type: 'text' },
    { key: 'credit_note_amount', label: 'Credit Note Amount (USD)', type: 'number' },
    { key: 'expected_replacement_date', label: 'Expected Replacement Date', type: 'date' },
    { key: 'rework_cost', label: 'Rework Cost (USD)', type: 'number' },
    { key: 'cost_sheet_note', label: 'Cost Sheet Note', type: 'text' },
    { key: 'settlement_remarks', label: 'Settlement Remarks', type: 'textarea' },
  ],
  imports: [{ key: 'imports_remarks', label: 'Remarks for Accounts', type: 'textarea' }],
  accounts: [{ key: 'deduction_remarks', label: 'Deduction Remark', type: 'textarea' }],
}
const editConfigFor = (role) => role === 'admin'
  ? [].concat(...Object.values(EDIT_CONFIG))
  : (EDIT_CONFIG[role] || [])
const REWIND_LABEL = { warehouse: 'QA', qa: 'Buying', buying: 'Imports', imports: 'Accounts', accounts: 'Accounts' }

export default function ClaimsPage() {
  const { user } = useAuth()
  const { formatFrom } = useCurrency()
  // Claim monetary values are entered and stored in USD (PO/claim currency), so
  // format them from USD into the viewer's display currency — NOT via formatAmount,
  // which assumes an AED-stored base and would wrongly down-convert USD figures.
  const fmt = (v) => formatFrom(v, 'USD')
  const role = user?.role

  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState(null)
  const [colFilters, setColFilters] = useState({})
  const [detail, setDetail] = useState(null)   // selected claim for drawer
  const [msg, setMsg] = useState('')

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [poList, setPoList] = useState([])
  const [itemList, setItemList] = useState([])
  const emptyForm = () => ({ po_no: '', item_code: '', defect_qty: '', claim_amount: '', description: '',
    country_of_origin: '', trigger_point: '', checked_qty: '', grn_date: '', trigger_date: '', qc_done_date: '',
    root_cause: '', corrective_action: '', preventive_action: '', rework_possible: '', rework_scope: '',
    rework_type: '', replacement_parts: '' })
  const [form, setForm] = useState(emptyForm())
  const [createFiles, setCreateFiles] = useState([])   // File[] to upload after create
  const [showCapa, setShowCapa] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Attachments (drawer)
  const [attachments, setAttachments] = useState([])
  const [attachmentURLs, setAttachmentURLs] = useState({})
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  // Rework / cost fields
  const [reworkPossible, setReworkPossible] = useState('')
  const [reworkScope, setReworkScope] = useState('')
  const [reworkType, setReworkType] = useState('')
  const [replacementParts, setReplacementParts] = useState('')
  const [preventiveAction, setPreventiveAction] = useState('')
  const [reworkCost, setReworkCost] = useState('')
  const [costSheetNote, setCostSheetNote] = useState('')

  // Action state (drawer)
  const [rootCause, setRootCause] = useState('')
  const [correctiveAction, setCorrectiveAction] = useState('')
  const [penaltyAmount, setPenaltyAmount] = useState('')
  const [penaltyReason, setPenaltyReason] = useState('')
  const [returnRemarks, setReturnRemarks] = useState('')
  const [acting, setActing] = useState(false)

  // Settlement (folded into Buying final submission) + Imports/Accounts state
  const [settleMode, setSettleMode] = useState('')
  const [creditNoteNo, setCreditNoteNo] = useState('')
  const [settleRemarks, setSettleRemarks] = useState('')
  const [importsRemarks, setImportsRemarks] = useState('')
  const [deductionRemarks, setDeductionRemarks] = useState('')
  // Replacement / Refund buyer decision
  const [expectedRepDate, setExpectedRepDate] = useState('')
  const [creditNoteAmount, setCreditNoteAmount] = useState('')
  const [reviseDate, setReviseDate] = useState('')
  // Role-scoped edit (with re-approval rewind)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({})

  const fetchClaims = () => {
    setLoading(true)
    listClaims().then(r => setClaims(r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }

  // Prefill from ?raise=1&po=…&item=…&wh=…&qty=…&amt=… (Raise Claim shortcut on inspections)
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('raise') === '1' && ['warehouse', 'admin'].includes(role)) {
      setForm(f => ({
        ...f,
        po_no: searchParams.get('po') || '',
        item_code: searchParams.get('item') || '',
        defect_qty: searchParams.get('qty') || '',
        claim_amount: searchParams.get('amt') || '',
        checked_qty: searchParams.get('checked') || '',
        trigger_point: searchParams.get('trigger') || '',
        description: '',
        wh_inspection_id: searchParams.get('wh') || null,
      }))
      setShowCreate(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  useEffect(() => {
    fetchClaims()
    client.get('/masters/pos').then(r => setPoList(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.po_no) { setItemList([]); return }
    client.get('/masters/items', { params: { po_no: form.po_no } })
      .then(r => setItemList(r.data || [])).catch(() => setItemList([]))
  }, [form.po_no])

  const openDetail = (c) => {
    setDetail(c)
    setRootCause(c.root_cause || '')
    setCorrectiveAction(c.corrective_action || '')
    setPenaltyAmount(c.penalty_amount > 0 ? String(c.penalty_amount) : '')
    setPenaltyReason(c.penalty_reason || '')
    setReturnRemarks('')
    setSettleMode(c.settlement_mode || '')
    setCreditNoteNo(c.credit_note_no || '')
    setSettleRemarks(c.settlement_remarks || '')
    setImportsRemarks(c.imports_remarks || '')
    setDeductionRemarks(c.deduction_remarks || '')
    setReworkPossible(c.rework_possible === true ? 'yes' : c.rework_possible === false ? 'no' : '')
    setReworkScope(c.rework_scope || '')
    setReworkType(c.rework_type || '')
    setReplacementParts(c.replacement_parts || '')
    setPreventiveAction(c.preventive_action || '')
    setReworkCost(c.rework_cost != null ? String(c.rework_cost) : '')
    setCostSheetNote(c.cost_sheet_note || '')
    setExpectedRepDate(c.expected_replacement_date ? String(c.expected_replacement_date).slice(0, 10) : '')
    setCreditNoteAmount(c.credit_note_amount != null ? String(c.credit_note_amount) : '')
    setReviseDate(c.expected_replacement_date ? String(c.expected_replacement_date).slice(0, 10) : '')
    setAttachments([]); setAttachmentURLs({})
    getClaimAttachments(c.claim_id).then(r => { setAttachments(r.data || []); loadAttachmentThumbs(c.claim_id, r.data || []) }).catch(() => {})
    setMsg('')
  }

  async function loadAttachmentThumbs(claimId, atts) {
    for (const a of atts) {
      if (!a.file_type?.startsWith('image/')) continue
      try {
        const r = await getClaimAttachmentFile(claimId, a.attachment_id)
        setAttachmentURLs(prev => ({ ...prev, [a.attachment_id]: URL.createObjectURL(r.data) }))
      } catch {}
    }
  }

  async function handleUpload(e, kind) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setMsg('')
    try {
      await uploadClaimAttachment(detail.claim_id, file, kind)
      const r = await getClaimAttachments(detail.claim_id)
      setAttachments(r.data || [])
      loadAttachmentThumbs(detail.claim_id, r.data || [])
    } catch (err) {
      setMsg('Upload failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleDeleteAttachment(aid) {
    if (!window.confirm('Remove this attachment?')) return
    try {
      await deleteClaimAttachment(detail.claim_id, aid)
      setAttachments(prev => prev.filter(a => a.attachment_id !== aid))
    } catch (err) { setMsg('Failed: ' + (err.response?.data?.error || err.message)) }
  }

  async function handleDownloadPdf(claim) {
    setGenerating(true)
    try {
      let atts = attachments
      if (!detail || detail.claim_id !== claim.claim_id) {
        atts = (await getClaimAttachments(claim.claim_id).catch(() => ({ data: [] }))).data || []
      }
      await generateClaimReport(claim, atts, fmt,
        (aid) => `/api/claims/${claim.claim_id}/attachments/${aid}/file`)
    } catch (err) {
      setMsg('PDF failed: ' + (err.message || err))
    } finally { setGenerating(false) }
  }

  const afterAction = (updated) => {
    setDetail(updated)
    setClaims(prev => prev.map(c => c.claim_id === updated.claim_id ? { ...c, ...updated } : c))
  }

  const run = async (fn, successMsg) => {
    setActing(true); setMsg('')
    try {
      const r = await fn()
      afterAction(r.data)
      setMsg(successMsg)
    } catch (err) {
      setMsg('Failed: ' + (err.response?.data?.error || err.message))
    } finally { setActing(false) }
  }

  function openEdit() {
    const cfg = editConfigFor(role)
    const seed = {}
    cfg.forEach(f => {
      let v = detail[f.key]
      if (f.type === 'date') v = v ? String(v).slice(0, 10) : ''
      else if (v === null || v === undefined) v = ''
      else v = String(v)
      seed[f.key] = v
    })
    setEditForm(seed)
    setShowEdit(true)
  }

  async function handleEditSave() {
    const cfg = editConfigFor(role)
    const fields = {}
    cfg.forEach(f => { fields[f.key] = editForm[f.key] === '' ? null : editForm[f.key] })
    setActing(true); setMsg('')
    try {
      const r = await editClaim(detail.claim_id, fields)
      afterAction(r.data)
      setShowEdit(false)
      const rewound = r.data.status !== detail.status
      setMsg(rewound
        ? `Saved. Claim rewound to ${STATUS_META[r.data.status]?.label || r.data.status} for re-approval.`
        : 'Saved.')
    } catch (err) {
      setMsg('Failed: ' + (err.response?.data?.error || err.message))
    } finally { setActing(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true); setCreateError('')
    try {
      const res = await createClaim({
        po_no: form.po_no, item_code: form.item_code,
        wh_inspection_id: form.wh_inspection_id || null,
        defect_qty: form.defect_qty ? parseInt(form.defect_qty, 10) : null,
        claim_amount: form.claim_amount || 0,
        description: form.description,
        country_of_origin: form.country_of_origin || null,
        trigger_point: form.trigger_point || null,
        checked_qty: form.checked_qty ? parseInt(form.checked_qty, 10) : null,
        grn_date: form.grn_date || null,
        trigger_date: form.trigger_date || null,
        qc_done_date: form.qc_done_date || null,
      })
      const claimId = res.data?.claim_id
      // Optional Root Cause / CAPA captured at raise time
      if (claimId && (form.root_cause || form.corrective_action || form.preventive_action || form.rework_possible || form.rework_scope)) {
        await updateClaimDetails(claimId, {
          root_cause: form.root_cause || null,
          corrective_action: form.corrective_action || null,
          preventive_action: form.preventive_action || null,
          rework_possible: form.rework_possible === 'yes' ? true : form.rework_possible === 'no' ? false : undefined,
          rework_scope: form.rework_scope || null,
          rework_type: form.rework_possible === 'yes' ? (form.rework_type || null) : null,
          replacement_parts: form.rework_type === 'partial' ? (form.replacement_parts || null) : null,
        }).catch(() => {})
      }
      // Upload any attached defect images
      if (claimId && createFiles.length) {
        for (const f of createFiles) { await uploadClaimAttachment(claimId, f, 'defect_image').catch(() => {}) }
      }
      setShowCreate(false)
      setForm(emptyForm()); setCreateFiles([]); setShowCapa(false)
      fetchClaims()
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create claim')
    } finally { setCreating(false) }
  }

  function downloadExcel(rows) {
    const data = rows.map(c => ({
      'Claim Ref': c.claim_ref, 'PO No.': c.po_no, 'Item': c.item_name || c.item_code,
      'Supplier': c.supplier_name || c.supplier_code || '', 'Country': c.country_of_origin || c.supplier_country || '',
      'Trigger Point': c.trigger_point || '',
      'Checked Qty': c.checked_qty ?? '', 'Defect Qty': c.defect_qty ?? '',
      '% Defect': c.checked_qty > 0 ? +((c.defect_qty / c.checked_qty) * 100).toFixed(1) : '',
      'PO Value': parseFloat(c.po_value || 0), 'Defect Value': parseFloat(c.defect_value || 0),
      'Claim Amount': parseFloat(c.claim_amount || 0), 'Penalty': parseFloat(c.penalty_amount || 0),
      'Rework Cost': c.rework_cost != null ? parseFloat(c.rework_cost) : '',
      'Total': parseFloat(c.total_amount || 0), 'Status': STATUS_META[c.status]?.label || c.status,
      'Settlement Mode': c.settlement_mode || '', 'Credit Note': c.credit_note_no || '',
      'Rework Possible': c.rework_possible === true ? 'Yes' : c.rework_possible === false ? 'No' : '',
      'Root Cause': c.root_cause || '', 'Deduction': c.deduction_remarks || '',
      'Raised By': c.raised_by_name || '', 'Date': new Date(c.created_at).toLocaleDateString('en-GB'),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Claims')
    XLSX.writeFile(wb, `claims_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Filters
  const cardFiltered = activeFilter ? claims.filter(c => c.status === activeFilter) : claims
  const setColFilter = (key, vals) => setColFilters(p => ({ ...p, [key]: vals }))
  const display = cardFiltered.filter(c =>
    Object.entries(colFilters).every(([key, vals]) => !vals?.length || vals.includes(String(c[key] ?? '')))
  )

  const totalOpen = claims.filter(c => ['pending_qa', 'pending_buying', 'pending_imports', 'pending_accounts', 'submitted'].includes(c.status))
    .reduce((s, c) => s + parseFloat(c.total_amount || 0), 0)
  const totalSettled = claims.filter(c => ['closed', 'settled'].includes(c.status))
    .reduce((s, c) => s + parseFloat(c.total_amount || 0), 0)

  // Surplus / deficit on refund credit notes (CN amount vs requested = claim + penalty)
  const requestedOf = (c) => parseFloat(c.claim_amount || 0) + parseFloat(c.penalty_amount || 0)
  const varianceOf = (c) => c.credit_note_amount != null ? parseFloat(c.credit_note_amount) - requestedOf(c) : null
  const refundClaims = claims.filter(c => c.settlement_mode === 'refund' && c.credit_note_amount != null)
  const surplusTotal = refundClaims.reduce((s, c) => { const v = varianceOf(c); return s + (v > 0 ? v : 0) }, 0)
  const deficitTotal = refundClaims.reduce((s, c) => { const v = varianceOf(c); return s + (v < 0 ? -v : 0) }, 0)
  const paymentHoldCount = claims.filter(c => c.payment_hold && !['closed', 'settled', 'withdrawn'].includes(c.status)).length

  const STAT_CARDS = [
    { label: 'All Claims', key: null, accent: '#E8470F', value: claims.length },
    { label: 'Pending QA', key: 'pending_qa', accent: '#d97706', value: claims.filter(c => c.status === 'pending_qa').length },
    { label: 'Pending Buying', key: 'pending_buying', accent: '#1d4ed8', value: claims.filter(c => c.status === 'pending_buying').length },
    { label: 'Pending Imports', key: 'pending_imports', accent: '#7e22ce', value: claims.filter(c => c.status === 'pending_imports').length },
    { label: 'Pending Accounts', key: 'pending_accounts', accent: '#0f766e', value: claims.filter(c => c.status === 'pending_accounts').length },
    { label: 'Closed', key: 'closed', accent: '#059669', value: claims.filter(c => ['closed', 'settled'].includes(c.status)).length },
  ]

  const st = detail ? (STATUS_META[detail.status] || { bg: '#f1f5f9', color: '#475569', label: detail.status }) : null

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '28px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: '#0f172a' }}>⚖️ Claims</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
              Defect resolution — Warehouse raises · QA reviews root cause · Buying finalises
            </p>
          </div>
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Open Claim Value</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#c2410c' }}>{fmt(totalOpen)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Settled Value</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#15803d' }}>{fmt(totalSettled)}</div>
            </div>
            {['warehouse', 'admin'].includes(role) && (
              <button onClick={() => setShowCreate(true)}
                style={{ padding: '10px 20px', borderRadius: '8px', background: '#1C1208', color: '#fff', border: 'none', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
                + Raise Claim
              </button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="stat-grid mb-4">
          {STAT_CARDS.map(s => {
            const isActive = activeFilter === s.key
            return (
              <div key={String(s.key)} className="stat-card"
                onClick={() => setActiveFilter(p => p === s.key ? null : s.key)}
                style={{ cursor: 'pointer', borderTop: `3px solid ${s.accent}`, transform: isActive ? 'translateY(-2px)' : undefined, transition: 'transform 0.1s', userSelect: 'none' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {s.label}
                  {isActive && <span style={{ fontSize: '10px', fontWeight: '700', opacity: 0.7 }}>✕ FILTER</span>}
                </div>
                <div className="stat-value" style={{ color: s.accent }}>{s.value}</div>
              </div>
            )
          })}
        </div>

        {/* Refund reconciliation + payment hold summary */}
        {(refundClaims.length > 0 || paymentHoldCount > 0) && (
          <div style={{ display: 'flex', gap: '14px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', background: '#fff', border: '1px solid #bbf7d0', borderTop: '3px solid #16a34a', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Surplus Claim (CN &gt; requested)</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#16a34a', marginTop: '3px' }}>{fmt(surplusTotal)}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{refundClaims.filter(c => varianceOf(c) > 0).length} credit note(s) over-received</div>
            </div>
            <div style={{ flex: '1 1 200px', background: '#fff', border: '1px solid #fecaca', borderTop: '3px solid #dc2626', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Deficit Claim (CN &lt; requested)</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#dc2626', marginTop: '3px' }}>{fmt(deficitTotal)}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{refundClaims.filter(c => varianceOf(c) < 0).length} credit note(s) short</div>
            </div>
            <div style={{ flex: '1 1 200px', background: '#fff', border: '1px solid #fed7aa', borderTop: '3px solid #ea580c', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payments On Hold</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#ea580c', marginTop: '3px' }}>{paymentHoldCount}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>refund claims pending credit note</div>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Defect Claims</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{display.length} claim(s)</span>
              <button onClick={() => downloadExcel(display)} disabled={display.length === 0}
                style={{ padding: '6px 14px', borderRadius: '7px', border: '1.5px solid #059669', background: '#fff', color: '#059669', fontSize: '13px', fontWeight: '600', cursor: display.length === 0 ? 'not-allowed' : 'pointer', opacity: display.length === 0 ? 0.5 : 1 }}>
                ↓ Download Excel
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : display.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
              {claims.length === 0 ? 'No claims raised yet.' : 'No claims match the selected filter.'}
            </div>
          ) : (
            <TableScrollWrap>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Claim Ref</th>
                    <th style={thStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>PO No.
                        <ColumnFilterDropdown colKey="po_no" data={cardFiltered} value={colFilters.po_no || []} onChange={v => setColFilter('po_no', v)} label="PO No." />
                      </span>
                    </th>
                    <th style={thStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Item
                        <ColumnFilterDropdown colKey="item_name" data={cardFiltered} value={colFilters.item_name || []} onChange={v => setColFilter('item_name', v)} label="Item" />
                      </span>
                    </th>
                    <th style={thStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Supplier
                        <ColumnFilterDropdown colKey="supplier_name" data={cardFiltered} value={colFilters.supplier_name || []} onChange={v => setColFilter('supplier_name', v)} label="Supplier" />
                      </span>
                    </th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Defect Qty</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Claim</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Penalty</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    <th style={thStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Status
                        <ColumnFilterDropdown colKey="status" data={cardFiltered} value={colFilters.status || []} onChange={v => setColFilter('status', v)} label="Status" valueLabel={v => STATUS_META[v]?.label || v} />
                      </span>
                    </th>
                    <th style={thStyle}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map(c => {
                    const cst = STATUS_META[c.status] || { bg: '#f1f5f9', color: '#475569', label: c.status }
                    return (
                      <tr key={c.claim_id} onClick={() => openDetail(c)}
                        style={{ cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td style={{ ...tdStyle, fontWeight: '700', color: '#E8470F', whiteSpace: 'nowrap' }}>{c.claim_ref}</td>
                        <td style={{ ...tdStyle, fontWeight: '600' }}>{c.po_no}</td>
                        <td style={tdStyle}>{c.item_name || c.item_code}</td>
                        <td style={tdStyle}>{c.supplier_name || c.supplier_code || '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{c.defect_qty ?? '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(parseFloat(c.claim_amount || 0))}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', color: parseFloat(c.penalty_amount) > 0 ? '#c2410c' : '#94a3b8' }}>
                          {parseFloat(c.penalty_amount) > 0 ? fmt(parseFloat(c.penalty_amount)) : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: '700' }}>{fmt(parseFloat(c.total_amount || 0))}</td>
                        <td style={tdStyle}>
                          <span style={{ background: cst.bg, color: cst.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11.5px', fontWeight: '700', whiteSpace: 'nowrap' }}>{cst.label}</span>
                        </td>
                        <td style={{ ...tdStyle, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScrollWrap>
          )}
        </div>
      </div>

      {/* ── Create modal ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Raise Defect Claim</h2>
            {createError && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>{createError}</div>}
            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>PO Number *</span>
                  <select required value={form.po_no} onChange={e => setForm(f => ({ ...f, po_no: e.target.value, item_code: '' }))} style={inputStyle}>
                    <option value="">Select PO…</option>
                    {poList.map(p => <option key={p.po_no} value={p.po_no}>{p.po_no}{p.supplier_name ? ` — ${p.supplier_name}` : ''}</option>)}
                  </select>
                </label>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Item *</span>
                  <select required value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))} style={inputStyle} disabled={!form.po_no}>
                    <option value="">{form.po_no ? 'Select item…' : 'Select a PO first'}</option>
                    {itemList.map(i => <option key={i.item_code} value={i.item_code}>{i.name || i.item_code}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Country of Origin</span>
                  <input value={form.country_of_origin} onChange={e => setForm(f => ({ ...f, country_of_origin: e.target.value }))} placeholder="Auto from supplier if blank" style={inputStyle} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Trigger Point</span>
                  <select value={form.trigger_point} onChange={e => setForm(f => ({ ...f, trigger_point: e.target.value }))} style={inputStyle}>
                    <option value="">Select…</option>
                    {['Incoming Goods', 'Stores', 'Customer Return', 'Delivery Team', 'Production Line'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>QC Checked Qty</span>
                  <input type="number" min="0" value={form.checked_qty} onChange={e => setForm(f => ({ ...f, checked_qty: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Defect Qty</span>
                  <input type="number" min="0" value={form.defect_qty} onChange={e => setForm(f => ({ ...f, defect_qty: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Claim Amount (USD) *</span>
                  <input type="number" min="0" step="0.01" required value={form.claim_amount} onChange={e => setForm(f => ({ ...f, claim_amount: e.target.value }))} style={inputStyle} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>PO / GRN Date</span>
                  <input type="date" value={form.grn_date} onChange={e => setForm(f => ({ ...f, grn_date: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Issue Trigger Date</span>
                  <input type="date" value={form.trigger_date} onChange={e => setForm(f => ({ ...f, trigger_date: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>QC Done Date</span>
                  <input type="date" value={form.qc_done_date} onChange={e => setForm(f => ({ ...f, qc_done_date: e.target.value }))} style={inputStyle} />
                </label>
              </div>
              <label style={{ display: 'block', marginBottom: '14px' }}>
                <span style={labelStyle}>Defect Description *</span>
                <textarea required rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the defect and impact…" style={{ ...inputStyle, resize: 'vertical' }} />
              </label>

              {/* Defect images */}
              <div style={{ marginBottom: '14px' }}>
                <span style={labelStyle}>Defect Images</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {createFiles.map((f, i) => (
                    <div key={i} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                      <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button type="button" onClick={() => setCreateFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(220,38,38,0.9)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  <label style={{ width: '64px', height: '64px', borderRadius: '8px', border: '1.5px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', fontSize: '22px' }}>
                    +
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                      onChange={e => { setCreateFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
                  </label>
                </div>
              </div>

              {/* Optional Root Cause & CAPA */}
              <div style={{ marginBottom: '18px', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <button type="button" onClick={() => setShowCapa(v => !v)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                  <span>Root Cause &amp; CAPA <span style={{ fontWeight: '400', color: '#94a3b8' }}>(optional — QA can also fill later)</span></span>
                  <span>{showCapa ? '▾' : '▸'}</span>
                </button>
                {showCapa && (
                  <div style={{ padding: '14px' }}>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                      <span style={labelStyle}>Root Cause</span>
                      <textarea rows={2} value={form.root_cause} onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))} placeholder="What caused this defect?" style={{ ...inputStyle, resize: 'vertical' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                      <span style={labelStyle}>Corrective Action</span>
                      <textarea rows={2} value={form.corrective_action} onChange={e => setForm(f => ({ ...f, corrective_action: e.target.value }))} placeholder="Immediate corrective measure…" style={{ ...inputStyle, resize: 'vertical' }} />
                    </label>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                      <span style={labelStyle}>Preventive Action</span>
                      <textarea rows={2} value={form.preventive_action} onChange={e => setForm(f => ({ ...f, preventive_action: e.target.value }))} placeholder="How to prevent recurrence…" style={{ ...inputStyle, resize: 'vertical' }} />
                    </label>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end' }}>
                      <div>
                        <span style={labelStyle}>Rework Possible?</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setForm(f => ({ ...f, rework_possible: f.rework_possible === v ? '' : v }))}
                              style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                                border: form.rework_possible === v ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                                background: form.rework_possible === v ? '#ede9fe' : '#fff', color: form.rework_possible === v ? '#6d28d9' : '#475569' }}>{l}</button>
                          ))}
                        </div>
                      </div>
                      {form.rework_possible === 'yes' && (
                        <label style={{ flex: 1 }}>
                          <span style={labelStyle}>Scope of Rework</span>
                          <input value={form.rework_scope} onChange={e => setForm(f => ({ ...f, rework_scope: e.target.value }))} placeholder="What rework is feasible…" style={inputStyle} />
                        </label>
                      )}
                    </div>
                    {form.rework_possible === 'yes' && (
                      <div style={{ marginTop: '10px' }}>
                        <span style={labelStyle}>Rework Type</span>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                          {[['full', 'Full Rework'], ['partial', 'Rework + Replacement']].map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setForm(f => ({ ...f, rework_type: f.rework_type === v ? '' : v }))}
                              style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer',
                                border: form.rework_type === v ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                                background: form.rework_type === v ? '#ede9fe' : '#fff', color: form.rework_type === v ? '#6d28d9' : '#475569' }}>{l}</button>
                          ))}
                        </div>
                        {form.rework_type === 'partial' && (
                          <label style={{ display: 'block' }}>
                            <span style={{ ...labelStyle, color: '#b45309' }}>Replacement Parts / Cartons Required</span>
                            <textarea rows={2} value={form.replacement_parts} onChange={e => setForm(f => ({ ...f, replacement_parts: e.target.value }))}
                              placeholder="List parts/cartons to be replaced to complete the product…" style={{ ...inputStyle, resize: 'vertical' }} />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowCreate(false); setCreateFiles([]); setShowCapa(false) }}
                  style={{ padding: '9px 18px', borderRadius: '8px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={creating}
                  style={{ padding: '9px 20px', borderRadius: '8px', background: '#1C1208', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.7 : 1 }}>
                  {creating ? 'Raising…' : 'Raise Claim → QA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit modal (role-scoped, rewinds for re-approval) ─────────────── */}
      {showEdit && detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Edit Claim — {detail.claim_ref}</h2>
            <div style={{ fontSize: '12px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px' }}>
              ⚠️ Saving a correction rewinds this claim to <b>{REWIND_LABEL[role] || 'the next stage'}</b> and it must be re-approved forward
              up to whoever currently holds it{detail.status && STATUS_META[detail.status] ? ` (now ${STATUS_META[detail.status].label})` : ''}.
            </div>
            {editConfigFor(role).map(f => (
              <label key={f.key} style={{ display: 'block', marginBottom: '12px' }}>
                <span style={labelStyle}>{f.label}</span>
                {f.type === 'textarea' ? (
                  <textarea rows={2} value={editForm[f.key] ?? ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} />
                ) : f.type === 'select' ? (
                  <select value={editForm[f.key] ?? ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle}>
                    {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input type={f.type} value={editForm[f.key] ?? ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                    min={f.type === 'number' ? '0' : undefined} step={f.type === 'number' ? '0.01' : undefined} style={inputStyle} />
                )}
              </label>
            ))}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" onClick={() => setShowEdit(false)}
                style={{ padding: '9px 18px', borderRadius: '8px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button type="button" disabled={acting} onClick={handleEditSave}
                style={{ padding: '9px 20px', borderRadius: '8px', background: '#1C1208', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: acting ? 'default' : 'pointer', opacity: acting ? 0.7 : 1 }}>
                {acting ? 'Saving…' : 'Save Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail drawer ────────────────────────────────────────────────── */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1500 }} />
      )}
      <div style={{
        position: 'fixed', top: '52px', right: 0, width: '560px', maxWidth: '96vw',
        height: 'calc(100vh - 52px)', background: '#fff', zIndex: 1600,
        display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 30px rgba(0,0,0,0.18)',
        transform: detail ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {detail && (<>
          <div style={{ background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: '800', fontSize: '16px', color: '#fff' }}>⚖️ {detail.claim_ref}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                PO {detail.po_no} · {detail.item_name || detail.item_code} · {detail.supplier_name || '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {detail.status !== 'withdrawn' && editConfigFor(role).length > 0 && (
                <button onClick={openEdit} title="Correct this claim (rewinds for re-approval)"
                  style={{ background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                  ✏️ Edit
                </button>
              )}
              <button onClick={() => handleDownloadPdf(detail)} disabled={generating} title="Download one-pager PDF report"
                style={{ background: '#E8470F', border: 'none', color: '#fff', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                {generating ? '…' : '📄 PDF'}
              </button>
              <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>{st.label}</span>
              <button onClick={() => setDetail(null)}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px' }}>×</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
            {msg && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
                background: msg.startsWith('Failed') ? '#fef2f2' : '#f0fdf4',
                color: msg.startsWith('Failed') ? '#dc2626' : '#15803d' }}>{msg}</div>
            )}

            {/* Amounts */}
            <div style={{ display: 'flex', gap: '18px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'PO Qty', value: detail.po_qty ?? '—' },
                { label: 'Defect Qty', value: detail.defect_qty ?? '—' },
                { label: 'PO Value', value: detail.unit_price != null ? fmt(parseFloat(detail.po_value || 0)) : '—' },
                { label: 'Defect Value', value: detail.unit_price != null ? fmt(parseFloat(detail.defect_value || 0)) : '—', danger: parseFloat(detail.defect_value) > 0 },
                { label: 'Claim Amount', value: fmt(parseFloat(detail.claim_amount || 0)) },
                { label: 'Penalty', value: parseFloat(detail.penalty_amount) > 0 ? fmt(parseFloat(detail.penalty_amount)) : '—', danger: parseFloat(detail.penalty_amount) > 0 },
                { label: 'Total Claim', value: fmt(parseFloat(detail.claim_amount || 0) + parseFloat(detail.penalty_amount || 0)), big: true },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
                  <div style={{ fontSize: f.big ? '20px' : '15px', fontWeight: '800', color: f.danger ? '#c2410c' : f.big ? '#E8470F' : '#1e293b', marginTop: '2px' }}>{f.value}</div>
                </div>
              ))}
            </div>

            {/* Key details & dates */}
            {(() => {
              const d = (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
              const rows = [
                { label: 'Unit Price', value: detail.unit_price != null ? fmt(parseFloat(detail.unit_price)) : '—' },
                { label: 'Checked Qty', value: detail.checked_qty ?? '—' },
                { label: '% Defect', value: detail.checked_qty > 0 ? `${((detail.defect_qty / detail.checked_qty) * 100).toFixed(1)}%` : '—' },
                { label: 'Country of Origin', value: detail.country_of_origin || detail.supplier_country || '—' },
                { label: 'Trigger Point', value: detail.trigger_point || '—' },
                { label: 'PO / Order Date', value: d(detail.po_order_date) },
                { label: 'GRN Date', value: d(detail.grn_date) },
                { label: 'Issue Trigger Date', value: d(detail.trigger_date) },
                { label: 'QC Done Date', value: d(detail.qc_done_date) },
                { label: 'Root Cause Date', value: d(detail.root_cause_date) },
              ]
              return (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '10px' }}>Key Details & Dates</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px 16px' }}>
                    {rows.map(r => (
                      <div key={r.label}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{r.label}</div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginTop: '1px' }}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Workflow trail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              <div style={{ borderLeft: '3px solid #0f766e', background: '#f0fdfa', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f766e' }}>1 · Raised by Warehouse — {detail.raised_by_name || '—'}</div>
                <div style={{ fontSize: '13px', color: '#134e4a', marginTop: '4px' }}>{detail.description}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{detail.raised_at ? new Date(detail.raised_at).toLocaleString() : ''}</div>
              </div>
              {(detail.root_cause || detail.status !== 'pending_qa') && detail.root_cause && (
                <div style={{ borderLeft: '3px solid #7c3aed', background: '#faf5ff', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#7c3aed' }}>2 · QA Root Cause — {detail.qa_reviewed_by_name || '—'}</div>
                  <div style={{ fontSize: '13px', color: '#4c1d95', marginTop: '4px' }}><strong>Root cause:</strong> {detail.root_cause}</div>
                  {detail.corrective_action && <div style={{ fontSize: '13px', color: '#4c1d95', marginTop: '2px' }}><strong>Corrective action:</strong> {detail.corrective_action}</div>}
                  {detail.preventive_action && <div style={{ fontSize: '13px', color: '#4c1d95', marginTop: '2px' }}><strong>Preventive action:</strong> {detail.preventive_action}</div>}
                  {detail.rework_possible === true && (
                    <div style={{ fontSize: '13px', color: '#4c1d95', marginTop: '2px' }}>
                      <strong>Rework:</strong> {detail.rework_type === 'partial' ? 'Rework + Replacement' : detail.rework_type === 'full' ? 'Full' : 'Yes'}{detail.rework_scope ? ` — ${detail.rework_scope}` : ''}
                    </div>
                  )}
                  {detail.replacement_parts && (
                    <div style={{ fontSize: '13px', color: '#7c2d12', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 8px', marginTop: '4px' }}>
                      <strong>Replacement parts/cartons:</strong> {detail.replacement_parts}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{detail.qa_reviewed_at ? new Date(detail.qa_reviewed_at).toLocaleString() : ''}</div>
                </div>
              )}
              {['pending_imports', 'pending_accounts', 'submitted', 'settled', 'closed'].includes(detail.status) && detail.buying_submitted_by_name && (
                <div style={{ borderLeft: '3px solid #0284c7', background: '#f0f9ff', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#075985' }}>3 · Final Claim by Buying — {detail.buying_submitted_by_name || '—'}</div>
                  <div style={{ fontSize: '13px', color: '#0c4a6e', marginTop: '4px' }}>
                    <strong>Settlement:</strong> {detail.settlement_mode ? detail.settlement_mode.charAt(0).toUpperCase() + detail.settlement_mode.slice(1) : '—'}
                    {detail.credit_note_no ? ` · Credit note ${detail.credit_note_no}` : ''}
                  </div>
                  {detail.settlement_mode === 'replacement' && detail.expected_replacement_date && (
                    <div style={{ fontSize: '13px', color: '#0c4a6e', marginTop: '2px' }}>
                      <strong>Expected landing:</strong> {new Date(detail.expected_replacement_date).toLocaleDateString('en-GB')}
                      {detail.replacement_received_date
                        ? <span style={{ color: '#15803d', fontWeight: 700 }}> · ✓ Received {new Date(detail.replacement_received_date).toLocaleDateString('en-GB')}</span>
                        : new Date(detail.expected_replacement_date) < new Date()
                          ? <span style={{ color: '#dc2626', fontWeight: 700 }}> · ⏰ Overdue — reminders active</span>
                          : <span style={{ color: '#64748b' }}> · awaiting landing</span>}
                    </div>
                  )}
                  {detail.settlement_mode === 'refund' && detail.credit_note_amount != null && (() => {
                    const requested = parseFloat(detail.claim_amount || 0) + parseFloat(detail.penalty_amount || 0)
                    const variance = parseFloat(detail.credit_note_amount) - requested
                    return (
                      <div style={{ fontSize: '13px', color: '#0c4a6e', marginTop: '2px' }}>
                        <strong>Credit note amount:</strong> {fmt(parseFloat(detail.credit_note_amount))} vs requested {fmt(requested)}
                        {variance !== 0 && (
                          <span style={{ fontWeight: 800, marginLeft: '6px', color: variance > 0 ? '#16a34a' : '#dc2626' }}>
                            {variance > 0 ? `▲ Surplus ${fmt(variance)}` : `▼ Deficit ${fmt(-variance)}`}
                          </span>
                        )}
                        {variance === 0 && <span style={{ color: '#15803d', fontWeight: 700, marginLeft: '6px' }}>✓ Matches</span>}
                      </div>
                    )
                  })()}
                  {detail.payment_hold && !['closed', 'settled'].includes(detail.status) && (
                    <div style={{ display: 'inline-block', marginTop: '6px', fontSize: '11px', fontWeight: 800, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '9999px', padding: '3px 10px' }}>
                      ⛔ Payment Hold — Imports &amp; Accounts alerted
                    </div>
                  )}
                  {parseFloat(detail.penalty_amount) > 0 && (
                    <div style={{ fontSize: '13px', color: '#0c4a6e', marginTop: '2px' }}>
                      <strong>Penalty:</strong> {fmt(parseFloat(detail.penalty_amount))}{detail.penalty_reason ? ` — ${detail.penalty_reason}` : ''}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{detail.buying_submitted_at ? new Date(detail.buying_submitted_at).toLocaleString() : ''}</div>
                </div>
              )}
              {['pending_accounts', 'closed'].includes(detail.status) && detail.imports_remarks && (
                <div style={{ borderLeft: '3px solid #7e22ce', background: '#faf5ff', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#7e22ce' }}>4 · Imports — {detail.imports_reviewed_by_name || '—'}</div>
                  <div style={{ fontSize: '13px', color: '#581c87', marginTop: '4px' }}><strong>Note for Accounts:</strong> {detail.imports_remarks}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{detail.imports_reviewed_at ? new Date(detail.imports_reviewed_at).toLocaleString() : ''}</div>
                </div>
              )}
              {detail.status === 'closed' && (
                <div style={{ borderLeft: '3px solid #059669', background: '#f0fdf4', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>5 · Closed by Accounts — {detail.accounts_closed_by_name || '—'}</div>
                  {detail.deduction_remarks && <div style={{ fontSize: '13px', color: '#166534', marginTop: '4px' }}><strong>Deduction:</strong> {detail.deduction_remarks}</div>}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{detail.accounts_closed_at ? new Date(detail.accounts_closed_at).toLocaleString() : ''}</div>
                </div>
              )}
              {detail.return_remarks && detail.status !== 'pending_buying' && (
                <div style={{ borderLeft: '3px solid #dc2626', background: '#fef2f2', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b' }}>↩ Returned</div>
                  <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '4px' }}>{detail.return_remarks}</div>
                </div>
              )}
              {/* Legacy settled (pre-Imports/Accounts flow) */}
              {detail.status === 'settled' && (
                <div style={{ borderLeft: '3px solid #059669', background: '#f0fdf4', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>
                    ✓ Settled by {detail.settlement_mode ? detail.settlement_mode.charAt(0).toUpperCase() + detail.settlement_mode.slice(1) : '—'}
                    {detail.settled_at ? ` · ${new Date(detail.settled_at).toLocaleString()}` : ''}
                  </div>
                  {detail.credit_note_no && <div style={{ fontSize: '13px', color: '#166534', marginTop: '4px' }}><strong>Credit Note:</strong> {detail.credit_note_no}</div>}
                </div>
              )}

              {/* Edit / re-approval history */}
              {Array.isArray(detail.edit_log) && detail.edit_log.length > 0 && (
                <div style={{ borderLeft: '3px solid #d97706', background: '#fffbeb', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#b45309', marginBottom: '4px' }}>✏️ Edit &amp; Re-approval History</div>
                  {detail.edit_log.map((e, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#78350f', marginTop: '4px' }}>
                      <strong>{e.by || '—'}</strong> ({e.role}) edited <em>{e.fields}</em>
                      {e.to_status
                        ? <span> — rewound {STATUS_META[e.from_status]?.label || e.from_status} → <b>{STATUS_META[e.to_status]?.label || e.to_status}</b> for re-approval</span>
                        : <span> — no rewind (edited at current stage)</span>}
                      <div style={{ fontSize: '10px', color: '#a16207' }}>{e.at ? new Date(e.at).toLocaleString() : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Attachments: defect images + cost sheet ── */}
            {(() => {
              const editable = !['closed', 'settled', 'withdrawn'].includes(detail.status) && ['warehouse', 'qa', 'buying', 'admin'].includes(role)
              const imgs = attachments.filter(a => a.kind === 'defect_image')
              const sheets = attachments.filter(a => a.kind === 'cost_sheet')
              const creditNotes = attachments.filter(a => a.kind === 'credit_note')
              return (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b' }}>Attachments</div>
                    {editable && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#1d4ed8', cursor: uploading ? 'default' : 'pointer', padding: '5px 10px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                          {uploading ? '…' : '+ Defect Image'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading} onChange={e => handleUpload(e, 'defect_image')} />
                        </label>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#7e22ce', cursor: uploading ? 'default' : 'pointer', padding: '5px 10px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                          + Cost Sheet
                          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={uploading} onChange={e => handleUpload(e, 'cost_sheet')} />
                        </label>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: '#b45309', cursor: uploading ? 'default' : 'pointer', padding: '5px 10px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                          + Credit Note
                          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} disabled={uploading} onChange={e => handleUpload(e, 'credit_note')} />
                        </label>
                      </div>
                    )}
                  </div>
                  {imgs.length === 0 && sheets.length === 0 && creditNotes.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>No attachments yet.</div>
                  ) : (
                    <>
                      {imgs.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: sheets.length ? '10px' : 0 }}>
                          {imgs.map(a => (
                            <div key={a.attachment_id} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                              {attachmentURLs[a.attachment_id]
                                ? <img src={attachmentURLs[a.attachment_id]} alt={a.file_name} onClick={() => window.open(attachmentURLs[a.attachment_id], '_blank')} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#94a3b8' }}>…</div>}
                              {editable && (
                                <button onClick={() => handleDeleteAttachment(a.attachment_id)}
                                  style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(220,38,38,0.9)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}>×</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {sheets.map(a => (
                        <div key={a.attachment_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#faf5ff', borderRadius: '6px', marginBottom: '4px' }}>
                          <button onClick={async () => { try { const r = await getClaimAttachmentFile(detail.claim_id, a.attachment_id); window.open(URL.createObjectURL(r.data), '_blank') } catch {} }}
                            style={{ background: 'none', border: 'none', color: '#7e22ce', fontSize: '12px', fontWeight: '700', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            📄 {a.file_name}
                          </button>
                          {editable && <button onClick={() => handleDeleteAttachment(a.attachment_id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>×</button>}
                        </div>
                      ))}
                      {creditNotes.map(a => (
                        <div key={a.attachment_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fff7ed', borderRadius: '6px', marginBottom: '4px' }}>
                          <button onClick={async () => { try { const r = await getClaimAttachmentFile(detail.claim_id, a.attachment_id); window.open(URL.createObjectURL(r.data), '_blank') } catch {} }}
                            style={{ background: 'none', border: 'none', color: '#b45309', fontSize: '12px', fontWeight: '700', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            🧾 {a.file_name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Credit Note)</span>
                          </button>
                          {editable && <button onClick={() => handleDeleteAttachment(a.attachment_id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>×</button>}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )
            })()}

            {/* ── Stage actions ── */}
            {/* QA action */}
            {detail.status === 'pending_qa' && ['qa', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #ddd6fe', background: '#faf5ff', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#7c3aed', marginBottom: '10px' }}>QA Review — Root Cause Analysis</div>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                  <span style={labelStyle}>Root Cause *</span>
                  <textarea rows={3} value={rootCause} onChange={e => setRootCause(e.target.value)} placeholder="What caused this defect?" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                  <span style={labelStyle}>Corrective Action</span>
                  <textarea rows={2} value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} placeholder="Immediate corrective measure…" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                  <span style={labelStyle}>Preventive Action</span>
                  <textarea rows={2} value={preventiveAction} onChange={e => setPreventiveAction(e.target.value)} placeholder="How to prevent recurrence…" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <div style={{ marginBottom: '10px' }}>
                  <span style={labelStyle}>Rework Possible?</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setReworkPossible(v)}
                        style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                          border: reworkPossible === v ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                          background: reworkPossible === v ? '#ede9fe' : '#fff', color: reworkPossible === v ? '#6d28d9' : '#475569' }}>{l}</button>
                    ))}
                  </div>
                </div>
                {reworkPossible === 'yes' && (
                  <>
                    <div style={{ marginBottom: '10px' }}>
                      <span style={labelStyle}>Rework Type *</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {[['full', 'Full Rework'], ['partial', 'Rework + Replacement']].map(([v, l]) => (
                          <button key={v} type="button" onClick={() => setReworkType(v)}
                            style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer',
                              border: reworkType === v ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                              background: reworkType === v ? '#ede9fe' : '#fff', color: reworkType === v ? '#6d28d9' : '#475569' }}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <label style={{ display: 'block', marginBottom: '10px' }}>
                      <span style={labelStyle}>Scope of Rework</span>
                      <textarea rows={2} value={reworkScope} onChange={e => setReworkScope(e.target.value)} placeholder="What rework is feasible…" style={{ ...inputStyle, resize: 'vertical' }} />
                    </label>
                    {reworkType === 'partial' && (
                      <label style={{ display: 'block', marginBottom: '12px' }}>
                        <span style={{ ...labelStyle, color: '#b45309' }}>Replacement Parts / Cartons Required *</span>
                        <textarea rows={2} value={replacementParts} onChange={e => setReplacementParts(e.target.value)}
                          placeholder="List the specific parts/cartons to be replaced to complete the product (e.g. 2× glass tops, 1× hardware carton)…"
                          style={{ ...inputStyle, resize: 'vertical', border: !replacementParts.trim() ? '1.5px solid #f59e0b' : '1px solid #e2e8f0' }} />
                      </label>
                    )}
                  </>
                )}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button disabled={acting} onClick={() => {
                    if (reworkPossible === 'yes' && !reworkType) { setMsg('Failed: select the rework type (full or partial)'); return }
                    if (reworkType === 'partial' && !replacementParts.trim()) { setMsg('Failed: list the replacement parts/cartons for a partial rework'); return }
                    run(() => qaSubmitClaim(detail.claim_id, { root_cause: rootCause, corrective_action: correctiveAction, preventive_action: preventiveAction, rework_possible: reworkPossible === 'yes' ? true : reworkPossible === 'no' ? false : undefined, rework_scope: reworkScope, rework_type: reworkType, replacement_parts: replacementParts }), 'Submitted to Buying. They have been notified.')
                  }}
                    style={{ padding: '9px 18px', borderRadius: '8px', background: '#7c3aed', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: acting ? 0.7 : 1 }}>
                    {acting ? 'Processing…' : 'Submit to Buying →'}
                  </button>
                  <button disabled={acting} onClick={() => {
                    if (!returnRemarks.trim()) { setMsg('Failed: remarks are required to return a claim'); return }
                    run(() => returnClaim(detail.claim_id, returnRemarks), 'Returned to warehouse.')
                  }}
                    style={{ padding: '9px 18px', borderRadius: '8px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                    ↩ Return to Warehouse
                  </button>
                </div>
                <input value={returnRemarks} onChange={e => setReturnRemarks(e.target.value)} placeholder="Return remarks (required to return)…"
                  style={{ ...inputStyle, marginTop: '10px' }} />
              </div>
            )}

            {/* Buying action — penalty + settlement mode + final submission */}
            {detail.status === 'pending_buying' && ['buying', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #bae6fd', background: '#f0f9ff', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#075985', marginBottom: '10px' }}>Buying — Penalties, Settlement & Final Submission</div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                  <label style={{ flex: 1 }}>
                    <span style={labelStyle}>Additional Penalty (USD)</span>
                    <input type="number" min="0" step="0.01" value={penaltyAmount} onChange={e => setPenaltyAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
                  </label>
                  <div style={{ flex: 1, alignSelf: 'flex-end' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', paddingBottom: '9px' }}>
                      Final total: <strong style={{ color: '#E8470F' }}>{fmt(parseFloat(detail.claim_amount || 0) + (parseFloat(penaltyAmount) || 0))}</strong>
                    </div>
                  </div>
                </div>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <span style={labelStyle}>Penalty Reason {parseFloat(penaltyAmount) > 0 ? '*' : '(if any)'}</span>
                  <textarea rows={2} value={penaltyReason} onChange={e => setPenaltyReason(e.target.value)} placeholder="Why is the penalty applied?" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <span style={labelStyle}>Settlement Mode *</span>
                {detail.rework_possible === false && (
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>QA marked this claim not reworkable — settle by replacement or refund.</div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {[
                    { value: 'replacement', label: '🔄 Replacement', hint: 'Supplier replaces defective units' },
                    { value: 'rework',      label: '🔧 Rework',      hint: 'Repaired locally, cost charged back' },
                    { value: 'refund',      label: '💵 Refund',      hint: 'Supplier refunds the claim value' },
                  ].filter(m => !(m.value === 'rework' && detail.rework_possible === false)).map(m => (
                    <button key={m.value} type="button" title={m.hint} onClick={() => setSettleMode(m.value)}
                      style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                        border: settleMode === m.value ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        background: settleMode === m.value ? '#e0f2fe' : '#fff',
                        color: settleMode === m.value ? '#075985' : '#475569' }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {['rework', 'refund'].includes(settleMode) && (
                  <label style={{ display: 'block', marginBottom: '12px' }}>
                    <span style={{ ...labelStyle, color: '#b45309' }}>Credit Note No. * (required for {settleMode})</span>
                    <input value={creditNoteNo} onChange={e => setCreditNoteNo(e.target.value)} placeholder="e.g. CN-2026-0145"
                      style={{ ...inputStyle, border: !creditNoteNo.trim() ? '1.5px solid #f59e0b' : '1px solid #e2e8f0' }} />
                  </label>
                )}

                {/* Replacement — expected landing date */}
                {settleMode === 'replacement' && (
                  <label style={{ display: 'block', marginBottom: '12px' }}>
                    <span style={{ ...labelStyle, color: '#0369a1' }}>Expected Replacement Landing Date (warehouse) *</span>
                    <input type="date" value={expectedRepDate} onChange={e => setExpectedRepDate(e.target.value)}
                      style={{ ...inputStyle, border: !expectedRepDate ? '1.5px solid #f59e0b' : '1px solid #e2e8f0' }} />
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                      An auto-reminder starts after this date until the buyer revises it or marks the replacement received.
                    </span>
                  </label>
                )}

                {/* Refund — credit note amount + variance preview */}
                {settleMode === 'refund' && (() => {
                  const requested = parseFloat(detail.claim_amount || 0) + (parseFloat(penaltyAmount) || 0)
                  const cn = creditNoteAmount === '' ? null : parseFloat(creditNoteAmount)
                  const variance = cn != null ? cn - requested : null
                  const hasCN = attachments.some(a => a.kind === 'credit_note')
                  return (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', marginBottom: '8px' }}>
                        <span style={{ ...labelStyle, color: '#b45309' }}>Credit Note Amount Received (USD) *</span>
                        <input type="number" min="0" step="0.01" value={creditNoteAmount} onChange={e => setCreditNoteAmount(e.target.value)} placeholder="0.00"
                          style={{ ...inputStyle, border: cn == null ? '1.5px solid #f59e0b' : '1px solid #e2e8f0' }} />
                      </label>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px' }}>
                        Requested (claim + penalty): <strong>{fmt(requested)}</strong>
                        {variance != null && variance !== 0 && (
                          <span style={{ marginLeft: '10px', fontWeight: '800', color: variance > 0 ? '#16a34a' : '#dc2626' }}>
                            {variance > 0 ? `▲ Surplus ${fmt(variance)}` : `▼ Deficit ${fmt(-variance)}`}
                          </span>
                        )}
                        {variance === 0 && <span style={{ marginLeft: '10px', fontWeight: '700', color: '#15803d' }}>✓ Matches requested</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: hasCN ? '#15803d' : '#b45309', fontWeight: '700' }}>
                        {hasCN ? '✓ Credit note attached.' : '⚠️ Attach the Credit Note file (+ Credit Note) in Attachments above — mandatory for refund.'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#c2410c', marginTop: '6px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 10px' }}>
                        ⛔ On submit, Imports &amp; Accounts are alerted to hold immediate, ongoing and future payments until the credit note is settled.
                      </div>
                    </div>
                  )
                })()}
                {detail.rework_possible !== false && (() => {
                  const reworkable = detail.rework_possible === true
                  const hasCostSheet = attachments.some(a => a.kind === 'cost_sheet')
                  return (<>
                    {reworkable && (
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
                        ⚠️ Marked <b>{detail.rework_type === 'partial' ? 'Rework + Replacement' : 'Reworkable'}</b> — Rework Cost and a Cost Sheet upload are required.
                        {detail.rework_type === 'partial' && detail.replacement_parts && (
                          <div style={{ fontWeight: '400', color: '#7c2d12', marginTop: '4px' }}>Replacement parts/cartons: {detail.replacement_parts}</div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                      <label style={{ flex: 1 }}>
                        <span style={labelStyle}>Rework Cost (USD){reworkable ? ' *' : ''}</span>
                        <input type="number" min="0" step="0.01" value={reworkCost} onChange={e => setReworkCost(e.target.value)} placeholder="0.00"
                          style={{ ...inputStyle, border: reworkable && !(parseFloat(reworkCost) > 0) ? '1.5px solid #f59e0b' : '1px solid #e2e8f0' }} />
                      </label>
                      <label style={{ flex: 2 }}>
                        <span style={labelStyle}>Cost Sheet Note</span>
                        <input value={costSheetNote} onChange={e => setCostSheetNote(e.target.value)} placeholder="Cost breakdown summary / reference…" style={inputStyle} />
                      </label>
                    </div>
                    <div style={{ fontSize: '12px', color: reworkable && !hasCostSheet ? '#b45309' : '#64748b', marginBottom: '12px' }}>
                      {reworkable && !hasCostSheet
                        ? '⚠️ Upload the cost sheet file from the Attachments section above (+ Cost Sheet).'
                        : 'Attach a detailed cost sheet file from the Attachments section above.'}
                      {hasCostSheet && <span style={{ color: '#15803d', fontWeight: '700' }}> ✓ Cost sheet attached.</span>}
                    </div>
                  </>)
                })()}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button disabled={acting || !settleMode} onClick={() => {
                    if (!settleMode) { setMsg('Failed: choose a settlement mode'); return }
                    if (['rework', 'refund'].includes(settleMode) && !creditNoteNo.trim()) { setMsg(`Failed: a credit note number is required for ${settleMode}`); return }
                    if (settleMode === 'replacement' && !expectedRepDate) { setMsg('Failed: an expected replacement landing date is required'); return }
                    if (settleMode === 'refund') {
                      if (creditNoteAmount === '' || !(parseFloat(creditNoteAmount) >= 0)) { setMsg('Failed: enter the credit note amount received for a refund'); return }
                      if (!attachments.some(a => a.kind === 'credit_note')) { setMsg('Failed: attach the Credit Note file (Attachments) for a refund'); return }
                    }
                    if (detail.rework_possible === true) {
                      if (!(parseFloat(reworkCost) > 0)) { setMsg('Failed: Rework cost is required (greater than 0) for a reworkable claim'); return }
                      if (!attachments.some(a => a.kind === 'cost_sheet')) { setMsg('Failed: upload a cost sheet (Attachments) for a reworkable claim'); return }
                    }
                    run(() => buyingSubmitClaim(detail.claim_id, { penalty_amount: penaltyAmount, penalty_reason: penaltyReason, mode: settleMode, credit_note_no: creditNoteNo, settlement_remarks: settleRemarks, rework_cost: reworkCost, cost_sheet_note: costSheetNote, expected_replacement_date: expectedRepDate || null, credit_note_amount: settleMode === 'refund' ? creditNoteAmount : null }), 'Final claim submitted to Imports. Supplier, QA and warehouse notified.')
                  }}
                    style={{ padding: '9px 18px', borderRadius: '8px', background: settleMode ? '#0284c7' : '#94a3b8', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: settleMode ? 'pointer' : 'not-allowed', opacity: acting ? 0.7 : 1 }}>
                    {acting ? 'Processing…' : '📤 Submit Final Claim → Imports'}
                  </button>
                  <button disabled={acting} onClick={() => {
                    if (!returnRemarks.trim()) { setMsg('Failed: remarks are required to return a claim'); return }
                    run(() => returnClaim(detail.claim_id, returnRemarks), 'Returned to QA.')
                  }}
                    style={{ padding: '9px 18px', borderRadius: '8px', background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                    ↩ Return to QA
                  </button>
                </div>
                <input value={returnRemarks} onChange={e => setReturnRemarks(e.target.value)} placeholder="Return remarks (required to return)…"
                  style={{ ...inputStyle, marginTop: '10px' }} />
              </div>
            )}

            {/* Replacement tracking — buyer revises landing date / marks received */}
            {detail.settlement_mode === 'replacement' && !detail.replacement_received_date && !['withdrawn'].includes(detail.status) && ['buying', 'warehouse', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #bae6fd', background: '#f0f9ff', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#075985', marginBottom: '4px' }}>🔄 Replacement Tracking</div>
                <div style={{ fontSize: '12px', color: '#0c4a6e', marginBottom: '10px' }}>
                  Expected landing: <strong>{detail.expected_replacement_date ? new Date(detail.expected_replacement_date).toLocaleDateString('en-GB') : '—'}</strong>
                  {detail.expected_replacement_date && new Date(detail.expected_replacement_date) < new Date() && (
                    <span style={{ color: '#dc2626', fontWeight: 700 }}> · ⏰ Overdue — auto-reminders active</span>
                  )}
                </div>
                {['buying', 'admin'].includes(role) && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <label style={{ flex: '1 1 160px' }}>
                      <span style={labelStyle}>Revise Expected Date</span>
                      <input type="date" value={reviseDate} onChange={e => setReviseDate(e.target.value)} style={inputStyle} />
                    </label>
                    <button disabled={acting} onClick={() => {
                      if (!reviseDate) { setMsg('Failed: pick a new date'); return }
                      run(() => reviseReplacementDate(detail.claim_id, reviseDate), 'Landing date revised. Reminders reset.')
                    }}
                      style={{ padding: '9px 16px', borderRadius: '8px', background: '#0284c7', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: acting ? 0.7 : 1 }}>
                      Revise Date
                    </button>
                  </div>
                )}
                <button disabled={acting} onClick={() => {
                  if (window.confirm('Mark the replacement as received in the warehouse? This stops the reminders.'))
                    run(() => markReplacementReceived(detail.claim_id), 'Replacement marked received. Reminders stopped.')
                }}
                  style={{ padding: '9px 18px', borderRadius: '8px', background: '#059669', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: acting ? 0.7 : 1 }}>
                  ✓ Mark Replacement Received
                </button>
              </div>
            )}

            {/* Imports action — mandatory remarks for Accounts */}
            {detail.status === 'pending_imports' && ['imports', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #e9d5ff', background: '#faf5ff', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#7e22ce', marginBottom: '10px' }}>Imports — Note for Accounts</div>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <span style={labelStyle}>Remarks for Accounts *</span>
                  <textarea rows={3} value={importsRemarks} onChange={e => setImportsRemarks(e.target.value)} placeholder="Duty / logistics / documentation notes for Accounts…" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <button disabled={acting} onClick={() => {
                  if (!importsRemarks.trim()) { setMsg('Failed: remarks for Accounts are required'); return }
                  run(() => importsReviewClaim(detail.claim_id, importsRemarks), 'Forwarded to Accounts. They have been notified.')
                }}
                  style={{ padding: '9px 18px', borderRadius: '8px', background: '#7e22ce', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: acting ? 0.7 : 1 }}>
                  {acting ? 'Processing…' : 'Forward to Accounts →'}
                </button>
              </div>
            )}

            {/* Accounts action — mandatory deduction remark, closes the claim */}
            {detail.status === 'pending_accounts' && ['accounts', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #99f6e4', background: '#f0fdfa', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f766e', marginBottom: '10px' }}>Accounts — Deduction & Close</div>
                {detail.imports_remarks && (
                  <div style={{ fontSize: '12px', color: '#581c87', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                    <strong>Imports note:</strong> {detail.imports_remarks}
                  </div>
                )}
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <span style={labelStyle}>Deduction Done — Remark *</span>
                  <textarea rows={3} value={deductionRemarks} onChange={e => setDeductionRemarks(e.target.value)} placeholder="e.g. Deducted $X against invoice INV-… via credit note CN-…" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <button disabled={acting} onClick={() => {
                  if (!deductionRemarks.trim()) { setMsg('Failed: a deduction remark is required to close the claim'); return }
                  if (window.confirm('Record the deduction and close this claim?'))
                    run(() => accountsCloseClaim(detail.claim_id, deductionRemarks), 'Deduction recorded. Claim closed.')
                }}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#059669', color: '#fff', border: 'none', fontWeight: '700', fontSize: '14px', cursor: 'pointer', opacity: acting ? 0.7 : 1 }}>
                  {acting ? 'Processing…' : '✓ Record Deduction & Close'}
                </button>
              </div>
            )}

            {/* Withdraw */}
            {detail.status === 'pending_qa' && ['warehouse', 'admin'].includes(role) && (
              <button disabled={acting} onClick={() => { if (window.confirm('Withdraw this claim?')) run(() => withdrawClaim(detail.claim_id), 'Claim withdrawn.') }}
                style={{ padding: '9px 18px', borderRadius: '8px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: '600', fontSize: '13px', cursor: 'pointer', marginBottom: '14px' }}>
                Withdraw Claim
              </button>
            )}

            {/* Waiting notices */}
            {detail.status === 'pending_qa' && role === 'warehouse' && (
              <div style={{ fontSize: '13px', color: '#78350f', background: '#fffbeb', borderRadius: '8px', padding: '10px 14px' }}>⏳ Awaiting QA root-cause review.</div>
            )}
            {detail.status === 'pending_buying' && ['warehouse', 'qa'].includes(role) && (
              <div style={{ fontSize: '13px', color: '#0c4a6e', background: '#f0f9ff', borderRadius: '8px', padding: '10px 14px' }}>⏳ With Buying for penalties, settlement and final submission.</div>
            )}
            {detail.status === 'pending_imports' && !['imports', 'admin'].includes(role) && (
              <div style={{ fontSize: '13px', color: '#581c87', background: '#faf5ff', borderRadius: '8px', padding: '10px 14px' }}>⏳ With Imports for processing.</div>
            )}
            {detail.status === 'pending_accounts' && !['accounts', 'admin'].includes(role) && (
              <div style={{ fontSize: '13px', color: '#0f766e', background: '#f0fdfa', borderRadius: '8px', padding: '10px 14px' }}>⏳ With Accounts for deduction and closure.</div>
            )}
            {detail.status === 'closed' && (
              <div style={{ fontSize: '13px', color: '#15803d', background: '#f0fdf4', borderRadius: '8px', padding: '10px 14px' }}>✓ Claim closed.</div>
            )}
          </div>
        </>)}
      </div>
    </div>
  )
}
