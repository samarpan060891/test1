import React, { useEffect, useState, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getDocuments, uploadDocument, reviewDocument, getDocumentFile } from '../api/documents.js'

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
  qa_approved:      { label: 'QA Approved',       bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  approved:         { label: 'Approved',           bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  rejected:         { label: 'Rejected',           bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
}

// ─── Supplier Upload View ─────────────────────────────────────────────────────
function SupplierUploadView({ groups, onRefresh }) {
  const [selectedKey, setSelectedKey] = useState('')
  const [stagedFiles, setStagedFiles] = useState({}) // doc_type → File
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
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

  const handleSubmitAll = async () => {
    if (!group || Object.keys(stagedFiles).length === 0) return
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
    setSubmitMsg(fail === 0
      ? `${ok} document${ok > 1 ? 's' : ''} submitted successfully and sent for approval.`
      : `${ok} uploaded, ${fail} failed.`)
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
            {pendingCount > 0 && (
              <button
                onClick={handleSubmitAll}
                disabled={submitting}
                style={{
                  padding: '9px 24px', background: submitting ? '#93c5fd' : '#1C1208',
                  color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px',
                  fontWeight: '700', cursor: submitting ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? 'Submitting...' : `Submit ${pendingCount} Document${pendingCount > 1 ? 's' : ''}`}
              </button>
            )}
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

                  {/* Attach / staged file */}
                  {canUpload && (
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
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState(null)
  const [fileUrl, setFileUrl] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const canQAReview = ['qa', 'admin', 'imports', 'accounts'].includes(role)
  const canBuyingReview = role === 'buying'

  const filtered = groups.filter(g => {
    const q = search.toLowerCase()
    return !q || g.item_name?.toLowerCase().includes(q) || g.supplier_name?.toLowerCase().includes(q) || g.item_code?.toLowerCase().includes(q)
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
      // update panel doc status
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
      <input
        type="text"
        placeholder="Search by item name, code or supplier..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '320px', padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', marginBottom: '20px' }}
      />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
          <p style={{ margin: 0 }}>No document records found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.map(group => {
            const docsMap = {}
            group.docs.forEach(d => { docsMap[d.doc_type] = d })
            const approved = group.docs.filter(d => d.status === 'approved').length
            const pct = Math.round((approved / DOC_TYPES.length) * 100)

            return (
              <div key={`${group.item_code}-${group.supplier_code}`} style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ background: '#1e293b', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc' }}>{group.item_name}</span>
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#94a3b8' }}>{group.item_code}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{group.supplier_name}</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: pct === 100 ? '#4ade80' : '#fbbf24' }}>{approved}/{DOC_TYPES.length} approved</span>
                  </div>
                </div>
                <div style={{ height: '3px', background: '#e5e7eb' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#f59e0b' }} />
                </div>
                <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '7px' }}>
                  {DOC_TYPES.map(({ key, label }) => {
                    const doc = docsMap[key]
                    const status = doc?.status || 'pending_upload'
                    const meta = STATUS_META[status]
                    const isActive = panel?.group?.item_code === group.item_code && panel?.group?.supplier_code === group.supplier_code && panel?.docTypeKey === key
                    return (
                      <button key={key} onClick={() => openPanel(group, key)} style={{
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
            )
          })}
        </div>
      )}

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

  const load = useCallback(() => {
    setLoading(true)
    getDocuments()
      .then(r => setGroups(r.data || []))
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <span key={key} style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '4px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600' }}>
                {meta.label}
              </span>
            ))}
          </div>
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
