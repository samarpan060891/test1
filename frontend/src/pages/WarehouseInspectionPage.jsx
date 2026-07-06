import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { TableScrollWrap } from '../components/TableScrollWrap.jsx'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import { useResizableColumns } from '../hooks/useResizableColumns.js'
import { listWarehouseInspections, createWarehouseInspection, getWarehouseCoverage } from '../api/warehouseInspections.js'
import { useCurrency } from '../context/CurrencyContext.jsx'
import client from '../api/client.js'
import * as XLSX from 'xlsx'

const STAGES = ['inbound', 'outbound', 'random']

const STATUS_META = {
  in_progress:      { bg: '#fef3c7', color: '#92400e',  label: 'In Progress' },
  pass:             { bg: '#f0fdf4', color: '#15803d',  label: 'Pass' },
  fail:             { bg: '#fef2f2', color: '#dc2626',  label: 'Fail' },
  submitted_for_qa: { bg: '#eff6ff', color: '#1d4ed8',  label: 'Pending QA Review' },
  deviation_requested: { bg: '#fef3c7', color: '#92400e', label: 'Pending Buyer Deviation' },
  deviation_reviewed:  { bg: '#eff6ff', color: '#1d4ed8', label: 'Pending Final QA Review' },
  qa_approved:      { bg: '#f0fdf4', color: '#15803d',  label: 'QA Approved' },
  qa_rejected:      { bg: '#fef2f2', color: '#dc2626',  label: 'QA Rejected' },
}

const STAGE_META = {
  inbound:  { bg: '#eff6ff', color: '#1d4ed8' },
  outbound: { bg: '#faf5ff', color: '#7e22ce' },
  random:   { bg: '#fefce8', color: '#92400e' },
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: '700',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '12px 14px',
  fontSize: '13px',
  color: '#1e293b',
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
}

