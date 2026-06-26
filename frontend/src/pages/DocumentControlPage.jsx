import React, { useEffect, useState, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getDocuments, uploadDocument, reviewDocument, getDocumentFile, markNotApplicable } from '../api/documents.js'

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
  const [stagedFiles, setStagedFiles] = useState({}) // doc_type → File
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [toast, setToast] = useState('')
  const [panel, setPanel] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const fileRefs = useRef({})

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
      setSubmitMsg('No new files to submit.')
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
      {/* Item selector */}
      <div style={{ background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
          Select Item to Upload Documents
        </label>
        <select
          value={selectedKey}
          onChange={e => { setSelectedKey(e.target.value); setStagedFiles({}); setSubmitMsg('') }}
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff', color: '#111827' }}
        >
          <option value=''>— Choose an item —</option>
          {groups.map(g => {
            const uploaded = g.docs.filter(d => d.status && d.status !== 'pending_upload').length
            return (
              <option key={`${g.item_code}::${g.supplier_code}`} value={`${g.item_code}::${g.supplier_code}`}>
                {g.item_name} ({g.item_code}) — {uploaded}/{DOC_TYPES.length} submitted
              </option>
            )
          })}
        </select>
      </div>

      {/* Document slots */}
      {group && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
              {group.item_name}
              <span style={{ marginLeft: '8px', fontSize: '13px', color: '#64748b', fontWeight: '400' }}>{group.supplier_name}</span>
            </h3>
            </div>

          {submitMsg && (
            <div style={{ padding: '10px 16px', marginBottom: '14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
              background: submitMsg.includes('failed') ? '#fef2f2' : '#f0fdf4',
              color: submitMsg.includes('failed') ? '#dc2626' : '#15803d',
            }}>{submitMsg}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {DOC_TYPES.map(({ key, label }, idx) => {
              const doc = docsMap[key]
              const status = doc?.status || 'pending_upload'
              const meta = STATUS_META[status]
              const staged = stagedFiles[key]
              const canUpload = status === 'pending_upload' || status === 'rejected'

              return (
                <div key={key} style={{
                  background: '#fff', borderRadius: '10px', padding: '14px 18px',
                  border: staged ? '2px solid #1C1208' : '1px solid #e5e7eb',
                  display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                  {/* Number */}
                  <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f1f5f9', color: '#64748b', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>

                  {/* Label */}
                  <span style={{ flex: 1, fontSize: '14px', fontWeight: '500', color: '#111827', minWidth: '180px' }}>{label}</span>

                  {/* Status badge */}
                  <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                    {meta.label}
                  </span>

                  {/* View existing file */}
                  {doc?.file_name && (
                    <button
                      onClick={() => openViewPanel(doc)}
                      style={{ padding: '5px 12px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      👁 View
                    </button>
                  )}

                  {/* Attach / staged file / N/A actions */}
                  {canUpload && status !== 'not_applicable' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {staged ? (
                        <>
                          <span style={{ fontSize: '12px', color: '#1C1208', fontWeight: '600', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            📎 {staged.name}
                          </span>
                          <button onClick={() => handleRemoveStaged(key)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', padding: '0' }}>×</button>
                        </>
                      ) : (
                        <>
                          <input
                            type="file"
                            id={`file-${key}`}
                            ref={el => { fileRefs.current[key] = el }}
                            style={{ display: 'none' }}
                            onChange={e => handleSelectFile(key, e.target.files[0])}
                            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx,.dwg,.ai,.eps,.zip,.csv"
                          />
                          <label htmlFor={`file-${key}`} style={{
                            padding: '5px 14px', background: '#fafafa', color: '#374151',
                            border: '1px dashed #d1d5db', borderRadius: '6px', fontSize: '12px',
                            fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap'
                          }}>
                            + Attach
                          </label>
                          {(status === 'pending_upload' || status === 'rejected') && (
                            <button
                              onClick={() => handleMarkNA(key)}
                              title="Mark as Not Applicable for this product"
                              style={{ padding: '5px 10px', background: '#f5f5f5', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >N/A</button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {/* Undo N/A */}
                  {status === 'not_applicable' && canUpload && (
                    <button
                      onClick={() => handleMarkNA(key)}
                      title="Click to undo — mark as needed"
                      style={{ padding: '4px 10px', background: 'none', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                    >Undo N/A</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sticky submit bar — always visible at bottom when files are staged */}
      {pendingCount > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
          background: '#1C1208', padding: '14px 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
        }}>
          <span style={{ color: '#d4c5a0', fontSize: '14px' }}>
            📎 <strong style={{ color: '#fff' }}>{pendingCount} file{pendingCount > 1 ? 's' : ''}</strong> ready to submit
            {group && <span style={{ marginLeft: '8px' }}>— {group.item_name}</span>}
          </span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {submitMsg && (
              <span style={{ fontSize: '13px', color: submitMsg.includes('failed') ? '#fca5a5' : '#86efac', fontWeight: '600' }}>{submitMsg}</span>
            )}
            <button
              onClick={handleSubmitAll}
              disabled={submitting}
              style={{
                padding: '10px 28px', background: submitting ? '#475569' : '#E8470F',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: '700', cursor: submitting ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              {submitting ? 'Submitting...' : `Submit for Approval`}
            </button>
          </div>
        </div>
      )}

      {/* Spacer so content isn't hidden behind sticky bar */}
      {pendingCount > 0 && <div style={{ height: '72px' }} />}

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
          <div style={{ position: 'fixed', top: 0, right: 0, width: '420px', height: '100vh', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
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
  const [expandedKey, setExpandedKey] = useState(null)
  const [panel, setPanel] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const canQAReview = ['qa', 'admin', 'imports', 'accounts'].includes(role)
  const canBuyingReview = role === 'buying'

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

  const openPanel = async (group, docTypeKey) => {
    const doc = group.docs.find(d => d.doc_type === docTypeKey) || null
    setPanel({ group, docTypeKey, doc })
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

  const panelDoc = panel?.doc
  const panelStatus = panelDoc?.status || 'pending_upload'
  const sm = STATUS_META[panelStatus] || STATUS_META.pending_upload
  const docLabel = panel ? (DOC_TYPES.find(d => d.key === panel.docTypeKey)?.label || panel.docTypeKey) : ''
  const showQAReview = canQAReview && panelStatus === 'pending_approval'
  const showBuyingReview = canBuyingReview && panelStatus === 'qa_approved'

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
              const docsMap = {}
              group.docs.forEach(d => { docsMap[d.doc_type] = d })
              const isExpanded = expandedKey === key
              const actionDocs = DOC_TYPES.filter(({ key: k }) => {
                const st = docsMap[k]?.status
                return st && st !== 'not_applicable' && st !== 'qa_approved' && st !== 'approved'
              })
              const resolvedDocs = DOC_TYPES.filter(({ key: k }) => {
                const st = docsMap[k]?.status
                return st === 'qa_approved' || st === 'approved'
              })

              return (
                <React.Fragment key={key}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', background: isExpanded ? '#fefce8' : '#fff' }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#fff' }}>
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
                      <button onClick={() => setExpandedKey(isExpanded ? null : key)} style={{
                        padding: '5px 14px', background: isExpanded ? '#1C1208' : '#f1f5f9',
                        color: isExpanded ? '#fff' : '#374151', border: '1px solid #e5e7eb',
                        borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                      }}>{isExpanded ? 'Close' : 'View'}</button>
                    </td>
                  </tr>

                  {/* Expanded docs row */}
                  {isExpanded && (
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <td colSpan={8} style={{ padding: '0 16px 16px', background: '#fafafa' }}>
                        {/* Action docs needing review */}
                        {actionDocs.length > 0 && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Pending Review</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px' }}>
                              {actionDocs.map(({ key: k, label }) => {
                                const doc = docsMap[k]
                                const status = doc?.status || 'pending_upload'
                                const meta = STATUS_META[status]
                                const isActive = panel?.group?.item_code === group.item_code && panel?.group?.supplier_code === group.supplier_code && panel?.docTypeKey === k
                                return (
                                  <button key={k} onClick={() => openPanel(group, k)} style={{
                                    display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 11px',
                                    borderRadius: '7px', cursor: 'pointer', textAlign: 'left',
                                    border: isActive ? '2px solid #1C1208' : `1px solid ${meta.border}`,
                                    background: isActive ? '#fef9f0' : meta.bg,
                                  }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '12px', fontWeight: '500', color: '#374151', lineHeight: 1.3 }}>{label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Approved summary table */}
                        {resolvedDocs.length > 0 && (
                          <div style={{ marginTop: '14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Approved Documents</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                  <th style={{ padding: '7px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Document</th>
                                  <th style={{ padding: '7px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                                  <th style={{ padding: '7px 12px', textAlign: 'left', color: '#64748b', fontWeight: '600', borderBottom: '1px solid #e5e7eb' }}>File</th>
                                  <th style={{ padding: '7px 12px', borderBottom: '1px solid #e5e7eb' }} />
                                </tr>
                              </thead>
                              <tbody>
                                {resolvedDocs.map(({ key: k, label }) => {
                                  const doc = docsMap[k]
                                  const meta = STATUS_META[doc.status]
                                  return (
                                    <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '7px 12px', color: '#374151', fontWeight: '500' }}>{label}</td>
                                      <td style={{ padding: '7px 12px' }}>
                                        <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '2px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>{meta.label}</span>
                                      </td>
                                      <td style={{ padding: '7px 12px', color: '#64748b' }}>{doc.file_name || '—'}</td>
                                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                                        {doc.id && doc.file_name && (
                                          <button onClick={() => openPanel(group, k)} style={{ padding: '3px 10px', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '5px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>View</button>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {actionDocs.length === 0 && resolvedDocs.length === 0 && (
                          <div style={{ padding: '16px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>No documents uploaded yet.</div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Slide panel */}
      {panel && (
        <>
          <div onClick={() => setPanel(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: '440px', height: '100vh', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', zIndex: 50, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ background: '#1C1208', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#d4c5a0', marginBottom: '2px' }}>{panel.group.item_name} · {panel.group.supplier_name}</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>{docLabel}</div>
              </div>
              <button onClick={() => setPanel(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '18px', flex: 1 }}>
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
