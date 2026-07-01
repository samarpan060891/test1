import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { listWarehouseInspections, createWarehouseInspection } from '../api/warehouseInspections.js'
import client from '../api/client.js'

const STAGES = ['inbound', 'outbound', 'random']

const STATUS_COLOR = {
  in_progress: { bg: '#fef3c7', color: '#92400e', label: 'In Progress' },
  pass:        { bg: '#d1fae5', color: '#065f46', label: 'Pass' },
  fail:        { bg: '#fee2e2', color: '#991b1b', label: 'Fail' },
}

export default function WarehouseInspectionPage() {
  const navigate = useNavigate()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ stage: '', status: '', po_no: '' })
  const [showCreate, setShowCreate] = useState(false)

  // PO/item dropdowns
  const [poList, setPoList] = useState([])
  const [itemList, setItemList] = useState([])
  const [form, setForm] = useState({ po_no: '', stage: 'inbound', trigger_source: '' })
  const [selectedItems, setSelectedItems] = useState([]) // multi-select
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [listError, setListError] = useState('')

  useEffect(() => {
    fetchInspections()
    client.get('/masters/pos').then(r => setPoList(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.po_no) { setItemList([]); setSelectedItems([]); return }
    client.get('/masters/items', { params: { po_no: form.po_no } })
      .then(r => { setItemList(r.data || []); setSelectedItems([]) })
      .catch(() => { setItemList([]); setSelectedItems([]) })
  }, [form.po_no])

  function toggleItem(code) {
    setSelectedItems(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }
  function toggleAll() {
    setSelectedItems(prev =>
      prev.length === itemList.length ? [] : itemList.map(i => i.item_code)
    )
  }

  async function fetchInspections() {
    setLoading(true)
    setListError('')
    try {
      const params = {}
      if (filters.stage) params.stage = filters.stage
      if (filters.status) params.status = filters.status
      if (filters.po_no) params.po_no = filters.po_no
      const r = await listWarehouseInspections(params)
      setInspections(r.data || [])
    } catch (err) {
      setInspections([])
      setListError(err.response?.data?.error || err.message || 'Failed to load inspections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchInspections() }, [filters])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.po_no || selectedItems.length === 0 || !form.stage) {
      setCreateError('PO, at least one item, and stage are required')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const results = []
      for (const item_code of selectedItems) {
        const r = await createWarehouseInspection({ ...form, item_code })
        results.push(r.data)
      }
      setShowCreate(false)
      if (results.length === 1) {
        navigate(`/warehouse-inspections/${results[0].wh_inspection_id}`)
      } else {
        fetchInspections()
      }
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  const card = { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', padding: '20px' }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1e293b' }}>🏭 Warehouse Inspections</h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Inbound · Outbound · Random stock checks</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setCreateError('') }}
            style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
          >
            + New Inspection
          </button>
        </div>

        {/* Filters */}
        <div style={{ ...card, marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select value={filters.stage} onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))}
            style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', minWidth: '130px' }}>
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', minWidth: '130px' }}>
            <option value="">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
          </select>
          <select value={filters.po_no} onChange={e => setFilters(f => ({ ...f, po_no: e.target.value }))}
            style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', minWidth: '180px' }}>
            <option value="">All POs</option>
            {poList.map(p => (
              <option key={p.po_no} value={p.po_no}>
                {p.po_no}{p.description ? ` — ${p.description}` : ''}
              </option>
            ))}
          </select>
          <button onClick={fetchInspections} style={{ padding: '7px 14px', borderRadius: '6px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: '13px', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>

        {/* List */}
        {listError && (
          <div style={{ ...card, marginBottom: '12px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: '13px' }}>
            ⚠ Error loading inspections: {listError}
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading…</div>
        ) : inspections.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
            No inspections found. Create one to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {inspections.map(ins => {
              const st = STATUS_COLOR[ins.status] || { bg: '#f1f5f9', color: '#475569', label: ins.status }
              const total = parseInt(ins.total_checkpoints) || 0
              const passed = parseInt(ins.pass_count) || 0
              const failed = parseInt(ins.fail_count) || 0
              const pct = total > 0 ? Math.round((passed / total) * 100) : 0
              return (
                <div key={ins.wh_inspection_id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }}
                  onClick={() => navigate(`/warehouse-inspections/${ins.wh_inspection_id}`)}>
                  {/* Stage badge */}
                  <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: '8px', padding: '8px 12px', textAlign: 'center', minWidth: '72px', flexShrink: 0 }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>Stage</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', marginTop: '2px' }}>{ins.stage?.charAt(0).toUpperCase() + ins.stage?.slice(1)}</div>
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '14px' }}>
                      PO: {ins.po_no} &nbsp;·&nbsp; {ins.item_name || ins.item_code}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                      {ins.po_description || ''} &nbsp;·&nbsp; Inspector: {ins.inspector_name || '—'}
                      {ins.trigger_source ? ` · Trigger: ${ins.trigger_source}` : ''}
                    </div>
                    {/* Progress bar */}
                    {total > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: failed > 0 ? '#ef4444' : '#10b981', transition: 'width 0.3s' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          {passed} pass · {failed} fail · {total - passed - failed} pending
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Status + date */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>
                      {st.label}
                    </span>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
                      {new Date(ins.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>New Warehouse Inspection</h2>
            <form onSubmit={handleCreate}>
              <label style={{ display: 'block', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>PO Number *</span>
                <select value={form.po_no} onChange={e => setForm(f => ({ ...f, po_no: e.target.value, item_code: '' }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }} required>
                  <option value="">Select PO</option>
                  {poList.map(p => <option key={p.po_no} value={p.po_no}>{p.po_no}{p.description ? ` — ${p.description}` : ''}</option>)}
                </select>
              </label>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Items * ({selectedItems.length} selected)</span>
                  {itemList.length > 0 && (
                    <button type="button" onClick={toggleAll} style={{ fontSize: '12px', color: '#1e3a5f', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                      {selectedItems.length === itemList.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {!form.po_no ? (
                    <div style={{ padding: '12px', color: '#94a3b8', fontSize: '13px' }}>Select PO first</div>
                  ) : itemList.length === 0 ? (
                    <div style={{ padding: '12px', color: '#94a3b8', fontSize: '13px' }}>No items found for this PO</div>
                  ) : itemList.map(i => (
                    <label key={i.item_code} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: selectedItems.includes(i.item_code) ? '#eff6ff' : '#fff' }}>
                      <input type="checkbox" checked={selectedItems.includes(i.item_code)} onChange={() => toggleItem(i.item_code)} style={{ width: '16px', height: '16px', accentColor: '#1e3a5f' }} />
                      <span style={{ fontSize: '13px', color: '#1e293b' }}>{i.item_code}{i.name ? ` — ${i.name}` : ''}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label style={{ display: 'block', marginBottom: '14px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Stage *</span>
                <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                  {STAGES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: '20px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '5px' }}>Trigger Source</span>
                <select value={form.trigger_source} onChange={e => setForm(f => ({ ...f, trigger_source: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                  <option value="">— Select trigger —</option>
                  <option value="customer">Customer</option>
                  <option value="stores">Stores</option>
                  <option value="delivery_team">Delivery Team</option>
                  <option value="incoming_goods">Incoming Goods</option>
                </select>
              </label>
              {createError && <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '14px' }}>{createError}</div>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" disabled={creating}
                  style={{ flex: 1, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontWeight: '600', fontSize: '14px', cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.7 : 1 }}>
                  {creating ? 'Creating…' : 'Create Inspection'}
                </button>
                <button type="button" onClick={() => setShowCreate(false)}
                  style={{ flex: 1, background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '11px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
