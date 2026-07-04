import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { TableScrollWrap } from '../components/TableScrollWrap.jsx'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import {
  listClaims, createClaim, qaSubmitClaim, returnClaim,
  buyingSubmitClaim, settleClaim, withdrawClaim,
} from '../api/claims.js'
import client from '../api/client.js'
import * as XLSX from 'xlsx'

const STATUS_META = {
  pending_qa:     { bg: '#fef3c7', color: '#92400e', label: 'Pending QA Review' },
  pending_buying: { bg: '#eff6ff', color: '#1d4ed8', label: 'Pending Buying' },
  submitted:      { bg: '#faf5ff', color: '#7e22ce', label: 'Submitted to Supplier' },
  settled:        { bg: '#f0fdf4', color: '#15803d', label: 'Settled' },
  withdrawn:      { bg: '#f1f5f9', color: '#64748b', label: 'Withdrawn' },
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

export default function ClaimsPage() {
  const { user } = useAuth()
  const { formatAmount } = useCurrency()
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
  const [form, setForm] = useState({ po_no: '', item_code: '', defect_qty: '', claim_amount: '', description: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Action state (drawer)
  const [rootCause, setRootCause] = useState('')
  const [correctiveAction, setCorrectiveAction] = useState('')
  const [penaltyAmount, setPenaltyAmount] = useState('')
  const [penaltyReason, setPenaltyReason] = useState('')
  const [returnRemarks, setReturnRemarks] = useState('')
  const [acting, setActing] = useState(false)

  // Settlement state
  const [settleMode, setSettleMode] = useState('')
  const [creditNoteNo, setCreditNoteNo] = useState('')
  const [settleRemarks, setSettleRemarks] = useState('')

  const fetchClaims = () => {
    setLoading(true)
    listClaims().then(r => setClaims(r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }

  // Prefill from ?raise=1&po=…&item=…&wh=…&qty=…&amt=… (Raise Claim shortcut on inspections)
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('raise') === '1' && ['warehouse', 'admin'].includes(role)) {
      setForm({
        po_no: searchParams.get('po') || '',
        item_code: searchParams.get('item') || '',
        defect_qty: searchParams.get('qty') || '',
        claim_amount: searchParams.get('amt') || '',
        description: '',
        wh_inspection_id: searchParams.get('wh') || null,
      })
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
    setSettleMode('')
    setCreditNoteNo('')
    setSettleRemarks('')
    setMsg('')
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

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true); setCreateError('')
    try {
      await createClaim({
        po_no: form.po_no, item_code: form.item_code,
        wh_inspection_id: form.wh_inspection_id || null,
        defect_qty: form.defect_qty ? parseInt(form.defect_qty, 10) : null,
        claim_amount: form.claim_amount || 0,
        description: form.description,
      })
      setShowCreate(false)
      setForm({ po_no: '', item_code: '', defect_qty: '', claim_amount: '', description: '' })
      fetchClaims()
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create claim')
    } finally { setCreating(false) }
  }

  function downloadExcel(rows) {
    const data = rows.map(c => ({
      'Claim Ref': c.claim_ref, 'PO No.': c.po_no, 'Item': c.item_name || c.item_code,
      'Supplier': c.supplier_name || c.supplier_code || '', 'Defect Qty': c.defect_qty ?? '',
      'Claim Amount': parseFloat(c.claim_amount || 0), 'Penalty': parseFloat(c.penalty_amount || 0),
      'Total': parseFloat(c.total_amount || 0), 'Status': STATUS_META[c.status]?.label || c.status,
      'Settlement Mode': c.settlement_mode || '', 'Credit Note': c.credit_note_no || '',
      'Root Cause': c.root_cause || '', 'Raised By': c.raised_by_name || '',
      'Date': new Date(c.created_at).toLocaleDateString('en-GB'),
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

  const totalOpen = claims.filter(c => ['pending_qa', 'pending_buying', 'submitted'].includes(c.status))
    .reduce((s, c) => s + parseFloat(c.total_amount || 0), 0)
  const totalSettled = claims.filter(c => c.status === 'settled')
    .reduce((s, c) => s + parseFloat(c.total_amount || 0), 0)

  const STAT_CARDS = [
    { label: 'All Claims', key: null, accent: '#E8470F', value: claims.length },
    { label: 'Pending QA', key: 'pending_qa', accent: '#d97706', value: claims.filter(c => c.status === 'pending_qa').length },
    { label: 'Pending Buying', key: 'pending_buying', accent: '#1d4ed8', value: claims.filter(c => c.status === 'pending_buying').length },
    { label: 'Submitted', key: 'submitted', accent: '#7e22ce', value: claims.filter(c => c.status === 'submitted').length },
    { label: 'Settled', key: 'settled', accent: '#059669', value: claims.filter(c => c.status === 'settled').length },
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
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#c2410c' }}>{formatAmount(totalOpen)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>Settled Value</div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#15803d' }}>{formatAmount(totalSettled)}</div>
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
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatAmount(parseFloat(c.claim_amount || 0))}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', color: parseFloat(c.penalty_amount) > 0 ? '#c2410c' : '#94a3b8' }}>
                          {parseFloat(c.penalty_amount) > 0 ? formatAmount(parseFloat(c.penalty_amount)) : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: '700' }}>{formatAmount(parseFloat(c.total_amount || 0))}</td>
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
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>Raise Defect Claim</h2>
            {createError && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '14px' }}>{createError}</div>}
            <form onSubmit={handleCreate}>
              <label style={{ display: 'block', marginBottom: '14px' }}>
                <span style={labelStyle}>PO Number *</span>
                <select required value={form.po_no} onChange={e => setForm(f => ({ ...f, po_no: e.target.value, item_code: '' }))} style={inputStyle}>
                  <option value="">Select PO…</option>
                  {poList.map(p => <option key={p.po_no} value={p.po_no}>{p.po_no}{p.supplier_name ? ` — ${p.supplier_name}` : ''}</option>)}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: '14px' }}>
                <span style={labelStyle}>Item *</span>
                <select required value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))} style={inputStyle} disabled={!form.po_no}>
                  <option value="">{form.po_no ? 'Select item…' : 'Select a PO first'}</option>
                  {itemList.map(i => <option key={i.item_code} value={i.item_code}>{i.name || i.item_code}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Defect Qty</span>
                  <input type="number" min="0" value={form.defect_qty} onChange={e => setForm(f => ({ ...f, defect_qty: e.target.value }))} style={inputStyle} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={labelStyle}>Claim Amount (USD) *</span>
                  <input type="number" min="0" step="0.01" required value={form.claim_amount} onChange={e => setForm(f => ({ ...f, claim_amount: e.target.value }))} style={inputStyle} />
                </label>
              </div>
              <label style={{ display: 'block', marginBottom: '20px' }}>
                <span style={labelStyle}>Defect Description *</span>
                <textarea required rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the defect and impact…" style={{ ...inputStyle, resize: 'vertical' }} />
              </label>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)}
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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
            <div style={{ display: 'flex', gap: '18px', marginBottom: '18px', flexWrap: 'wrap' }}>
              {[
                { label: 'Defect Qty', value: detail.defect_qty ?? '—' },
                { label: 'Claim Amount', value: formatAmount(parseFloat(detail.claim_amount || 0)) },
                { label: 'Penalty', value: parseFloat(detail.penalty_amount) > 0 ? formatAmount(parseFloat(detail.penalty_amount)) : '—', danger: parseFloat(detail.penalty_amount) > 0 },
                { label: 'Total Claim', value: formatAmount(parseFloat(detail.claim_amount || 0) + parseFloat(detail.penalty_amount || 0)), big: true },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
                  <div style={{ fontSize: f.big ? '20px' : '15px', fontWeight: '800', color: f.danger ? '#c2410c' : f.big ? '#E8470F' : '#1e293b', marginTop: '2px' }}>{f.value}</div>
                </div>
              ))}
            </div>

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
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{detail.qa_reviewed_at ? new Date(detail.qa_reviewed_at).toLocaleString() : ''}</div>
                </div>
              )}
              {['submitted', 'settled'].includes(detail.status) && (
                <div style={{ borderLeft: '3px solid #0284c7', background: '#f0f9ff', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#075985' }}>3 · Final Claim by Buying — {detail.buying_submitted_by_name || '—'}</div>
                  {parseFloat(detail.penalty_amount) > 0 && (
                    <div style={{ fontSize: '13px', color: '#0c4a6e', marginTop: '4px' }}>
                      <strong>Penalty:</strong> {formatAmount(parseFloat(detail.penalty_amount))}{detail.penalty_reason ? ` — ${detail.penalty_reason}` : ''}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{detail.buying_submitted_at ? new Date(detail.buying_submitted_at).toLocaleString() : ''}</div>
                </div>
              )}
              {detail.return_remarks && detail.status !== 'pending_buying' && (
                <div style={{ borderLeft: '3px solid #dc2626', background: '#fef2f2', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#991b1b' }}>↩ Returned</div>
                  <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '4px' }}>{detail.return_remarks}</div>
                </div>
              )}
              {detail.status === 'settled' && (
                <div style={{ borderLeft: '3px solid #059669', background: '#f0fdf4', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: '700', color: '#15803d' }}>
                    ✓ Settled by {detail.settlement_mode ? detail.settlement_mode.charAt(0).toUpperCase() + detail.settlement_mode.slice(1) : '—'}
                    {detail.settled_at ? ` · ${new Date(detail.settled_at).toLocaleString()}` : ''}
                  </div>
                  {detail.credit_note_no && (
                    <div style={{ fontSize: '13px', color: '#166534', marginTop: '4px' }}><strong>Credit Note:</strong> {detail.credit_note_no}</div>
                  )}
                  {detail.settlement_remarks && (
                    <div style={{ fontSize: '13px', color: '#166534', marginTop: '2px' }}>{detail.settlement_remarks}</div>
                  )}
                </div>
              )}
            </div>

            {/* ── Stage actions ── */}
            {/* QA action */}
            {detail.status === 'pending_qa' && ['qa', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #ddd6fe', background: '#faf5ff', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#7c3aed', marginBottom: '10px' }}>QA Review — Root Cause Analysis</div>
                <label style={{ display: 'block', marginBottom: '10px' }}>
                  <span style={labelStyle}>Root Cause *</span>
                  <textarea rows={3} value={rootCause} onChange={e => setRootCause(e.target.value)} placeholder="What caused this defect?" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <span style={labelStyle}>Corrective Action (optional)</span>
                  <textarea rows={2} value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} placeholder="Preventive / corrective measure…" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button disabled={acting} onClick={() => run(() => qaSubmitClaim(detail.claim_id, { root_cause: rootCause, corrective_action: correctiveAction }), 'Submitted to Buying. They have been notified.')}
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

            {/* Buying action */}
            {detail.status === 'pending_buying' && ['buying', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #bae6fd', background: '#f0f9ff', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#075985', marginBottom: '10px' }}>Buying — Penalties & Final Submission</div>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                  <label style={{ flex: 1 }}>
                    <span style={labelStyle}>Additional Penalty (USD)</span>
                    <input type="number" min="0" step="0.01" value={penaltyAmount} onChange={e => setPenaltyAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
                  </label>
                  <div style={{ flex: 1, alignSelf: 'flex-end' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', paddingBottom: '9px' }}>
                      Final total: <strong style={{ color: '#E8470F' }}>{formatAmount(parseFloat(detail.claim_amount || 0) + (parseFloat(penaltyAmount) || 0))}</strong>
                    </div>
                  </div>
                </div>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <span style={labelStyle}>Penalty Reason {parseFloat(penaltyAmount) > 0 ? '*' : '(if any)'}</span>
                  <textarea rows={2} value={penaltyReason} onChange={e => setPenaltyReason(e.target.value)} placeholder="Why is the penalty applied?" style={{ ...inputStyle, resize: 'vertical' }} />
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button disabled={acting} onClick={() => run(() => buyingSubmitClaim(detail.claim_id, { penalty_amount: penaltyAmount, penalty_reason: penaltyReason }), 'Final claim submitted. Supplier, QA and warehouse notified.')}
                    style={{ padding: '9px 18px', borderRadius: '8px', background: '#0284c7', color: '#fff', border: 'none', fontWeight: '700', fontSize: '13px', cursor: 'pointer', opacity: acting ? 0.7 : 1 }}>
                    {acting ? 'Processing…' : '📤 Submit Final Claim'}
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

            {/* Settle */}
            {detail.status === 'submitted' && ['buying', 'admin'].includes(role) && (
              <div style={{ border: '1px solid #a7f3d0', background: '#f0fdf4', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#15803d', marginBottom: '10px' }}>Settle Claim</div>
                <span style={labelStyle}>Settlement Mode *</span>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {[
                    { value: 'replacement', label: '🔄 Replacement', hint: 'Supplier replaces defective units' },
                    { value: 'rework',      label: '🔧 Rework',      hint: 'Repaired locally, cost charged back' },
                    { value: 'refund',      label: '💵 Refund',      hint: 'Supplier refunds the claim value' },
                  ].map(m => (
                    <button key={m.value} type="button" title={m.hint} onClick={() => setSettleMode(m.value)}
                      style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                        border: settleMode === m.value ? '2px solid #059669' : '1px solid #e2e8f0',
                        background: settleMode === m.value ? '#dcfce7' : '#fff',
                        color: settleMode === m.value ? '#166534' : '#475569' }}>
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
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <span style={labelStyle}>Settlement Remarks (optional)</span>
                  <input value={settleRemarks} onChange={e => setSettleRemarks(e.target.value)} placeholder="Any notes on the settlement…" style={inputStyle} />
                </label>
                <button disabled={acting || !settleMode} onClick={() => {
                  if (['rework', 'refund'].includes(settleMode) && !creditNoteNo.trim()) {
                    setMsg(`Failed: a credit note number is required to settle by ${settleMode}`)
                    return
                  }
                  if (window.confirm(`Settle this claim by ${settleMode}?`))
                    run(() => settleClaim(detail.claim_id, { mode: settleMode, credit_note_no: creditNoteNo, remarks: settleRemarks }), 'Claim settled.')
                }}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: settleMode ? '#059669' : '#94a3b8', color: '#fff', border: 'none', fontWeight: '700', fontSize: '14px', cursor: settleMode ? 'pointer' : 'not-allowed', opacity: acting ? 0.7 : 1 }}>
                  {acting ? 'Processing…' : '✓ Confirm Settlement'}
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
              <div style={{ fontSize: '13px', color: '#0c4a6e', background: '#f0f9ff', borderRadius: '8px', padding: '10px 14px' }}>⏳ With Buying for penalties and final submission.</div>
            )}
          </div>
        </>)}
      </div>
    </div>
  )
}