export default function WarehouseInspectionPage() {
  const navigate = useNavigate()
  const { formatAmount } = useCurrency()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ stage: '', status: '', po_no: '' })
  const [colFilters, setColFilters] = useState({})
  const [coverage, setCoverage] = useState(null)
  // Resizable columns: PO, Item, Stage, Inspector, Trigger, PO Qty, QC Check Qty,
  // Defect Qty, PO Value, Defect Value, Progress, Status, Date, Action
  const { widths: colWidths, getHandleProps, resetWidths } =
    useResizableColumns([110, 160, 95, 115, 110, 80, 105, 90, 105, 110, 130, 130, 110, 90], 'wh-inspections')
  const [showCreate, setShowCreate] = useState(false)
  const [listError, setListError] = useState('')

  const [poList, setPoList] = useState([])
  const [itemList, setItemList] = useState([])
  const [form, setForm] = useState({ po_no: '', stage: 'inbound', trigger_source: '' })
  const [selectedItems, setSelectedItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [activeFilter, setActiveFilter] = useState(null) // null | 'in_progress' | 'pass' | 'fail' | 'inbound' | 'outbound' | 'random'

  useEffect(() => {
    fetchInspections()
    client.get('/masters/pos').then(r => setPoList(r.data || [])).catch(() => {})
    getWarehouseCoverage().then(r => setCoverage(r.data)).catch(() => {})
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

  function downloadExcel(rows) {
    const data = rows.map(ins => ({
      'PO No.':        ins.po_no,
      'Item Code':     ins.item_code,
      'Item Name':     ins.item_name || '',
      'Stage':         ins.stage,
      'Inspector':     ins.inspector_name || '',
      'Trigger':       ins.trigger_source || '',
      'PO Qty':        ins.po_qty ?? '',
      'QC Check Qty':  ins.checked_qty ?? '',
      'Defect Qty':    ins.defect_qty ?? '',
      'PO Value':      ins.po_value != null ? parseFloat(ins.po_value) : '',
      'Defect Value':  ins.defect_value != null ? parseFloat(ins.defect_value) : '',
      'Status':        STATUS_META[ins.status]?.label || ins.status,
      'Pass':          parseInt(ins.pass_count) || 0,
      'Fail':          parseInt(ins.fail_count) || 0,
      'Total Checkpoints': parseInt(ins.total_checkpoints) || 0,
      'Date':          new Date(ins.created_at).toLocaleDateString('en-GB'),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Warehouse Inspections')
    XLSX.writeFile(wb, `warehouse_inspections_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Apply stat card filter on top of API filters
  const cardFiltered = activeFilter
    ? inspections.filter(ins =>
        ins.status === activeFilter || ins.stage === activeFilter
      )
    : inspections

  // Per-column Excel-style filters
  const setColFilter = (key, vals) => setColFilters(p => ({ ...p, [key]: vals }))
  const hasColFilter = Object.values(colFilters).some(v => v?.length > 0)
  const clearColFilters = () => setColFilters({})
  const displayInspections = cardFiltered.filter(ins =>
    Object.entries(colFilters).every(([key, vals]) =>
      !vals?.length || vals.includes(String(ins[key] ?? ''))
    )
  )

  const STAT_CARDS = [
    { label: 'All Inspections', key: null,               cls: 'blue',  accent: '#E8470F' },
    { label: 'In Progress',     key: 'in_progress',      cls: 'amber', accent: '#d97706' },
    { label: 'Submitted QA',   key: 'submitted_for_qa', cls: 'blue',  accent: '#1d4ed8' },
    { label: 'Buyer Deviation', key: 'deviation_requested', cls: 'amber', accent: '#d97706' },
    { label: 'Final QA Review', key: 'deviation_reviewed',  cls: 'blue',  accent: '#1d4ed8' },
    { label: 'QA Approved',    key: 'qa_approved',      cls: 'green', accent: '#059669' },
    { label: 'QA Rejected',    key: 'qa_rejected',      cls: 'red',   accent: '#dc2626' },
    { label: 'Pass',            key: 'pass',             cls: 'green', accent: '#059669' },
    { label: 'Fail',            key: 'fail',             cls: 'red',   accent: '#dc2626' },
    { label: 'Inbound',         key: 'inbound',          cls: 'blue',  accent: '#1d4ed8' },
    { label: 'Outbound',        key: 'outbound',         cls: 'blue',  accent: '#7e22ce' },
    { label: 'Random',          key: 'random',           cls: 'amber', accent: '#92400e' },
  ]

  const selectStyle = {
    padding: '7px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    fontSize: '13px',
    background: '#fff',
    color: '#374151',
    minWidth: '130px',
  }

  // Header cell style for the resizable table (fixed layout) — wraps on narrow widths
  const thR = (i, extra = {}) => ({ ...thStyle, ...extra, position: 'relative', width: colWidths[i], whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', verticalAlign: 'bottom' })
  const resizeHandle = (i) => i < colWidths.length - 1 && (
    <div className="col-resize-handle" {...getHandleProps(i)} />
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1e293b' }}>Warehouse Inspections</h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Inbound · Outbound · Random stock checks</p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setCreateError('') }}
            style={{ background: '#1C1208', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
          >
            + New Inspection
          </button>
        </div>

        {/* Warehouse inspection coverage */}
        {coverage && coverage.total_pos > 0 && (() => {
          const pct = Math.round((coverage.wh_inspected_pos / coverage.total_pos) * 100)
          return (
            <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '16px 20px', marginBottom: '16px', borderTop: '3px solid #0f766e' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                <div style={{ minWidth: '220px', flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: '800', color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    🏭 Warehouse Inspection Coverage
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '28px', fontWeight: '800', color: '#0f766e' }}>{pct}%</span>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{coverage.wh_inspected_pos} of {coverage.total_pos} POs warehouse-inspected</span>
                  </div>
                  <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginTop: '8px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #0f766e, #14b8a6)', transition: 'width 0.4s' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Agency/Self Inspected', value: coverage.agency_inspected_pos, color: '#166534' },
                    { label: 'Both WH + Agency', value: coverage.both_pos, color: '#1d4ed8' },
                    { label: 'Warehouse Only', value: coverage.wh_inspected_pos - coverage.both_pos, color: '#0f766e' },
                    { label: 'Not Inspected', value: coverage.uninspected_pos, color: coverage.uninspected_pos > 0 ? '#dc2626' : '#94a3b8' },
                  ].map(f => (
                    <div key={f.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: '800', color: f.color }}>{f.value}</div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px' }}>{f.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Stat cards */}
        <div className="stat-grid mb-4">
          {STAT_CARDS.map(s => {
            const isActive = activeFilter === s.key
            const count = s.key === null
              ? inspections.length
              : inspections.filter(i => i.status === s.key || i.stage === s.key).length
            return (
              <div key={String(s.key)} className={`stat-card ${s.cls}`}
                onClick={() => setActiveFilter(p => p === s.key ? null : s.key)}
                style={{ cursor: 'pointer', transform: isActive ? 'translateY(-2px)' : undefined, transition: 'transform 0.1s', userSelect: 'none' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {s.label}
                  {isActive && <span style={{ fontSize: '10px', fontWeight: '700', opacity: 0.7 }}>✕ FILTER</span>}
                </div>
                <div className="stat-value" style={{ color: s.accent }}>{count}</div>
              </div>
            )
          })}
        </div>

        {/* Filter bar */}
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', padding: '14px 18px', marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filters.stage} onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))} style={selectStyle}>
            <option value="">All Stages</option>
            {STAGES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
            <option value="">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="submitted_for_qa">Pending QA Review</option>
            <option value="deviation_requested">Pending Buyer Deviation</option>
            <option value="deviation_reviewed">Pending Final QA Review</option>
            <option value="qa_approved">QA Approved</option>
            <option value="qa_rejected">QA Rejected</option>
          </select>
          <select value={filters.po_no} onChange={e => setFilters(f => ({ ...f, po_no: e.target.value }))} style={{ ...selectStyle, minWidth: '200px' }}>
            <option value="">All POs</option>
            {poList.map(p => (
              <option key={p.po_no} value={p.po_no}>
                {p.po_no}{p.supplier_name ? ` — ${p.supplier_name}` : ''}
              </option>
            ))}
          </select>
          <button onClick={fetchInspections} style={{ padding: '7px 16px', borderRadius: '6px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: '13px', cursor: 'pointer', color: '#374151', fontWeight: '500' }}>
            Refresh
          </button>
          {listError && (
            <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: '500' }}>⚠ {listError}</span>
          )}
        </div>

        {/* Table card */}
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          {/* Card header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Warehouse Inspections</h2>
              {activeFilter && (
                <span style={{ background: '#FEF0EB', color: '#E8470F', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px' }}>
                  {STAT_CARDS.find(s => s.key === activeFilter)?.label}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {displayInspections.length}{activeFilter ? ` of ${inspections.length}` : ''} inspection(s)
              </span>
              <button
                onClick={resetWidths}
                title="Reset column widths"
                style={{ padding: '6px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
              >
                ⟲ Columns
              </button>
              <button
                onClick={() => downloadExcel(displayInspections)}
                disabled={displayInspections.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '7px', border: '1.5px solid #059669', background: '#fff', color: '#059669', fontSize: '13px', fontWeight: '600', cursor: displayInspections.length === 0 ? 'not-allowed' : 'pointer', opacity: displayInspections.length === 0 ? 0.5 : 1 }}
              >
                ↓ Download Excel
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading…</div>
          ) : displayInspections.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
              {inspections.length === 0 ? 'No inspections found. Create one to get started.' : 'No inspections match the selected filter.'}
            </div>
          ) : (
            <TableScrollWrap>
              <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: colWidths.reduce((a, b) => a + b, 0) }}>
                <colgroup>
                  {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={thR(0)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>PO No.
                        <ColumnFilterDropdown colKey="po_no" data={cardFiltered} value={colFilters.po_no || []} onChange={v => setColFilter('po_no', v)} label="PO No." />
                      </span>
                      {resizeHandle(0)}
                    </th>
                    <th style={thR(1)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Item
                        <ColumnFilterDropdown colKey="item_name" data={cardFiltered} value={colFilters.item_name || []} onChange={v => setColFilter('item_name', v)} label="Item" />
                      </span>
                      {resizeHandle(1)}
                    </th>
                    <th style={thR(2)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Stage
                        <ColumnFilterDropdown colKey="stage" data={cardFiltered} value={colFilters.stage || []} onChange={v => setColFilter('stage', v)} label="Stage" />
                      </span>
                      {resizeHandle(2)}
                    </th>
                    <th style={thR(3)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Inspector
                        <ColumnFilterDropdown colKey="inspector_name" data={cardFiltered} value={colFilters.inspector_name || []} onChange={v => setColFilter('inspector_name', v)} label="Inspector" />
                      </span>
                      {resizeHandle(3)}
                    </th>
                    <th style={thR(4)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Trigger
                        <ColumnFilterDropdown colKey="trigger_source" data={cardFiltered} value={colFilters.trigger_source || []} onChange={v => setColFilter('trigger_source', v)} label="Trigger" valueLabel={v => v.replace(/_/g, ' ')} />
                      </span>
                      {resizeHandle(4)}
                    </th>
                    <th style={thR(5, { textAlign: 'right' })}>PO Qty{resizeHandle(5)}</th>
                    <th style={thR(6, { textAlign: 'right' })}>QC Check Qty{resizeHandle(6)}</th>
                    <th style={thR(7, { textAlign: 'right' })}>Defect Qty{resizeHandle(7)}</th>
                    <th style={thR(8, { textAlign: 'right' })}>PO Value{resizeHandle(8)}</th>
                    <th style={thR(9, { textAlign: 'right' })}>Defect Value{resizeHandle(9)}</th>
                    <th style={thR(10)}>Progress{resizeHandle(10)}</th>
                    <th style={thR(11)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>Status
                        <ColumnFilterDropdown colKey="status" data={cardFiltered} value={colFilters.status || []} onChange={v => setColFilter('status', v)} label="Status" valueLabel={v => STATUS_META[v]?.label || v} />
                      </span>
                      {resizeHandle(11)}
                    </th>
                    <th style={thR(12)}>Date{resizeHandle(12)}</th>
                    <th style={thR(13, { textAlign: 'center' })}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Action
                        {hasColFilter && (
                          <button onClick={clearColFilters} title="Clear all column filters"
                            style={{ fontSize: '9px', color: '#E8470F', background: '#FEF0EB', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontWeight: '700', padding: '1px 5px' }}>
                            ✕ Clear
                          </button>
                        )}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayInspections.map(ins => {
                    const st = STATUS_META[ins.status] || { bg: '#f1f5f9', color: '#475569', label: ins.status }
                    const sg = STAGE_META[ins.stage] || { bg: '#f1f5f9', color: '#475569' }
                    const total = parseInt(ins.total_checkpoints) || 0
                    const passed = parseInt(ins.pass_count) || 0
                    const failed = parseInt(ins.fail_count) || 0
                    const pending = total - passed - failed
                    const pct = total > 0 ? Math.round((passed / total) * 100) : 0
                    return (
                      <tr key={ins.wh_inspection_id}
                        onClick={() => navigate(`/warehouse-inspections/${ins.wh_inspection_id}`)}
                        style={{ cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ ...tdStyle, fontWeight: '600', color: '#1e293b' }}>
                          {ins.po_no}
                          {(ins.agency_inspected || ins.self_inspected) && (
                            <div style={{ marginTop: '3px' }}>
                              <span title={ins.agency_inspected ? 'This PO was also inspected by a quality agency' : 'This PO was self-inspected by the supplier'}
                                style={{ display: 'inline-block', fontSize: '9px', fontWeight: '800', padding: '1px 7px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.03em',
                                  background: ins.agency_inspected ? '#dcfce7' : '#fce7f3',
                                  color: ins.agency_inspected ? '#166534' : '#9d174d' }}>
                                {ins.agency_inspected ? '✓ Agency Inspected' : '✓ Self Inspected'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: '500' }}>{ins.item_name || ins.item_code}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{ins.item_code}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ background: sg.bg, color: sg.color, padding: '2px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            {ins.stage}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: '#475569' }}>{ins.inspector_name || '—'}</td>
                        <td style={{ ...tdStyle, color: '#475569', fontSize: '12px' }}>
                          {ins.trigger_source ? ins.trigger_source.replace(/_/g, ' ') : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>{ins.po_qty ?? '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>{ins.checked_qty ?? '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: (ins.defect_qty || 0) > 0 ? '700' : '400', color: (ins.defect_qty || 0) > 0 ? '#dc2626' : '#475569' }}>
                          {ins.defect_qty ?? '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#475569' }}>
                          {ins.po_value != null ? formatAmount(parseFloat(ins.po_value)) : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: parseFloat(ins.defect_value || 0) > 0 ? '700' : '400', color: parseFloat(ins.defect_value || 0) > 0 ? '#dc2626' : '#475569' }}>
                          {ins.defect_value != null ? formatAmount(parseFloat(ins.defect_value)) : '—'}
                        </td>
                        <td style={{ ...tdStyle, minWidth: '120px' }}>
                          {total > 0 ? (
                            <>
                              <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginBottom: '4px' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: failed > 0 ? '#ef4444' : '#10b981', transition: 'width 0.3s' }} />
                              </div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {passed}✓ {failed > 0 ? `${failed}✗ ` : ''}{pending > 0 ? `${pending} pending` : ''}
                              </div>
                            </>
                          ) : <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: 'inline-block', background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11.5px', fontWeight: '700', whiteSpace: 'normal' }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: '#64748b' }}>
                          {new Date(ins.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/warehouse-inspections/${ins.wh_inspection_id}`) }}
                            style={{ padding: '5px 14px', borderRadius: '6px', background: '#1C1208', color: '#fff', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                          >
                            View
                          </button>
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
                  {poList.map(p => <option key={p.po_no} value={p.po_no}>{p.po_no}{p.supplier_name ? ` — ${p.supplier_name}` : ''}</option>)}
                </select>
              </label>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>Items * ({selectedItems.length} selected)</span>
                  {itemList.length > 0 && (
                    <button type="button" onClick={toggleAll} style={{ fontSize: '12px', color: '#1C1208', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
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
                    <label key={i.item_code} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: selectedItems.includes(i.item_code) ? '#f0fdf4' : '#fff' }}>
                      <input type="checkbox" checked={selectedItems.includes(i.item_code)} onChange={() => toggleItem(i.item_code)} style={{ width: '16px', height: '16px', accentColor: '#1C1208' }} />
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
                  style={{ flex: 1, background: '#1C1208', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontWeight: '600', fontSize: '14px', cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.7 : 1 }}>
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
