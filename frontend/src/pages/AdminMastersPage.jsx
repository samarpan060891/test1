import React, { useEffect, useState, useRef } from 'react'
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

  const cfg = CONFIG[activeTab]

  const load = () => {
    setLoading(true)
    cfg.get().then(r => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false))
  }

  useEffect(() => {
    setForm(emptyForm(cfg.fields))
    setFormMsg('')
    setBulkMsg('')
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
              color: activeTab === tab ? '#1e40af' : '#6b7280',
              backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid #1e40af' : '2px solid transparent',
              marginBottom: '-2px'
            }}>{tab}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
          {/* Left: Forms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Single Entry */}
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '700', color: '#111827' }}>{t('admin_single_entry') || 'Add / Update Single Entry'}</h3>
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
                <button type="submit" disabled={saving} style={{
                  width: '100%', backgroundColor: saving ? '#93c5fd' : '#1e40af', color: '#fff',
                  border: 'none', padding: '9px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer'
                }}>
                  {saving ? t('common_saving') : t('admin_save')}
                </button>
              </form>
            </div>

            {/* Bulk Upload */}
            <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '700', color: '#111827' }}>{t('admin_bulk_upload') || 'Bulk Upload'}</h3>
              <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6b7280' }}>
                Upload a CSV or Excel file. First row must be headers matching:<br />
                <code style={{ fontSize: '11px', color: '#374151' }}>{colKeys.join(', ')}</code>
              </p>
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
                <p style={{ margin: '10px 0 0', fontSize: '13px', color: bulkMsg.includes('success') ? '#059669' : '#dc2626' }}>{bulkMsg}</p>
              )}
            </div>
          </div>

          {/* Right: Table */}
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>{activeTab}</span>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>{rows.length} records</span>
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
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        {cfg.fields.map(f => (
                          <td key={f.key} style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                            {row[f.key] ?? '—'}
                          </td>
                        ))}
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
