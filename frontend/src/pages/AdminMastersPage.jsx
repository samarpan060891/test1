import React, { useEffect, useState, useRef } from 'react'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import * as XLSX from 'xlsx'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import {
  getSuppliers, saveSingleSupplier, bulkSuppliers,
  getAgencies, saveSingleAgency, bulkAgencies,
  getItems, saveSingleItem, bulkItems,
  getPOs, saveSinglePO, bulkPOs
} from '../api/admin.js'

const TABS = ['Suppliers', 'Agencies', 'Items', 'POs']

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
  { key: 'item_code', label: 'Item Code', placeholder: 'ITM-001', required: true },
  { key: 'quantity', label: 'Quantity', placeholder: '500', required: false, type: 'number' },
  { key: 'unit_price', label: 'Unit Price (USD)', placeholder: '18.50', required: false, type: 'number' },
  { key: 'order_date', label: 'Order Date', placeholder: '', required: false, type: 'date' },
  { key: 'status', label: 'Status', placeholder: 'open', required: false },
]

const CONFIG = {
  Suppliers: { fields: SUPPLIER_FIELDS, get: getSuppliers, saveSingle: saveSingleSupplier, bulk: bulkSuppliers, codeKey: 'supplier_code', nameKey: 'name' },
  Agencies: { fields: AGENCY_FIELDS, get: getAgencies, saveSingle: saveSingleAgency, bulk: bulkAgencies, codeKey: 'agency_code', nameKey: 'name' },
  Items: { fields: ITEM_FIELDS, get: getItems, saveSingle: saveSingleItem, bulk: bulkItems, codeKey: 'item_code', nameKey: 'name' },
  POs: { fields: PO_FIELDS, get: getPOs, saveSingle: saveSinglePO, bulk: bulkPOs, codeKey: 'po_no', nameKey: 'supplier_code' },
}

function emptyForm(fields) {
  return Object.fromEntries(fields.map(f => [f.key, '']))
}

export default function AdminMastersPage() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('Suppliers')
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

  const handleEditRow = (row) => {
    setForm(Object.fromEntries(cfg.fields.map(f => [f.key, row[f.key] ?? ''])))
    setEditingCode(row[cfg.codeKey])
    setFormMsg('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEdit = () => {
    setForm(emptyForm(cfg.fields))
    setEditingCode(null)
    setFormMsg('')
  }

  const cfg = CONFIG[activeTab]

  const load = () => {
    setLoading(true)
    cfg.get().then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false))
  }

  useEffect(() => {
    setForm(emptyForm(cfg.fields))
    setFormMsg('')
    setBulkMsg('')
    setMasterFilters({})
    setEditingCode(null)
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [activeTab])

  const handleSingle = async (e) => {
    e.preventDefault()
    setSaving(true); setFormMsg('')
    try {
      await cfg.saveSingle(form)
      setFormMsg('Saved successfully!')
      setForm(emptyForm(cfg.fields))
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

  const colKeys = cfg.fields.map(f => f.key)

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
      Object.fromEntries(cfg.fields.map(f => [f.label, row[f.key] ?? '']))
    )
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, activeTab)
    XLSX.writeFile(wb, `${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const downloadTemplate = () => {
    const headers = Object.fromEntries(cfg.fields.map(f => [f.key, '']))
    const example = Object.fromEntries(cfg.fields.map(f => [f.key, f.placeholder || '']))
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
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid #e5e7eb' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '10px 20px', fontSize: '14px', fontWeight: activeTab === tab ? '700' : '500',
              color: activeTab === tab ? '#1C1208' : '#6b7280',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid #1C1208' : '2px solid transparent',
              marginBottom: '-2px'
            }}>{tab}</button>
          ))}
        </div>

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
                    <input
                      type={f.type || 'text'}
                      value={form[f.key] || ''}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      required={f.required}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
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
                      <th style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: editingCode === row[cfg.codeKey] ? '#fffbeb' : 'transparent' }}>
                        {cfg.fields.map(f => (
                          <td key={f.key} style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                            {row[f.key] ?? '—'}
                          </td>
                        ))}
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
      </div>
    </div>
  )
}
