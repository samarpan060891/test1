import React, { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import client from '../api/client.js'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import * as XLSX from 'xlsx'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import {
  getSuppliers, saveSingleSupplier, bulkSuppliers,
  getAgencies, saveSingleAgency, bulkAgencies,
  getItems, saveSingleItem, bulkItems,
  getPOs, saveSinglePO, bulkPOs,
  getBuyers
} from '../api/admin.js'
import {
  getAllComplaints, createComplaint, bulkComplaints, deleteComplaint,
  getAllClaims, createClaim, bulkClaims, deleteClaim,
} from '../api/itemHistory.js'
import { useCurrency } from '../context/CurrencyContext.jsx'

const TABS = ['Suppliers', 'Agencies', 'Items', 'POs', 'Customer Complaints', 'Claims', 'Scorecard Config', 'Reminders']

const COMPLAINT_FIELDS = [
  { key: 'item_code',      label: 'Item Code',      placeholder: 'ITEM-001', required: true },
  { key: 'complaint_ref',  label: 'Reference No.',  placeholder: 'CMP-001' },
  { key: 'complaint_date', label: 'Complaint Date', placeholder: '', type: 'date' },
  { key: 'customer_name',  label: 'Customer',       placeholder: 'Customer A' },
  { key: 'description',    label: 'Description',    placeholder: 'Describe the complaint…' },
  { key: 'severity',       label: 'Severity',       placeholder: 'medium', type: 'select', options: ['low','medium','high','critical'] },
  { key: 'status',         label: 'Status',         placeholder: 'open', type: 'select', options: ['open','investigating','resolved','closed'] },
  { key: 'resolution',     label: 'Resolution',     placeholder: 'Resolution notes…' },
]

const CLAIM_FIELDS = [
  { key: 'item_code',    label: 'Item Code',    placeholder: 'ITEM-001', required: true },
  { key: 'claim_ref',   label: 'Reference No.',placeholder: 'CLM-001' },
  { key: 'claim_date',  label: 'Claim Date',   placeholder: '', type: 'date' },
  { key: 'customer_name',label: 'Customer',    placeholder: 'Customer A' },
  { key: 'reason',      label: 'Reason',       placeholder: 'Reason for claim…' },
  { key: 'claim_amount',label: 'Amount (AED)', placeholder: '500.00', type: 'number' },
  { key: 'status',      label: 'Status',       placeholder: 'open', type: 'select', options: ['open','under_review','approved','rejected','settled'] },
  { key: 'resolution',  label: 'Resolution',   placeholder: 'Resolution notes…' },
]

const SUPPLIER_FIELDS = [
  { key: 'supplier_code', label: 'Supplier Code', placeholder: 'SUP-001', required: true },
  { key: 'name', label: 'Supplier Name', placeholder: 'Acme Supplies Ltd', required: true },
  { key: 'contact_email', label: 'Contact Email', placeholder: 'contact@supplier.com', required: false },
  { key: 'contact_name', label: 'Contact Name', placeholder: 'John Smith', required: false },
  { key: 'country', label: 'Country', placeholder: 'China', required: false },
]

const AGENCY_FIELDS = [
  { key: 'agency_code', label: 'Agency Code', placeholder: 'AGC-001', required: true },
  { key: 'name', label: 'Agency Name', placeholder: 'InterQC Inspections', required: true },
  { key: 'contact_name', label: 'Contact Name', placeholder: 'Jane Doe', required: false },
  { key: 'contact_emails', label: 'Contact Email(s)', placeholder: 'jane@agency.com, ops@agency.com', required: false },
  { key: 'country', label: 'Country', placeholder: 'India', required: false },
]

const ITEM_FIELDS = [
  { key: 'item_code', label: 'Item Code', placeholder: 'ITM-001', required: true },
  { key: 'name', label: 'Item Name', placeholder: 'Ceramic Mug Set', required: true },
  { key: 'category', label: 'Category', placeholder: 'Cookware', required: false },
  { key: 'sub_category', label: 'Sub Category', placeholder: 'Mugs', required: false },
  { key: 'description', label: 'Description', placeholder: 'Set of 4 ceramic mugs', required: false },
]

const PO_FIELDS = [
  { key: 'po_no', label: 'PO Number', placeholder: 'PO-2026-001', required: true },
  { key: 'supplier_code', label: 'Supplier Code', placeholder: 'SUP-001', required: true },
  { key: 'order_date', label: 'Order Date', placeholder: '', required: false, type: 'date' },
  { key: 'status', label: 'Status', placeholder: 'open', required: false },
  { key: 'buyer_id', label: 'Assigned Buyer', placeholder: '', required: false, type: 'buyer_select' },
]

const EMPTY_LINE_ITEM = () => ({ item_code: '', quantity: '', unit_price: '' })

const CONFIG = {
  Suppliers: { fields: SUPPLIER_FIELDS, get: getSuppliers, saveSingle: saveSingleSupplier, bulk: bulkSuppliers, codeKey: 'supplier_code', nameKey: 'name' },
  Agencies: { fields: AGENCY_FIELDS, get: getAgencies, saveSingle: saveSingleAgency, bulk: bulkAgencies, codeKey: 'agency_code', nameKey: 'name' },
  Items: { fields: ITEM_FIELDS, get: getItems, saveSingle: saveSingleItem, bulk: bulkItems, codeKey: 'item_code', nameKey: 'name' },
  POs: { fields: PO_FIELDS, get: getPOs, saveSingle: saveSinglePO, bulk: bulkPOs, codeKey: 'po_no', nameKey: 'supplier_code' },
}

function emptyForm(fields) {
  return Object.fromEntries(fields.map(f => [f.key, '']))
}

function HistoryMastersTab({ type }) {
  const { formatAmount, currentCurrency } = useCurrency()
  const isComplaints = type === 'Customer Complaints'
  const fields = isComplaints ? COMPLAINT_FIELDS : CLAIM_FIELDS
  const getAll = isComplaints ? getAllComplaints : getAllClaims
  const createFn = isComplaints ? createComplaint : createClaim
  const bulkFn = isComplaints ? bulkComplaints : bulkClaims
  const deleteFn = isComplaints ? deleteComplaint : deleteClaim

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(emptyForm(fields))
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const fileRef = useRef()
  const [colFilters, setColFilters] = useState({})

  const load = () => {
    setLoading(true)
    getAll().then(r => setRows(r.data || [])).catch(() => setRows([])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [type])

  const filteredRows = rows.filter(row =>
    fields.every(f => {
      const fv = colFilters[f.key]
      if (!fv || fv.length === 0) return true
      return fv.includes(String(row[f.key] ?? ''))
    })
  )

  const handleSingle = async (e) => {
    e.preventDefault()
    setSaving(true); setFormMsg('')
    try {
      await createFn(form)
      setFormMsg('Saved successfully!')
      setForm(emptyForm(fields))
      load()
    } catch (err) {
      setFormMsg(err?.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const handleBulk = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setBulkLoading(true); setBulkMsg('')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const parsed = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (parsed.length === 0) { setBulkMsg('No data rows found'); setBulkLoading(false); return }
      const res = await bulkFn(parsed)
      setBulkMsg(`Inserted ${res.data.inserted} record(s).`)
      load()
    } catch (err) {
      setBulkMsg(err?.response?.data?.error || 'Bulk upload failed')
    } finally {
      setBulkLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return
    setDeleting(id)
    try { await deleteFn(id); load() } catch {}
    finally { setDeleting(null) }
  }

  const downloadTemplate = () => {
    const headers = Object.fromEntries(fields.map(f => [f.key, f.placeholder || '']))
    const ws = XLSX.utils.json_to_sheet([headers])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, `${type.replace(' ', '_')}_template.xlsx`)
  }

  const downloadData = () => {
    const data = filteredRows.map(row => Object.fromEntries(fields.map(f => [f.label, row[f.key] ?? ''])))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, type)
    XLSX.writeFile(wb, `${type.replace(' ', '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const SEV_COLORS = { critical: '#fef2f2', high: '#fff7ed', medium: '#fefce8', low: '#f0fdf4' }
  const SEV_TEXT = { critical: '#991b1b', high: '#c2410c', medium: '#92400e', low: '#15803d' }
  const STAT_COLORS = { open: '#fef2f2', investigating: '#fff7ed', resolved: '#f0fdf4', closed: '#f8fafc', under_review: '#fff7ed', approved: '#f0fdf4', rejected: '#fef2f2', settled: '#eff6ff' }
  const STAT_TEXT = { open: '#991b1b', investigating: '#c2410c', resolved: '#15803d', closed: '#64748b', under_review: '#c2410c', approved: '#15803d', rejected: '#991b1b', settled: '#1d4ed8' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
      {/* Left: Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700', color: '#111827' }}>Add New Entry</h3>
          <form onSubmit={handleSingle}>
            {fields.map(f => (
              <div key={f.key} style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>
                  {f.label}{f.required ? ' *' : ''}
                </label>
                {f.type === 'select' ? (
                  <select value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }}>
                    <option value=''>— Select —</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder} required={f.required}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                )}
              </div>
            ))}
            {formMsg && <p style={{ margin: '0 0 10px', fontSize: '13px', color: formMsg.includes('success') ? '#059669' : '#dc2626' }}>{formMsg}</p>}
            <button type="submit" disabled={saving} style={{ width: '100%', backgroundColor: saving ? '#93c5fd' : '#1C1208', color: '#fff', border: 'none', padding: '9px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save Record'}
            </button>
          </form>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '700', color: '#111827' }}>Bulk Upload</h3>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#6b7280' }}>Upload Excel with columns: <code style={{ fontSize: '11px' }}>{fields.map(f => f.key).join(', ')}</code></p>
          <button onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', justifyContent: 'center', padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', cursor: 'pointer', marginBottom: '8px' }}>
            📄 Download Blank Template
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleBulk} disabled={bulkLoading} style={{ display: 'none' }} id={`bulk-file-${type}`} />
          <label htmlFor={`bulk-file-${type}`} style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: '7px', border: '2px dashed #d1d5db', cursor: bulkLoading ? 'not-allowed' : 'pointer', fontSize: '13px', color: '#6b7280' }}>
            {bulkLoading ? 'Uploading…' : 'Click to select CSV / Excel file'}
          </label>
          {bulkMsg && <p style={{ margin: '10px 0 0', fontSize: '13px', color: bulkMsg.includes('Inserted') ? '#059669' : '#dc2626' }}>{bulkMsg}</p>}
        </div>
      </div>

      {/* Right: Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>{type} <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '400' }}>{filteredRows.length} records</span></span>
          <button onClick={downloadData} disabled={rows.length === 0} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', backgroundColor: rows.length === 0 ? '#f1f5f9' : '#f0fdf4', color: rows.length === 0 ? '#94a3b8' : '#15803d', border: `1px solid ${rows.length === 0 ? '#e2e8f0' : '#86efac'}`, cursor: rows.length === 0 ? 'not-allowed' : 'pointer' }}>
            ⬇ Download Excel
          </button>
        </div>
        {loading ? (
          <p style={{ padding: '24px', color: '#6b7280' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: '24px', color: '#9ca3af', textAlign: 'center' }}>No records yet. Add one or upload Excel.</p>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                <tr>
                  {['item_code', 'item_name', ...(isComplaints ? ['complaint_ref','complaint_date','customer_name','description','severity','status'] : ['claim_ref','claim_date','customer_name','reason','claim_amount','status'])].map(col => {
                    const fld = col === 'claim_amount'
                      ? { key: col, label: `Amount (${currentCurrency.code})` }
                      : fields.find(f => f.key === col) || { key: col, label: col }
                    return (
                      <th key={col} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: '700', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          {fld.label || col}
                          <ColumnFilterDropdown colKey={col} data={rows} value={colFilters[col] || []} onChange={v => setColFilters(p => ({ ...p, [col]: v }))} label={fld.label || col} />
                        </span>
                      </th>
                    )
                  })}
                  <th style={{ padding: '9px 12px', borderBottom: '1px solid #e5e7eb' }} />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const sev = row.severity
                  const stat = row.status
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '9px 12px', fontWeight: '600', color: '#334155' }}>{row.item_code}</td>
                      <td style={{ padding: '9px 12px', color: '#64748b' }}>{row.item_name || '—'}</td>
                      {isComplaints ? <>
                        <td style={{ padding: '9px 12px', color: '#334155' }}>{row.complaint_ref || '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b' }}>{row.complaint_date ? row.complaint_date.slice(0,10) : '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#334155' }}>{row.customer_name || '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description || '—'}</td>
                        <td style={{ padding: '9px 12px' }}>
                          {sev ? <span style={{ background: SEV_COLORS[sev]||'#f8fafc', color: SEV_TEXT[sev]||'#64748b', padding: '2px 8px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{sev}</span> : '—'}
                        </td>
                      </> : <>
                        <td style={{ padding: '9px 12px', color: '#334155' }}>{row.claim_ref || '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b' }}>{row.claim_date ? row.claim_date.slice(0,10) : '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#334155' }}>{row.customer_name || '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#64748b', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.reason || '—'}</td>
                        <td style={{ padding: '9px 12px', color: '#334155', textAlign: 'right' }}>{row.claim_amount ? formatAmount(Number(row.claim_amount)) : '—'}</td>
                      </>}
                      <td style={{ padding: '9px 12px' }}>
                        {stat ? <span style={{ background: STAT_COLORS[stat]||'#f8fafc', color: STAT_TEXT[stat]||'#64748b', padding: '2px 8px', borderRadius: '9999px', fontWeight: '700', fontSize: '11px' }}>{stat.replace(/_/g,' ')}</span> : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => handleDelete(row.id)} disabled={deleting === row.id}
                          style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}>
                          {deleting === row.id ? '…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const TIMEZONE_OPTIONS = [
  { label: 'UAE / Gulf (Dubai)',           tz: 'Asia/Dubai',             offset: 'UTC+4'    },
  { label: 'India (Mumbai/Delhi)',          tz: 'Asia/Kolkata',           offset: 'UTC+5:30' },
  { label: 'Pakistan (Karachi)',            tz: 'Asia/Karachi',           offset: 'UTC+5'    },
  { label: 'Bangladesh (Dhaka)',            tz: 'Asia/Dhaka',             offset: 'UTC+6'    },
  { label: 'Sri Lanka (Colombo)',           tz: 'Asia/Colombo',           offset: 'UTC+5:30' },
  { label: 'Malaysia / Singapore',         tz: 'Asia/Kuala_Lumpur',      offset: 'UTC+8'    },
  { label: 'Indonesia (Jakarta)',           tz: 'Asia/Jakarta',           offset: 'UTC+7'    },
  { label: 'Vietnam (Ho Chi Minh)',         tz: 'Asia/Ho_Chi_Minh',       offset: 'UTC+7'    },
  { label: 'Thailand (Bangkok)',            tz: 'Asia/Bangkok',           offset: 'UTC+7'    },
  { label: 'Philippines (Manila)',          tz: 'Asia/Manila',            offset: 'UTC+8'    },
  { label: 'China (Shanghai/Beijing)',      tz: 'Asia/Shanghai',          offset: 'UTC+8'    },
  { label: 'Hong Kong',                    tz: 'Asia/Hong_Kong',         offset: 'UTC+8'    },
  { label: 'South Korea (Seoul)',           tz: 'Asia/Seoul',             offset: 'UTC+9'    },
  { label: 'Japan (Tokyo)',                tz: 'Asia/Tokyo',             offset: 'UTC+9'    },
  { label: 'Turkey (Istanbul)',             tz: 'Europe/Istanbul',        offset: 'UTC+3'    },
  { label: 'UK (London)',                  tz: 'Europe/London',          offset: 'UTC+0/+1' },
  { label: 'Germany / France (CET)',       tz: 'Europe/Berlin',          offset: 'UTC+1/+2' },
  { label: 'South Africa (Johannesburg)',  tz: 'Africa/Johannesburg',    offset: 'UTC+2'    },
  { label: 'USA Eastern (New York)',        tz: 'America/New_York',       offset: 'UTC-5/-4' },
  { label: 'USA Pacific (Los Angeles)',    tz: 'America/Los_Angeles',    offset: 'UTC-8/-7' },
  { label: 'Australia (Sydney)',           tz: 'Australia/Sydney',       offset: 'UTC+10/+11'},
  { label: 'UTC (Universal)',              tz: 'UTC',                    offset: 'UTC+0'    },
]

function localTimeInTz(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date())
  } catch { return '--:--' }
}

const REMINDER_ROLES = [
  { value: 'qa',           label: 'QA Team',        hint: 'All users with QA role' },
  { value: 'buying',       label: 'Buying Team',     hint: 'All users with Buying role' },
  { value: 'imports',      label: 'Imports Team',    hint: 'All users with Imports role' },
  { value: 'accounts',     label: 'Accounts Team',   hint: 'All users with Accounts role' },
  { value: 'agency_user',  label: 'Agency (assigned)', hint: 'Only agency users assigned to the overdue job' },
  { value: 'supplier_user',label: 'Supplier',        hint: "Supplier user for the job's supplier" },
]

function RemindersTab() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [log, setLog] = useState([])

  useEffect(() => {
    client.get('/admin/reminder-config').then(r => setCfg(r.data)).catch(() => setError('Failed to load config'))
    client.get('/admin/reminder-log').then(r => setLog(r.data)).catch(() => {})
  }, [])

  function toggleRole(role) {
    const current = cfg.recipient_roles || []
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
    setCfg(c => ({ ...c, recipient_roles: next }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (cfg.enabled && (!cfg.recipient_roles || cfg.recipient_roles.length === 0)) {
      setError('Select at least one recipient group before enabling reminders.')
      return
    }
    setSaving(true); setSaved(false); setError('')
    try {
      const r = await client.put('/admin/reminder-config', cfg)
      setCfg(r.data); setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  const [nowInTz, setNowInTz] = React.useState('')
  React.useEffect(() => {
    if (!cfg?.timezone) return
    setNowInTz(localTimeInTz(cfg.timezone))
    const t = setInterval(() => setNowInTz(localTimeInTz(cfg.timezone)), 10000)
    return () => clearInterval(t)
  }, [cfg?.timezone])

  const panelStyle = { background: '#fff', borderRadius: '10px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' }
  const labelStyle = { fontSize: '12px', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '6px' }
  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }
  const hintStyle  = { fontSize: '11px', color: '#6b7280', marginTop: '4px' }

  if (!cfg) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>

  const selectedRoles = cfg.recipient_roles || []
  const selectedLabels = REMINDER_ROLES.filter(r => selectedRoles.includes(r.value)).map(r => r.label)
  const selectedTzOption = TIMEZONE_OPTIONS.find(o => o.tz === cfg.timezone) || TIMEZONE_OPTIONS.find(o => o.tz === 'UTC')

  return (
    <div style={{ maxWidth: '700px', padding: '28px 0' }}>

      {/* Enable toggle */}
      <div style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>Overdue Inspection Reminders</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Automatically notify selected stakeholders when inspection jobs are overdue. Admin is excluded from all reminders.</div>
          </div>
          <div
            onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
            style={{
              width: '44px', height: '24px', borderRadius: '9999px', cursor: 'pointer', transition: 'background 0.2s',
              background: cfg.enabled ? '#E8470F' : '#d1d5db', position: 'relative', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: '3px', left: cfg.enabled ? '22px' : '3px',
              width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: '700', color: cfg.enabled ? '#E8470F' : '#9ca3af' }}>
          {cfg.enabled ? '● Active' : '○ Inactive'}
        </div>
      </div>

      <form onSubmit={handleSave}>

        {/* Timezone selector */}
        <div style={panelStyle}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>Your Timezone</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '14px' }}>Select your country so all reminder times are set in your local time.</div>
          <select
            value={cfg.timezone || 'UTC'}
            onChange={e => setCfg(c => ({ ...c, timezone: e.target.value }))}
            style={{ ...inputStyle, maxWidth: '380px' }}
          >
            {TIMEZONE_OPTIONS.map(o => (
              <option key={o.tz} value={o.tz}>{o.label} ({o.offset})</option>
            ))}
          </select>
          {nowInTz && (
            <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '6px 14px' }}>
              <span style={{ fontSize: '18px', fontWeight: '800', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{nowInTz}</span>
              <span style={{ fontSize: '11px', color: '#16a34a' }}>current time in {selectedTzOption?.label}</span>
            </div>
          )}
        </div>

        {/* Recipient selection */}
        <div style={panelStyle}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>Who receives reminders?</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>Select one or more stakeholder groups. Each group will receive a consolidated email listing all overdue jobs.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {REMINDER_ROLES.map(opt => {
              const checked = selectedRoles.includes(opt.value)
              return (
                <label key={opt.value} onClick={() => toggleRole(opt.value)} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  borderRadius: '8px', border: `1.5px solid ${checked ? '#E8470F' : '#e5e7eb'}`,
                  background: checked ? '#fff7f5' : '#fafafa', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${checked ? '#E8470F' : '#d1d5db'}`,
                    background: checked ? '#E8470F' : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <span style={{ color: '#fff', fontSize: '11px', fontWeight: '900', lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: checked ? '#E8470F' : '#374151' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{opt.hint}</div>
                  </div>
                </label>
              )
            })}
          </div>
          {selectedRoles.length === 0 && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#dc2626' }}>⚠ No recipients selected — reminders will not be sent even if enabled.</div>
          )}
        </div>

        {/* Timing settings */}
        <div style={panelStyle}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '18px' }}>Timing &amp; Frequency</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>

            <div>
              <label style={labelStyle}>Send Time (HH:MM)</label>
              <input
                type="time"
                value={(cfg.send_time || '08:00').slice(0, 5)}
                onChange={e => setCfg(c => ({ ...c, send_time: e.target.value }))}
                style={inputStyle}
                required
              />
              <div style={hintStyle}>In your selected timezone ({selectedTzOption?.offset})</div>
            </div>

            <div>
              <label style={labelStyle}>First reminder after</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number" min="1" max="30"
                  value={cfg.min_days_overdue || 1}
                  onChange={e => setCfg(c => ({ ...c, min_days_overdue: parseInt(e.target.value) || 1 }))}
                  style={{ ...inputStyle, width: '70px' }}
                  required
                />
                <span style={{ fontSize: '13px', color: '#374151' }}>day(s) overdue</span>
              </div>
              <div style={hintStyle}>Days past inspection date before the first email</div>
            </div>

            <div>
              <label style={labelStyle}>Repeat every</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number" min="1" max="30"
                  value={cfg.frequency_days || 1}
                  onChange={e => setCfg(c => ({ ...c, frequency_days: parseInt(e.target.value) || 1 }))}
                  style={{ ...inputStyle, width: '70px' }}
                  required
                />
                <span style={{ fontSize: '13px', color: '#374151' }}>day(s)</span>
              </div>
              <div style={hintStyle}>Interval between repeat reminders</div>
            </div>
          </div>

          {/* Live preview */}
          {cfg.enabled && selectedRoles.length > 0 && (
            <div style={{ marginTop: '20px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', color: '#92400e' }}>
              <strong>Preview: </strong>
              First reminder at <strong>{(cfg.send_time || '08:00').slice(0, 5)} {selectedTzOption?.label}</strong>,
              sent <strong>{cfg.min_days_overdue} day(s)</strong> after inspection date is missed,
              then repeated every <strong>{cfg.frequency_days} day(s)</strong>.
              Recipients: <strong>{selectedLabels.join(', ')}</strong>.
            </div>
          )}
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: '7px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button type="submit" disabled={saving} style={{
            background: '#1C1208', color: '#fff', padding: '10px 24px', borderRadius: '8px',
            border: 'none', fontWeight: '700', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && <span style={{ fontSize: '13px', color: '#15803d', fontWeight: '700' }}>✓ Saved</span>}
        </div>
      </form>

      {/* Recent reminder log */}
      {log.length > 0 && (
        <div style={{ ...panelStyle, marginTop: '24px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '14px' }}>Recent Reminder Log</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Job Ref', 'Supplier', 'Inspection Date', 'Reminder Sent At'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: '#64748b', borderBottom: '1px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 20).map(l => (
                <tr key={l.log_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: '700', color: '#E8470F' }}>{l.job_ref}</td>
                  <td style={{ padding: '8px 12px', color: '#374151' }}>{l.supplier_name}</td>
                  <td style={{ padding: '8px 12px', color: '#374151' }}>{l.inspection_date ? new Date(l.inspection_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{new Date(l.sent_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ScorecardConfigTab() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/scorecard/config').then(r => { setCfg(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const weightTotal = cfg ? (+cfg.weight_complaints + +cfg.weight_claims + +cfg.weight_failures) : 100

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }))

  const handleSave = async (e) => {
    e.preventDefault()
    if (Math.abs(weightTotal - 100) > 0.01) { setMsg('Weights must sum to 100'); return }
    setSaving(true); setMsg('')
    try {
      await client.put('/scorecard/config', cfg)
      setMsg('✅ Configuration saved successfully')
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.error || err.message))
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: '40px', color: '#6b7280' }}>Loading…</div>
  if (!cfg) return <div style={{ padding: '40px', color: '#dc2626' }}>Failed to load scorecard config.</div>

  const field = (label, key, opts = {}) => (
    <div key={key} style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>{label}</label>
      <input
        type="number"
        value={cfg[key] ?? ''}
        onChange={e => set(key, e.target.value)}
        step={opts.step ?? '0.01'}
        min={opts.min ?? '0'}
        max={opts.max}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '14px' }}
      />
      {opts.hint && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>{opts.hint}</div>}
    </div>
  )

  return (
    <form onSubmit={handleSave}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>

        {/* Component Weights */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Component Weights</h3>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>Must sum to exactly 100%</p>
          {field('Customer Complaints Weight (%)', 'weight_complaints', { hint: 'Default: 50%' })}
          {field('Claims Weight (%)', 'weight_claims', { hint: 'Default: 40%' })}
          {field('Inspection Failures Weight (%)', 'weight_failures', { hint: 'Default: 10%' })}
          <div style={{
            padding: '10px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '700',
            background: Math.abs(weightTotal - 100) < 0.01 ? '#dcfce7' : '#fee2e2',
            color: Math.abs(weightTotal - 100) < 0.01 ? '#15803d' : '#b91c1c',
          }}>
            Total: {(+cfg.weight_complaints + +cfg.weight_claims + +cfg.weight_failures).toFixed(1)}% {Math.abs(weightTotal - 100) < 0.01 ? '✓' : '— must equal 100'}
          </div>
        </div>

        {/* Grade Thresholds */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Grade Thresholds</h3>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>Minimum score (inclusive) for each grade</p>
          {field('Excellent — minimum score', 'grade_excellent', { hint: 'Default: 85' })}
          {field('Good — minimum score', 'grade_good', { hint: 'Default: 70' })}
          {field('Average — minimum score', 'grade_average', { hint: 'Default: 50. Below this = Needs Improvement' })}
          <div style={{ fontSize: '12px', color: '#6b7280', background: '#f8fafc', padding: '10px', borderRadius: '7px', lineHeight: 1.6 }}>
            <span style={{ color: '#15803d', fontWeight: '700' }}>●</span> Excellent ≥ {cfg.grade_excellent}<br />
            <span style={{ color: '#1d4ed8', fontWeight: '700' }}>●</span> Good ≥ {cfg.grade_good}<br />
            <span style={{ color: '#b45309', fontWeight: '700' }}>●</span> Average ≥ {cfg.grade_average}<br />
            <span style={{ color: '#b91c1c', fontWeight: '700' }}>●</span> Needs Improvement &lt; {cfg.grade_average}
          </div>
        </div>

        {/* Complaint Severity */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Complaint Severity Weights</h3>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>Multiplier applied per complaint by severity level</p>
          {field('Critical severity multiplier', 'severity_critical', { hint: 'Default: 4× — most severe' })}
          {field('High severity multiplier', 'severity_high', { hint: 'Default: 2×' })}
          {field('Medium severity multiplier', 'severity_medium', { hint: 'Default: 1×' })}
          {field('Low severity multiplier', 'severity_low', { hint: 'Default: 0.5×' })}
        </div>

        {/* Advanced Settings */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#111827', margin: '0 0 4px' }}>Advanced Settings</h3>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>Fine-tune penalty and data thresholds</p>
          {field('Resolved complaint/claim penalty factor', 'resolved_penalty_factor', { hint: '0.5 = resolved issues carry 50% of the normal penalty', max: '1', step: '0.05' })}
          {field('Claims: full deduction at % of PO value', 'claims_full_deduction_pct', { hint: 'E.g. 10 = if claims reach 10% of PO value, full claims deduction applied' })}
          {field('Time decay — months before older issues decay', 'time_decay_months', { hint: 'Default: 12 months', step: '1', min: '1' })}
          {field('Time decay factor (fraction of original weight)', 'time_decay_factor', { hint: '0.5 = issues older than threshold carry 50% weight', max: '1', step: '0.05' })}
          {field('Minimum inspections to show a score', 'min_inspections', { hint: 'Suppliers with fewer inspections show "Insufficient Data"', step: '1', min: '1' })}
        </div>
      </div>

      <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          type="submit" disabled={saving}
          style={{ padding: '10px 28px', background: '#1C1208', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
        {msg && <span style={{ fontSize: '13px', color: msg.startsWith('✅') ? '#15803d' : '#dc2626' }}>{msg}</span>}
        {cfg.updated_at && <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: 'auto' }}>Last updated: {new Date(cfg.updated_at).toLocaleString()}</span>}
      </div>
    </form>
  )
}

export default function AdminMastersPage() {
  const { t } = useLanguage()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'Suppliers')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState('')
  const [bulkMsg, setBulkMsg] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const fileRef = useRef()
  const [editingCode, setEditingCode] = useState(null)
  const [masterFilters, setMasterFilters] = useState({})
  const setMasterFilter = (key, value) => setMasterFilters(prev => ({ ...prev, [key]: value }))
  const clearMasterFilters = () => setMasterFilters({})
  const [buyers, setBuyers] = useState([])
  const [lineItems, setLineItems] = useState([EMPTY_LINE_ITEM()])

  useEffect(() => { getBuyers().then(r => setBuyers(r.data || [])).catch(() => {}) }, [])

  const handleEditRow = (row) => {
    setForm(Object.fromEntries(cfg.fields.map(f => [f.key, Array.isArray(row[f.key]) ? row[f.key].join(', ') : (row[f.key] ?? '')])))
    setEditingCode(row[cfg.codeKey])
    setFormMsg('')
    if (activeTab === 'POs' && Array.isArray(row.line_items) && row.line_items.length > 0) {
      setLineItems(row.line_items.map(li => ({ item_code: li.item_code || '', quantity: li.quantity ?? '', unit_price: li.unit_price ?? '' })))
    } else if (activeTab === 'POs') {
      setLineItems([EMPTY_LINE_ITEM()])
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEdit = () => {
    setForm(emptyForm(cfg.fields))
    setEditingCode(null)
    setFormMsg('')
    setLineItems([EMPTY_LINE_ITEM()])
  }

  const cfg = CONFIG[activeTab] || null
  const isHistoryTab = !cfg

  const load = () => {
    if (!cfg) return
    setLoading(true)
    cfg.get().then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!cfg) return
    setForm(emptyForm(cfg.fields))
    setFormMsg('')
    setBulkMsg('')
    setMasterFilters({})
    setEditingCode(null)
    setLineItems([EMPTY_LINE_ITEM()])
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [activeTab])

  const handleSingle = async (e) => {
    e.preventDefault()
    setSaving(true); setFormMsg('')
    try {
      const payload = activeTab === 'POs'
        ? { ...form, line_items: lineItems.filter(li => li.item_code).map((li, i) => ({ item_code: li.item_code, quantity: Number(li.quantity) || 1, unit_price: Number(li.unit_price) || 0, line_no: i + 1 })) }
        : form
      await cfg.saveSingle(payload)
      setFormMsg('Saved successfully!')
      setForm(emptyForm(cfg.fields))
      setLineItems([EMPTY_LINE_ITEM()])
      setEditingCode(null)
      load()
    } catch (err) {
      setFormMsg(err?.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  const handleBulk = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setBulkLoading(true); setBulkMsg('')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (rows.length === 0) { setBulkMsg('No data rows found in file'); setBulkLoading(false); return }
      const res = await cfg.bulk(rows)
      const { inserted, skipped } = res.data
      setBulkMsg(`Inserted ${inserted} new record(s)${skipped ? `, skipped ${skipped} duplicate(s)` : ''}.`)
      load()
    } catch (err) {
      setBulkMsg(err?.response?.data?.error || 'Bulk upload failed')
    } finally {
      setBulkLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const colKeys = cfg ? cfg.fields.map(f => f.key) : []

  const hasActiveMasterFilter = Object.values(masterFilters).some(v => v && v !== '')
  const filteredRows = hasActiveMasterFilter
    ? rows.filter(row => cfg.fields.every(f => {
        const fv = masterFilters[f.key]
        if (!fv) return true
        return String(row[f.key] ?? '').toLowerCase().includes(fv.toLowerCase())
      }))
    : rows

  const downloadData = () => {
    const data = filteredRows.map(row =>
      Object.fromEntries(cfg.fields.map(f => [f.label, Array.isArray(row[f.key]) ? row[f.key].join(', ') : (row[f.key] ?? '')]))
    )
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, activeTab)
    XLSX.writeFile(wb, `${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const downloadTemplate = () => {
    let fieldKeys = cfg.fields.filter(f => f.type !== 'buyer_select').map(f => f.key)
    let exampleRow = Object.fromEntries(cfg.fields.filter(f => f.type !== 'buyer_select').map(f => [f.key, f.placeholder || '']))
    if (activeTab === 'POs') {
      fieldKeys = ['po_no', 'supplier_code', 'item_code', 'quantity', 'unit_price', 'order_date', 'status', 'buyer_id']
      exampleRow = { po_no: 'PO-2026-001', supplier_code: 'SUP-001', item_code: 'ITEM-001', quantity: '100', unit_price: '25.50', order_date: '2026-01-15', status: 'open', buyer_id: '' }
    }
    const headers = Object.fromEntries(fieldKeys.map(k => [k, '']))
    const example = exampleRow
    const ws = XLSX.utils.json_to_sheet([headers, example])
    // Bold the header row comment
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, `${activeTab}_bulk_template.xlsx`)
  }

  return (
    <div className="page">
      <Navbar />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: '700', color: '#111827' }}>{t('admin_masters_title')}</h1>
        <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '14px' }}>{t('admin_masters_subtitle') || 'Manage reference data used across the system'}</p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid #e5e7eb', flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '10px 20px', fontSize: '14px', fontWeight: activeTab === tab ? '700' : '500',
              color: activeTab === tab ? '#1C1208' : '#6b7280',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid #1C1208' : '2px solid transparent',
              marginBottom: '-2px', whiteSpace: 'nowrap'
            }}>{tab}</button>
          ))}
        </div>

        {activeTab === 'Reminders' ? (
          <RemindersTab />
        ) : activeTab === 'Scorecard Config' ? (
          <ScorecardConfigTab />
        ) : (activeTab === 'Customer Complaints' || activeTab === 'Claims') ? (
          <HistoryMastersTab type={activeTab} />
        ) : (

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
          {/* Left: Forms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Single Entry */}
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700', color: '#111827' }}>
                {editingCode ? `Editing: ${editingCode}` : (t('admin_single_entry') || 'Add / Update Single Entry')}
              </h3>
              <form onSubmit={handleSingle}>
                {cfg.fields.map(f => (
                  <div key={f.key} style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '3px' }}>
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {f.type === 'buyer_select' ? (
                      <select
                        value={form[f.key] || ''}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: '#fff' }}
                      >
                        <option value=''>— No buyer assigned —</option>
                        {buyers.map(b => <option key={b.user_id} value={b.user_id}>{b.name} ({b.email})</option>)}
                      </select>
                    ) : (
                      <input
                        type={f.type || 'text'}
                        value={form[f.key] || ''}
                        onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        required={f.required}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                ))}
                {activeTab === 'POs' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Line Items *</label>
                    {lineItems.map((li, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '4px', marginBottom: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={li.item_code}
                          onChange={e => setLineItems(prev => prev.map((x, i) => i === idx ? { ...x, item_code: e.target.value } : x))}
                          placeholder="Item Code"
                          style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '12px' }}
                        />
                        <input
                          type="number"
                          value={li.quantity}
                          onChange={e => setLineItems(prev => prev.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))}
                          placeholder="Qty"
                          style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '12px' }}
                        />
                        <input
                          type="number"
                          value={li.unit_price}
                          onChange={e => setLineItems(prev => prev.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))}
                          placeholder="Price"
                          style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '12px' }}
                        />
                        <button type="button" onClick={() => setLineItems(prev => prev.length === 1 ? [EMPTY_LINE_ITEM()] : prev.filter((_, i) => i !== idx))}
                          style={{ padding: '5px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>×</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setLineItems(prev => [...prev, EMPTY_LINE_ITEM()])}
                      style={{ fontSize: '12px', color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontWeight: '600' }}>+ Add Item</button>
                  </div>
                )}
                {formMsg && (
                  <p style={{ margin: '0 0 10px', fontSize: '13px', color: formMsg.includes('success') ? '#059669' : '#dc2626' }}>{formMsg}</p>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" disabled={saving} style={{
                    flex: 1, backgroundColor: saving ? '#93c5fd' : '#1C1208', color: '#fff',
                    border: 'none', padding: '9px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer'
                  }}>
                    {saving ? t('common_saving') : t('admin_save')}
                  </button>
                  {editingCode && (
                    <button type="button" onClick={handleCancelEdit} style={{
                      flex: 1, backgroundColor: '#f1f5f9', color: '#374151',
                      border: '1px solid #d1d5db', padding: '9px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                    }}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Bulk Upload */}
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '700', color: '#111827' }}>{t('admin_bulk_upload') || 'Bulk Upload'}</h3>
              <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#6b7280' }}>
                {t('masters_bulk_instructions') || 'Upload a CSV or Excel file. First row must be headers matching:'}
              </p>
              <code style={{ fontSize: '11px', color: '#374151', display: 'block', marginBottom: '10px', wordBreak: 'break-all' }}>{colKeys.join(', ')}</code>

              {/* Download blank template */}
              <button
                onClick={downloadTemplate}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', width: '100%', justifyContent: 'center',
                  padding: '7px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                  backgroundColor: '#eff6ff', color: '#1d4ed8',
                  border: '1px solid #bfdbfe', cursor: 'pointer', marginBottom: '8px',
                }}
              >
                📄 {t('masters_download_template') || 'Download Blank Template'}
              </button>

              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleBulk}
                disabled={bulkLoading}
                style={{ display: 'none' }}
                id="bulk-file"
              />
              <label htmlFor="bulk-file" style={{
                display: 'block', textAlign: 'center', padding: '10px', borderRadius: '7px', border: '2px dashed #d1d5db',
                cursor: bulkLoading ? 'not-allowed' : 'pointer', fontSize: '13px', color: '#6b7280',
                backgroundColor: bulkLoading ? '#f9fafb' : '#fff'
              }}>
                {bulkLoading ? t('common_saving') : (t('admin_bulk_select') || 'Click to select CSV / Excel file')}
              </label>
              {bulkMsg && (
                <p style={{ margin: '10px 0 0', fontSize: '13px', color: bulkMsg.includes('Inserted') || bulkMsg.includes('success') ? '#059669' : '#dc2626' }}>{bulkMsg}</p>
              )}
            </div>
          </div>

          {/* Right: Table */}
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>{activeTab}</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filteredRows.length}{hasActiveMasterFilter ? ` of ${rows.length}` : ''} {t('common_records')}</span>
              </div>
              <button
                onClick={downloadData}
                disabled={rows.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                  backgroundColor: rows.length === 0 ? '#f1f5f9' : '#f0fdf4',
                  color: rows.length === 0 ? '#94a3b8' : '#15803d',
                  border: `1px solid ${rows.length === 0 ? '#e2e8f0' : '#86efac'}`,
                  cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                ⬇ {t('common_download') || 'Download Data'}
              </button>
            </div>
            {loading ? (
              <p style={{ padding: '24px', color: '#6b7280', fontSize: '14px' }}>{t('common_loading')}</p>
            ) : rows.length === 0 ? (
              <p style={{ padding: '24px', color: '#9ca3af', fontSize: '14px', textAlign: 'center' }}>{t('common_no_data')}</p>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      {cfg.fields.map(f => (
                        <th key={f.key} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            {f.label}
                            <ColumnFilterDropdown
                              colKey={f.key}
                              data={rows}
                              value={masterFilters[f.key] || []}
                              onChange={v => setMasterFilter(f.key, v)}
                              label={f.label}
                            />
                          </span>
                        </th>
                      ))}
                      {activeTab === 'POs' && (<>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Item Code</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Qty</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>Unit Price</th>
                      </>)}
                      <th style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: editingCode === row[cfg.codeKey] ? '#fffbeb' : 'transparent' }}>
                        {cfg.fields.map(f => (
                          <td key={f.key} style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                            {f.type === 'buyer_select'
                              ? (row.buyer_name || '—')
                              : f.type === 'date'
                                ? (row[f.key] ? row[f.key].slice(0, 10) : '—')
                                : Array.isArray(row[f.key]) ? (row[f.key].join(', ') || '—') : (row[f.key] ?? '—')}
                          </td>
                        ))}
                        {activeTab === 'POs' && (<>
                          <td style={{ padding: '10px 14px', color: '#374151', fontSize: '12px' }}>
                            {Array.isArray(row.line_items) && row.line_items.length > 0
                              ? row.line_items.map(li => li.item_code).join(', ')
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#374151', fontSize: '12px', textAlign: 'right' }}>
                            {Array.isArray(row.line_items) && row.line_items.length > 0
                              ? row.line_items.map(li => li.quantity).join(', ')
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#374151', fontSize: '12px', textAlign: 'right' }}>
                            {Array.isArray(row.line_items) && row.line_items.length > 0
                              ? row.line_items.map(li => `$${Number(li.unit_price || 0).toFixed(2)}`).join(', ')
                              : '—'}
                          </td>
                        </>)}
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => handleEditRow(row)}
                            style={{
                              padding: '4px 12px', fontSize: '12px', fontWeight: '600',
                              background: '#f0f9ff', color: '#0369a1',
                              border: '1px solid #bae6fd', borderRadius: '6px', cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        )} {/* end standard tabs */}
      </div>
    </div>
  )
}
