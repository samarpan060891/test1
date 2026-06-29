import React, { useEffect, useState, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getDocuments, uploadDocument, reviewDocument, getDocumentFile, markNotApplicable, internalUploadDocument } from '../api/documents.js'

const DOC_TYPES = [
  { key: 'product_image',                label: 'Product Image' },
  { key: 'bill_of_materials',            label: 'Bill of Materials' },
  { key: 'msds',                         label: 'Materials Safety Data Sheet' },
  { key: 'swatch_details',               label: 'Swatch Details' },
  { key: 'test_reports',                 label: 'Test Reports' },
  { key: 'cb_reports',                   label: 'CB Reports' },
  { key: 'line_drawings',                label: 'Line Drawings' },
  { key: 'assembly_instruction_manual',  label: 'Assembly Instruction Manual' },
  { key: 'user_care_manual',             label: 'User Care Manual' },
  { key: 'barcode',                      label: 'Barcode' },
  { key: 'carton_artwork_shipping_mark', label: 'Carton Artwork & Shipping Mark' },
  { key: 'hs_code',                      label: 'HS Code' },
  { key: 'metrological_data',            label: 'Metrological Data (L×B×H & Net Weight)' },
]

const STATUS_META = {
  pending_upload:   { label: 'Pending Upload',   bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  pending_approval: { label: 'Pending Approval', bg: '#fefce8', color: '#92400e', border: '#fde68a' },
  qa_approved:      { label: 'Pending with Buying', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  approved:         { label: 'Approved',           bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  rejected:         { label: 'Rejected',           bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  not_applicable:   { label: 'Not Applicable',    bg: '#f5f5f5', color: '#9ca3af', border: '#e5e7eb' },
}

// ─── Supplier Upload View ─────────────────────────────────────────────────────
function SupplierUploadView({ groups, onRefresh }) {
  const [selectedKey, setSelectedKey] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [manageOpen, setManageOpen] = useState(false) // right slide panel open
  const [stagedFiles, setStagedFiles] = useState({}) // doc_type → File
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [toast, setToast] = useState('')
  const [panel, setPanel] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const fileRefs = useRef({})

  const openManage = (gKey) => {
    setSelectedKey(gKey)
    setStagedFiles({})
    setSubmitMsg('')
    setManageOpen(true)
  }
  const closeManage = () => { setManageOpen(false); setSubmitMsg('') }

  const getGroupStatus = (g) => {
    const docs = g.docs
    if (docs.some(d => d.status === 'rejected')) return 'rejected'
    if (docs.every(d => d.status === 'approved' || d.status === 'not_applicable')) return 'complete'
    if (docs.some(d => d.status === 'qa_approved')) return 'pendingBuying'
    if (docs.some(d => d.status === 'pending_approval')) return 'pendingQA'
    return 'actionNeeded'
  }

  const statCards = [
    { key: 'all',          label: 'ALL ITEMS',       color: '#E8470F' },
    { key: 'actionNeeded', label: 'ACTION NEEDED',   color: '#dc2626' },
    { key: 'pendingQA',    label: 'PENDING QA',      color: '#d97706' },
    { key: 'pendingBuying',label: 'PENDING BUYING',  color: '#0284c7' },
    { key: 'complete',     label: 'COMPLETE',        color: '#15803d' },
    { key: 'rejected',     label: 'REJECTED',        color: '#dc2626' },
  ]

  const statCounts = statCards.reduce((acc, c) => {
    acc[c.key] = c.key === 'all' ? groups.length : groups.filter(g => getGroupStatus(g) === c.key).length
    return acc
  }, {})

  const filteredGroups = activeFilter === 'all' ? groups : groups.filter(g => getGroupStatus(g) === activeFilter)

  const handleFilterClick = (key) => {
    setActiveFilter(key)
    setSelectedKey('')
    setStagedFiles({})
    setSubmitMsg('')
  }

  const group = groups.find(g => `${g.item_code}::${g.supplier_code}` === selectedKey) || null
  const docsMap = {}
  if (group) group.docs.forEach(d => { docsMap[d.doc_type] = d })

  const handleSelectFile = (docType, file) => {
    if (!file) return
    setStagedFiles(p => ({ ...p, [docType]: file }))
    setSubmitMsg('')
  }

  const handleRemoveStaged = (docType) => {
    setStagedFiles(p => { const n = { ...p }; delete n[docType]; return n })
    if (fileRefs.current[docType]) fileRefs.current[docType].value = ''
  }

  const handleMarkNA = async (docType) => {
    if (!group) return
    try {
      await markNotApplicable({ item_code: group.item_code, supplier_code: group.supplier_code, doc_type: docType })
      onRefresh()
    } catch (e) {
      setSubmitMsg(e?.response?.data?.error || 'Failed to mark N/A')
    }
  }

  const handleSubmitAll = async () => {
    if (!group) return
    // Validate: every doc must be attached or N/A
    const unresolved = DOC_TYPES.filter(({ key }) => {
      const status = docsMap[key]?.status || 'pending_upload'
      const isResolved = status !== 'pending_upload' && status !== 'rejected'
      const isStaged = !!stagedFiles[key]
      return !isResolved && !isStaged
    })
    if (unresolved.length > 0) {
      setSubmitMsg(`Please attach or mark N/A: ${unresolved.map(d => d.label).join(', ')}`)
      return
    }
    if (Object.keys(stagedFiles).length === 0) {
      // No new files — N/A marks already saved, just confirm to user
      setSubmitMsg('Document status updated. N/A selections have been saved.')
      setToast('Document status updated successfully.')
      setTimeout(() => setToast(''), 5000)
      return
    }
    setSubmitting(true); setSubmitMsg('')
    let ok = 0, fail = 0
    for (const [docType, file] of Object.entries(stagedFiles)) {
      try {
        const fd = new FormData()
        fd.append('item_code', group.item_code)
        fd.append('supplier_code', group.supplier_code)
        fd.append('doc_type', docType)
        fd.append('file', file)
        await uploadDocument(fd)
        ok++
      } catch { fail++ }
    }
    setStagedFiles({})
    const msg = fail === 0
      ? `${ok} document${ok > 1 ? 's' : ''} submitted successfully and sent for approval.`
      : `${ok} uploaded, ${fail} failed.`
    setSubmitMsg(msg)
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
    setSubmitting(false)
    onRefresh()
  }

  const openViewPanel = async (doc) => {
    if (!doc?.id || !doc?.file_name) return
    setPanel(doc)
    if (fileUrl) { URL.revokeObjectURL(fileUrl); setFileUrl(null) }
    setFileType(null)
    setPanelLoading(true)
    try {
      const res = await getDocumentFile(doc.id)
      setFileUrl(URL.createObjectURL(res.data))
      setFileType(res.data.type)
    } catch {}
    finally { setPanelLoading(false) }
  }

  const pendingCount = Object.keys(stagedFiles).length

  return (
    <div>
      {/* Status summary cards */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {statCards.map(card => {
          const isActive = activeFilter === card.key
          const count = statCounts[card.key]
          return (
            <div key={card.key} onClick={() => handleFilterClick(card.key)} style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
              padding: '12px 18px', cursor: 'pointer', flex: '1', minWidth: '100px',
              borderTop: `3px solid ${isActive ? card.color : '#e5e7eb'}`,
              boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s', opacity: count === 0 ? 0.5 : 1,
            }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                {card.label}
              </div>
              <div style={{ fontSize: '26px', fontWeight: '700', color: card.color }}>{count}</div>
            </div>
          )
        })}
      </div>

      {/* Item selector */}
      <div style={{ background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
          Select Item to Upload Documents
          {activeFilter !== 'all' && (
            <span style={{ marginLeft: '8px', fontSize: '11px', color: '#64748b', fontWeight: '400' }}>
              — showing {statCards.find(c => c.key === activeFilter)?.label} items
              <button onClick={() => handleFilterClick('all')} style={{ marginLeft: '6px', background: 'none', border: 'none', color: '#E8470F', fontSize: '11px', cursor: 'pointer', padding: 0 }}>× clear</button>
            </span>
          )}
        </label>
        <select
          value={selectedKey}
          onChange={e => { if (e.target.value) openManage(e.target.value); else setSelectedKey('') }}
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff', color: '#111827' }}
        >
          <option value=''>— Choose an item —</option>
          {filteredGroups.map(g => {
            const statusLabel = { actionNeeded: '⚠ Action Needed', pendingQA: '🕐 Pending QA', pendingBuying: '🔵 Pending Buying', complete: '✅ Complete', rejected: '❌ Rejected' }[getGroupStatus(g)] || ''
            const uploaded = g.docs.filter(d => d.status && d.status !== 'pending_upload').length
            return (
              <option key={`${g.item_code}::${g.supplier_code}`} value={`${g.item_code}::${g.supplier_code}`}>
                {g.item_name} ({g.item_code}) — {uploaded}/{DOC_TYPES.length} submitted · {statusLabel}
              </option>
            )
          })}
        </select>
      </div>

      {/* Right slide panel for managing a selected item */}
      {manageOpen && group && (
        <>
          <div onClick={closeManage} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }} />
          <div style={{
            position: 'fixed', top: '52px', right: 0, width: '520px', maxWidth: '100vw',
            height: 'calc(100vh - 52px)', background: '#f8fafc', boxShadow: '-4px 0 28px rgba(0,0,0,0.15)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
          }}>
            {/* Panel header */}
            <div style={{ background: '#1C1208', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '12px', color: '#d4c5a0', marginBottom: '2px' }}>{group.supplier_name}</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>{group.item_name}</div>
                <div style={{ fontSize: '11px', color: '#d4c5a0', marginTop: '2px' }}>{group.item_code}</div>
              </div>
              <button onClick={closeManage} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '13px', fontWeight: '600', padding: '5px 14px', borderRadius: '6px', cursor: 'pointer' }}>✕ Close</button>
            </div>

            {/* Status message */}
            {submitMsg && (
              <div style={{ padding: '10px 16px', margin: '12px 16px 0', borderRadius: '8px', fontSize: '13px', fontWeight: '600', flexShrink: 0,
                background: submitMsg.includes('failed') ? '#fef2f2' : '#f0fdf4',
                color: submitMsg.includes('failed') ? '#dc2626' : '#15803d',
              }}>{submitMsg}</div>
            )}

            {/* Doc list — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {DOC_TYPES.map(({ key, label }, idx) => {
                  const doc = docsMap[key]
                  const status = doc?.status || 'pending_upload'
                  const meta = STATUS_META[status]
                  const staged = stagedFiles[key]

                  return (
                    <div key={key} style={{
                      background: '#fff', borderRadius: '10px', padding: '12px 16px',
                      border: staged ? '2px solid #1C1208' : '1px solid #e5e7eb',
                      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                      <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: '500', color: '#111827', minWidth: '140px' }}>{label}</span>
                      <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '2px 8px', borderRadius: '9999px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                        {meta.label}
                      </span>
                      {doc?.file_name && (
                        <button onClick={() => openViewPanel(doc)} style={{ padding: '4px 10px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>👁 View</button>
                      )}
                      {status !== 'not_applicable' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {staged ? (
                            <>
                              <span style={{ fontSize: '11px', color: '#1C1208', fontWeight: '600', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {staged.name}</span>
                              <button onClick={() => handleRemoveStaged(key)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', padding: '0' }}>×</button>
                            </>
                          ) : (
                            <>
                              <input type="file" id={`file-${key}`} ref={el => { fileRefs.current[key] = el }} style={{ display: 'none' }} onChange={e => handleSelectFile(key, e.target.files[0])} accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx,.dwg,.ai,.eps,.zip,.csv" />
                              <label htmlFor={`file-${key}`} style={{ padding: '4px 12px', background: '#fafafa', color: '#374151', border: '1px dashed #d1d5db', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Attach</label>
                              {(status === 'pending_upload' || status === 'rejected') && (
                                <button onClick={() => handleMarkNA(key)} style={{ padding: '4px 8px', background: '#f5f5f5', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>N/A</button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {status === 'not_applicable' && (
                        <button onClick={() => handleMarkNA(key)} style={{ padding: '4px 10px', background: 'none', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}>Undo N/A</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Panel footer — submit button */}
            <div style={{ background: '#1C1208', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>
                {pendingCount > 0 ? <strong style={{ color: '#fff' }}>📎 {pendingCount} file{pendingCount > 1 ? 's' : ''} ready</strong> : 'Attach files or mark N/A'}
              </span>
              <button onClick={handleSubmitAll} disabled={submitting} style={{
                padding: '10px 24px', background: submitting ? '#475569' : '#E8470F',
                color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
                {submitting ? 'Submitting...' : pendingCount > 0 ? 'Submit for Approval' : group.docs.some(d => d.status !== 'pending_upload') ? 'Re-Submit for Approval' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* All items summary table */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ background: '#fff', borderRadius: '10px 10px 0 0', border: '1px solid #e5e7eb', borderBottom: 'none', padding: '12px 20px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>All Items Summary</span>
        </div>
        <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>ITEM</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>SUBMITTED</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', color: '#d97706', fontWeight: '600' }}>PENDING QA</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', color: '#0284c7', fontWeight: '600' }}>PENDING BUYING</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', color: '#15803d', fontWeight: '600' }}>APPROVED</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>REJECTED</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>STATUS</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b', fontWeight: '600' }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const gKey = `${g.item_code}::${g.supplier_code}`
                const pendingApproval = g.docs.filter(d => d.status === 'pending_approval').length
                const pendingBuying   = g.docs.filter(d => d.status === 'qa_approved').length
                const approved        = g.docs.filter(d => d.status === 'approved').length
                const rejected        = g.docs.filter(d => d.status === 'rejected').length
                const submitted       = g.docs.filter(d => d.status && d.status !== 'pending_upload').length
                const gStatus         = getGroupStatus(g)
                const statusMeta = {
                  actionNeeded:  { label: 'Action Needed',   bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
                  pendingQA:     { label: 'Pending QA',      bg: '#fefce8', color: '#92400e', border: '#fde68a' },
                  pendingBuying: { label: 'Pending Buying',  bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                  complete:      { label: 'Complete',        bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
                  rejected:      { label: 'Rejected',        bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
                }[gStatus] || { label: 'Pending', bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' }
                return (
                  <tr key={gKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ fontWeight: '600', color: '#1e293b' }}>{g.item_name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{g.item_code}</div>
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'center', color: '#374151', fontWeight: '600' }}>{submitted}/{DOC_TYPES.length}</td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      {pendingApproval > 0 ? <span style={{ background: '#fef9c3', color: '#92400e', border: '1px solid #fde68a', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{pendingApproval}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      {pendingBuying > 0 ? <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{pendingBuying}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      {approved > 0 ? <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{approved}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      {rejected > 0 ? <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{rejected}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      <span style={{ background: statusMeta.bg, color: statusMeta.color, border: `1px solid ${statusMeta.border}`, padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>{statusMeta.label}</span>
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => openManage(gKey)}
                        style={{ padding: '5px 14px', background: '#f1f5f9', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                      >Manage</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 60, background: toast.includes('failed') ? '#dc2626' : '#15803d',
          color: '#fff', padding: '14px 28px', borderRadius: '10px',
          fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
        }}>
          {toast.includes('failed') ? '⚠️' : '✅'} {toast}
        </div>
      )}

      {/* View panel */}
      {panel && (
        <>
          <div onClick={() => setPanel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: '52px', right: 0, width: '420px', height: 'calc(100vh - 52px)', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#1C1208', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#d4c5a0' }}>{DOC_TYPES.find(d => d.key === panel.doc_type)?.label}</div>
                <div style={{ fontSize: '14px', color: '#fff', fontWeight: '600' }}>{panel.file_name}</div>
              </div>
              <button onClick={() => setPanel(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {panelLoading ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div>
              ) : fileUrl ? (
                fileType?.startsWith('image/') ? (
                  <img src={fileUrl} alt="" style={{ width: '100%' }} />
                ) : fileType === 'application/pdf' ? (
                  <iframe src={fileUrl} style={{ width: '100%', height: '70vh', border: 'none' }} title="doc" />
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>📄 {panel.file_name}</div>
                )
              ) : null}
              {fileUrl && (
                <button
                  onClick={() => { const a = document.createElement('a'); a.href = fileUrl; a.download = panel.file_name; a.click() }}
                  style={{ marginTop: '12px', width: '100%', padding: '9px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '7px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                >⬇ Download</button>
              )}
              {panel.qa_remarks && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', borderRadius: '8px', fontSize: '13px', color: '#991b1b' }}>
                  <strong>QA Remarks:</strong> {panel.qa_remarks}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Reviewer / Admin View ────────────────────────────────────────────────────
function ReviewerView({ groups, role, onRefresh }) {
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [panelMode, setPanelMode] = useState(null) // null | 'list' | 'doc'
  const [listGroup, setListGroup] = useState(null)
  const [panel, setPanel] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [internalFile, setInternalFile] = useState(null)
  const [internalUploading, setInternalUploading] = useState(false)
  const internalFileRef = useRef(null)

  const canQAReview = ['qa', 'admin', 'imports', 'accounts'].includes(role)
  const canBuyingReview = role === 'buying'
  const canInternalUpload = ['admin', 'qa', 'buying'].includes(role)

  // Keep listGroup in sync with refreshed groups data
  useEffect(() => {
    if (!listGroup) return
    const updated = groups.find(g => g.item_code === listGroup.item_code && g.supplier_code === listGroup.supplier_code)
    if (updated) setListGroup(updated)
  }, [groups])

  const getGroupStats = (g) => {
    const docs = g.docs
    return {
      pendingApproval: docs.filter(d => d.status === 'pending_approval').length,
      pendingBuying:   docs.filter(d => d.status === 'qa_approved').length,
      approved:        docs.filter(d => d.status === 'approved').length,
      rejected:        docs.filter(d => d.status === 'rejected').length,
      na:              docs.filter(d => d.status === 'not_applicable').length,
      uploaded:        docs.filter(d => d.file_name).length,
    }
  }

  // Stat card counts
  const statCounts = {
    all:             groups.length,
    pendingApproval: groups.filter(g => getGroupStats(g).pendingApproval > 0).length,
    pendingBuying:   groups.filter(g => getGroupStats(g).pendingBuying > 0).length,
    approved:        groups.filter(g => getGroupStats(g).approved > 0).length,
    rejected:        groups.filter(g => getGroupStats(g).rejected > 0).length,
  }

  const statCards = [
    { key: 'all',             label: 'ALL ITEMS',       color: '#E8470F' },
    { key: 'pendingApproval', label: 'PENDING QA',      color: '#d97706' },
    { key: 'pendingBuying',   label: 'PENDING BUYING',  color: '#0284c7' },
    { key: 'approved',        label: 'APPROVED',        color: '#15803d' },
    { key: 'rejected',        label: 'REJECTED',        color: '#dc2626' },
  ]

  const filtered = groups.filter(g => {
    const q = search.toLowerCase()
    const matchSearch = !q || g.item_name?.toLowerCase().includes(q) || g.supplier_name?.toLowerCase().includes(q) || g.item_code?.toLowerCase().includes(q)
    if (!matchSearch) return false
    if (activeFilter === 'all') return true
    const s = getGroupStats(g)
    if (activeFilter === 'pendingApproval') return s.pendingApproval > 0
    if (activeFilter === 'pendingBuying')   return s.pendingBuying > 0
    if (activeFilter === 'approved')        return s.approved > 0
    if (activeFilter === 'rejected')        return s.rejected > 0
    return true
  })

  const openListPanel = (group) => {
    setListGroup(group)
    setPanelMode('list')
    setPanel(null)
    if (fileUrl) { URL.revokeObjectURL(fileUrl); setFileUrl(null) }
    setFileType(null)
    setActionMsg('')
  }

  const openPanel = async (group, docTypeKey) => {
    const doc = group.docs.find(d => d.doc_type === docTypeKey) || null
    setPanel({ group, docTypeKey, doc })
    setPanelMode('doc')
    setReviewRemarks(''); setActionMsg('')
    if (fileUrl) { URL.revokeObjectURL(fileUrl); setFileUrl(null) }
    setFileType(null)
    if (doc?.id && doc?.file_name) {
      setPanelLoading(true)
      try {
        const res = await getDocumentFile(doc.id)
        setFileUrl(URL.createObjectURL(res.data)); setFileType(res.data.type)
      } catch {}
      finally { setPanelLoading(false) }
    }
  }

  const closePanel = () => {
    setPanelMode(null)
    setListGroup(null)
    setPanel(null)
    if (fileUrl) { URL.revokeObjectURL(fileUrl); setFileUrl(null) }
    setFileType(null)
    setActionMsg('')
  }

  const handleReview = async (action) => {
    if (!panel?.doc?.id) return
    setReviewing(true); setActionMsg('')
    try {
      await reviewDocument(panel.doc.id, { action, remarks: reviewRemarks })
      setActionMsg(action === 'approve' ? 'Approved.' : 'Rejected with remarks.')
      onRefresh()
      setPanel(p => ({ ...p, doc: { ...p.doc, status: action === 'approve' ? (canQAReview ? 'qa_approved' : 'approved') : 'rejected', qa_remarks: canQAReview ? reviewRemarks : p.doc?.qa_remarks, buying_remarks: canBuyingReview ? reviewRemarks : p.doc?.buying_remarks } }))
    } catch (e) { setActionMsg(e?.response?.data?.error || 'Action failed') }
    finally { setReviewing(false) }
  }

  const handleInternalMarkNA = async () => {
    if (!panel) return
    setActionMsg('')
    try {
      await markNotApplicable({ item_code: panel.group.item_code, supplier_code: panel.group.supplier_code, doc_type: panel.docTypeKey })
      const newStatus = panel.doc?.status === 'not_applicable' ? 'pending_upload' : 'not_applicable'
      setPanel(p => ({ ...p, doc: { ...p.doc, status: newStatus } }))
      setActionMsg(newStatus === 'not_applicable' ? 'Marked as Not Applicable.' : 'Restored to Pending Upload.')
      onRefresh()
    } catch (e) { setActionMsg(e?.response?.data?.error || 'Action failed') }
  }

  const handleInternalUpload = async () => {
    if (!internalFile || !panel) return
    setInternalUploading(true); setActionMsg('')
    try {
      const fd = new FormData()
      fd.append('item_code', panel.group.item_code)
      fd.append('supplier_code', panel.group.supplier_code)
      fd.append('doc_type', panel.docTypeKey)
      fd.append('file', internalFile)
      await internalUploadDocument(fd)
      setActionMsg('Document uploaded and marked Approved. Supplier has been notified.')
      setInternalFile(null)
      if (internalFileRef.current) internalFileRef.current.value = ''
      onRefresh()
      // Reload panel file preview
      const newDoc = { ...panel.doc, status: 'approved', file_name: internalFile.name }
      setPanel(p => ({ ...p, doc: newDoc }))
    } catch (e) {
      setActionMsg(e?.response?.data?.error || 'Upload failed')
    } finally { setInternalUploading(false) }
  }

  return (
    <div>
      {/* Stat filter cards */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {statCards.map(card => {
          const isActive = activeFilter === card.key
          return (
            <div key={card.key} onClick={() => setActiveFilter(card.key)} style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
              padding: '14px 20px', cursor: 'pointer', minWidth: '120px', flex: '1',
              borderTop: `3px solid ${isActive ? card.color : '#e5e7eb'}`,
              boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{card.label}</span>
                {isActive && activeFilter !== 'all' && (
                  <span onClick={e => { e.stopPropagation(); setActiveFilter('all') }} style={{ color: '#94a3b8', cursor: 'pointer', fontWeight: '400' }}>× FILTER</span>
                )}
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: card.color }}>{statCounts[card.key]}</div>
            </div>
          )
        })}
      </div>

      {/* Table header bar */}
      <div style={{ background: '#fff', borderRadius: '10px 10px 0 0', border: '1px solid #e5e7eb', borderBottom: 'none', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
          Documents · <span style={{ color: '#64748b', fontWeight: '400' }}>{filtered.length} item(s)</span>
        </span>
        <input
          type="text"
          placeholder="Search item, code or supplier..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', width: '240px' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '0 0 10px 10px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>ITEM</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: '600' }}>SUPPLIER</th>
              <th style={{ padding: '10px 16px', textAlign: 'center', color: '#d97706', fontWeight: '600' }}>PENDING QA</th>
              <th style={{ padding: '10px 16px', textAlign: 'center', color: '#0284c7', fontWeight: '600' }}>PENDING BUYING</th>
              <th style={{ padding: '10px 16px', textAlign: 'center', color: '#15803d', fontWeight: '600' }}>APPROVED</th>
              <th style={{ padding: '10px 16px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>REJECTED</th>
              <th style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>N/A</th>
              <th style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b', fontWeight: '600' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                <div>No document records found</div>
              </td></tr>
            ) : filtered.map(group => {
              const key = `${group.item_code}-${group.supplier_code}`
              const s = getGroupStats(group)
              const isActive = listGroup?.item_code === group.item_code && listGroup?.supplier_code === group.supplier_code

              return (
                <tr key={key} style={{ borderBottom: '1px solid #f1f5f9', background: isActive ? '#fefce8' : '#fff' }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{group.item_name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{group.item_code}</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#374151' }}>{group.supplier_name}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {s.pendingApproval > 0 ? <span style={{ background: '#fef9c3', color: '#92400e', border: '1px solid #fde68a', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{s.pendingApproval}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {s.pendingBuying > 0 ? <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{s.pendingBuying}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {s.approved > 0 ? <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{s.approved}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {s.rejected > 0 ? <span style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', padding: '2px 10px', borderRadius: '9999px', fontWeight: '700', fontSize: '12px' }}>{s.rejected}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>{s.na > 0 ? s.na : '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => isActive && panelMode ? closePanel() : openListPanel(group)} style={{
                      padding: '5px 14px', background: isActive && panelMode ? '#1C1208' : '#f1f5f9',
                      color: isActive && panelMode ? '#fff' : '#374151', border: '1px solid #e5e7eb',
                      borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                    }}>{isActive && panelMode ? 'Close' : 'View'}</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Slide panel */}
      {panelMode && (listGroup || panel) && (
        <>
          <div onClick={closePanel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: '52px', right: 0, width: '480px', height: 'calc(100vh - 52px)', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>

            {/* Panel header */}
            <div style={{ background: '#1C1208', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                {panelMode === 'doc' && (
                  <button onClick={() => { setPanelMode('list'); setPanel(null); if (fileUrl) { URL.revokeObjectURL(fileUrl); setFileUrl(null) }; setFileType(null); setActionMsg('') }}
                    style={{ background: 'none', border: 'none', color: '#d4c5a0', fontSize: '12px', cursor: 'pointer', padding: '0 0 4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ← Back to list
                  </button>
                )}
                <div style={{ fontSize: '12px', color: '#d4c5a0', marginBottom: '2px' }}>
                  {(panel?.group || listGroup)?.item_name} · {(panel?.group || listGroup)?.supplier_name}
                </div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>
                  {panelMode === 'list' ? 'Document List' : (DOC_TYPES.find(d => d.key === panel?.docTypeKey)?.label || panel?.docTypeKey)}
                </div>
              </div>
              <button onClick={closePanel} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer', flexShrink: 0 }}>×</button>
            </div>

            {/* List mode */}
            {panelMode === 'list' && listGroup && (() => {
              const docsMap = {}
              listGroup.docs.forEach(d => { docsMap[d.doc_type] = d })
              return (
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {DOC_TYPES.map(({ key: k, label }) => {
                    const doc = docsMap[k]
                    const status = doc?.status || 'pending_upload'
                    const meta = STATUS_META[status]
                    const isNA = status === 'not_applicable'
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 18px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                        onClick={() => openPanel(listGroup, k)}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: isNA ? '#9ca3af' : '#1e293b', textDecoration: isNA ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                          {doc?.file_name && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.file_name}</div>}
                        </div>
                        <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '2px 9px', borderRadius: '9999px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0 }}>{meta.label}</span>
                        <span style={{ color: '#94a3b8', fontSize: '14px', flexShrink: 0 }}>›</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Doc detail mode */}
            {panelMode === 'doc' && panel && (() => {
              const panelDoc = panel.doc
              const panelStatus = panelDoc?.status || 'pending_upload'
              const sm = STATUS_META[panelStatus] || STATUS_META.pending_upload
              const showQAReview = canQAReview && panelStatus === 'pending_approval'
              const showBuyingReview = canBuyingReview && panelStatus === 'qa_approved'
              return (
                <div style={{ overflowY: 'auto', flex: 1, padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`, padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700' }}>{sm.label}</span>
                    {panelDoc?.uploaded_at && <span style={{ fontSize: '11px', color: '#94a3b8' }}>Uploaded {new Date(panelDoc.uploaded_at).toLocaleDateString()}</span>}
                  </div>
                  {panelLoading ? (
                    <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading...</div>
                  ) : fileUrl ? (
                    <div style={{ marginBottom: '14px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                      {fileType?.startsWith('image/') ? (
                        <img src={fileUrl} alt="" style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block' }} />
                      ) : fileType === 'application/pdf' ? (
                        <iframe src={fileUrl} style={{ width: '100%', height: '280px', border: 'none' }} title="doc" />
                      ) : (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>📄 {panelDoc?.file_name}</div>
                      )}
                      <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{panelDoc?.file_name}</span>
                        <button onClick={() => { const a = document.createElement('a'); a.href = fileUrl; a.download = panelDoc.file_name; a.click() }} style={{ padding: '4px 12px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>⬇ Download</button>
                      </div>
                    </div>
                  ) : panelStatus !== 'pending_upload' ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', border: '1px dashed #e5e7eb', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>No file available</div>
                  ) : (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', border: '1px dashed #e5e7eb', borderRadius: '8px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>📤</div>
                      <p style={{ margin: 0, fontSize: '13px' }}>Awaiting supplier upload</p>
                    </div>
                  )}
                  {panelDoc?.qa_remarks && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px' }}>QA Remarks</div>
                      <div style={{ fontSize: '13px', color: '#374151' }}>{panelDoc.qa_remarks}</div>
                    </div>
                  )}
                  {panelDoc?.buying_remarks && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '3px' }}>Buying Remarks</div>
                      <div style={{ fontSize: '13px', color: '#374151' }}>{panelDoc.buying_remarks}</div>
                    </div>
                  )}
                  {canInternalUpload && (panelStatus === 'pending_upload' || panelStatus === 'not_applicable') && (
                    <div style={{ background: panelStatus === 'not_applicable' ? '#f5f5f5' : '#f0f9ff', border: `1px solid ${panelStatus === 'not_applicable' ? '#e5e7eb' : '#bae6fd'}`, borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                      {panelStatus === 'not_applicable' ? (
                        <>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#6b7280', marginBottom: '4px' }}>Marked as Not Applicable</div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>This document is marked N/A. You can undo this or upload a file instead.</div>
                          <button onClick={handleInternalMarkNA} style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>↩ Undo N/A</button>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#0369a1', marginBottom: '4px' }}>Upload on Supplier's Behalf</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>Document will be marked <strong>Approved</strong> immediately. Supplier will be notified.</div>
                          <input ref={internalFileRef} type="file" id="internal-file-input" style={{ display: 'none' }}
                            onChange={e => setInternalFile(e.target.files[0] || null)}
                            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx,.dwg,.ai,.eps,.zip,.csv" />
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label htmlFor="internal-file-input" style={{ padding: '7px 14px', background: '#fff', color: '#0369a1', border: '1px dashed #93c5fd', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                              {internalFile ? `📎 ${internalFile.name}` : '+ Choose File'}
                            </label>
                            {internalFile && (
                              <>
                                <button onClick={() => { setInternalFile(null); if (internalFileRef.current) internalFileRef.current.value = '' }}
                                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px', padding: 0 }}>×</button>
                                <button onClick={handleInternalUpload} disabled={internalUploading}
                                  style={{ padding: '7px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '700', cursor: internalUploading ? 'not-allowed' : 'pointer' }}>
                                  {internalUploading ? 'Uploading...' : '↑ Upload & Approve'}
                                </button>
                              </>
                            )}
                            <button onClick={handleInternalMarkNA}
                              style={{ padding: '7px 12px', background: '#f5f5f5', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              Mark N/A
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {(showQAReview || showBuyingReview) && (
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                        {showBuyingReview ? 'Buying Approval' : 'QA Review'}
                      </div>
                      <textarea
                        value={reviewRemarks}
                        onChange={e => setReviewRemarks(e.target.value)}
                        placeholder="Add remarks (required to reject)..."
                        rows={3}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical', marginBottom: '8px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleReview('approve')} disabled={reviewing} style={{ flex: 1, padding: '9px', background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', borderRadius: '7px', fontSize: '13px', fontWeight: '700', cursor: reviewing ? 'not-allowed' : 'pointer' }}>
                          ✓ {showBuyingReview ? 'Final Approve' : 'Approve'}
                        </button>
                        <button onClick={() => handleReview('reject')} disabled={reviewing || !reviewRemarks.trim()} style={{ flex: 1, padding: '9px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '7px', fontSize: '13px', fontWeight: '700', cursor: (reviewing || !reviewRemarks.trim()) ? 'not-allowed' : 'pointer', opacity: !reviewRemarks.trim() ? 0.6 : 1 }}>
                          ✗ Reject
                        </button>
                      </div>
                      {!reviewRemarks.trim() && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>Remarks required to reject</p>}
                    </div>
                  )}
                  {actionMsg && (
                    <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
                      background: actionMsg.includes('fail') || actionMsg.includes('Failed') ? '#fef2f2' : '#f0fdf4',
                      color: actionMsg.includes('fail') || actionMsg.includes('Failed') ? '#dc2626' : '#15803d',
                    }}>{actionMsg}</div>
                  )}
                </div>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocumentControlPage() {
  const { user } = useAuth()
  const role = user?.role
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadedOnce = useRef(false)

  const load = useCallback(() => {
    // Only show full loading spinner on first load — refreshes update data silently
    if (!loadedOnce.current) setLoading(true)
    getDocuments()
      .then(r => { setGroups(r.data || []); loadedOnce.current = true })
      .catch(e => setError(e?.response?.data?.error || 'Failed to load documents'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="page" style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ background: '#1C1208', borderRadius: '12px', padding: '24px 28px', marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '700', color: '#fff' }}>Document Control</h1>
            <p style={{ margin: 0, color: '#d4c5a0', fontSize: '13px' }}>Track and manage required documents per item/supplier</p>
          </div>
          <p style={{ margin: 0, color: '#d4c5a0', fontSize: '12px' }}>Use filter cards to narrow by status · click View to review documents</p>
        </div>

        {error && <p style={{ color: '#dc2626', padding: '12px', background: '#fef2f2', borderRadius: '8px', marginBottom: '16px' }}>{error}</p>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px', color: '#94a3b8' }}>Loading documents...</div>
        ) : role === 'supplier_user' ? (
          <SupplierUploadView groups={groups} onRefresh={load} />
        ) : (
          <ReviewerView groups={groups} role={role} onRefresh={load} />
        )}
      </div>
    </div>
  )
}
