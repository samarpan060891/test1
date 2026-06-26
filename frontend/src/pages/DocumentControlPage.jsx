import React, { useEffect, useState, useRef, useCallback } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { getDocuments, uploadDocument, reviewDocument, getDocumentFile } from '../api/documents.js'

const DOC_TYPE_LABELS = {
  product_image: 'Product Image',
  bill_of_materials: 'Bill of Materials',
  msds: 'MSDS',
  swatch_details: 'Swatch Details',
  test_reports: 'Test Reports',
  cb_reports: 'CB Reports',
  line_drawings: 'Line Drawings',
  assembly_instruction_manual: 'Assembly Manual',
  user_care_manual: 'User Care Manual',
  barcode: 'Barcode',
  carton_artwork_shipping_mark: 'Carton Artwork',
  hs_code: 'HS Code',
  metrological_data: 'Metrological Data',
}

const DOC_TYPE_LABELS_FULL = {
  product_image: 'Product Image',
  bill_of_materials: 'Bill of Materials',
  msds: 'Materials Safety Data Sheet',
  swatch_details: 'Swatch Details',
  test_reports: 'Test Reports',
  cb_reports: 'CB Reports',
  line_drawings: 'Line Drawings',
  assembly_instruction_manual: 'Assembly Instruction Manual',
  user_care_manual: 'User Care Manual',
  barcode: 'Barcode',
  carton_artwork_shipping_mark: 'Carton Artwork & Shipping Mark',
  hs_code: 'HS Code',
  metrological_data: 'Metrological Data (L×B×H & Net Weight)',
}

const STATUS_CONFIG = {
  pending_upload:   { label: 'Pending Upload',   bg: '#e2e8f0', color: '#475569' },
  pending_approval: { label: 'Pending Approval', bg: '#fef3c7', color: '#92400e' },
  qa_approved:      { label: 'QA Approved',      bg: '#dbeafe', color: '#1e40af' },
  approved:         { label: 'Approved',         bg: '#d1fae5', color: '#065f46' },
  rejected:         { label: 'Rejected',         bg: '#fee2e2', color: '#991b1b' },
}

function StatusBadge({ status, style = {} }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending_upload
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      padding: '3px 10px', borderRadius: '9999px',
      fontSize: '11px', fontWeight: '700', textTransform: 'uppercase',
      letterSpacing: '0.05em', whiteSpace: 'nowrap',
      ...style,
    }}>{cfg.label}</span>
  )
}

function DocTypeBadge({ doc, onClick }) {
  const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending_upload
  return (
    <button
      title={`${DOC_TYPE_LABELS_FULL[doc.doc_type] || doc.doc_type}: ${cfg.label}`}
      onClick={() => onClick(doc)}
      style={{
        background: cfg.bg, color: cfg.color,
        border: 'none', borderRadius: '6px',
        padding: '4px 8px', fontSize: '11px', fontWeight: '600',
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
    </button>
  )
}

export default function DocumentControlPage() {
  const { user } = useAuth()
  const role = user?.role

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const [panel, setPanel] = useState(null) // { itemGroup, doc }
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelError, setPanelError] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewType, setPreviewType] = useState(null)

  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const [reviewAction, setReviewAction] = useState(null) // 'approve' | 'reject'
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState(null)

  const fileInputRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getDocuments()
      setItems(r.data)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openPanel = useCallback(async (itemGroup, doc) => {
    setPanel({ itemGroup, doc })
    setPreviewUrl(null)
    setPreviewType(null)
    setUploadFile(null)
    setUploadError(null)
    setReviewAction(null)
    setReviewRemarks('')
    setReviewError(null)
    setPanelError(null)

    if (doc.id && doc.status !== 'pending_upload') {
      setPanelLoading(true)
      try {
        const r = await getDocumentFile(doc.id)
        const blob = r.data
        const url = URL.createObjectURL(blob)
        setPreviewUrl(url)
        setPreviewType(blob.type || 'application/octet-stream')
      } catch (e) {
        setPanelError('Could not load file preview.')
      } finally {
        setPanelLoading(false)
      }
    }
  }, [])

  const closePanel = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPanel(null)
    setPreviewUrl(null)
  }

  const handleUpload = async () => {
    if (!uploadFile || !panel) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('item_code', panel.itemGroup.item_code)
      fd.append('supplier_code', panel.itemGroup.supplier_code)
      fd.append('doc_type', panel.doc.doc_type)
      fd.append('file', uploadFile)
      await uploadDocument(fd)
      await load()
      closePanel()
    } catch (e) {
      setUploadError(e.response?.data?.error || e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleReview = async () => {
    if (!reviewAction || !panel?.doc?.id) return
    setReviewing(true)
    setReviewError(null)
    try {
      await reviewDocument(panel.doc.id, { action: reviewAction, remarks: reviewRemarks })
      await load()
      closePanel()
    } catch (e) {
      setReviewError(e.response?.data?.error || e.message)
    } finally {
      setReviewing(false)
    }
  }

  const canUpload = (doc) => {
    if (role === 'supplier_user') return doc.status === 'pending_upload' || doc.status === 'rejected'
    if (['admin', 'qa', 'imports', 'accounts'].includes(role)) return true
    return false
  }

  const canQaReview = (doc) =>
    ['qa', 'admin', 'imports', 'accounts'].includes(role) && doc.status === 'pending_approval'

  const canBuyingReview = (doc) =>
    role === 'buying' && doc.status === 'qa_approved'

  // Filtering
  const filtered = items.filter(g => {
    const matchSearch = !search ||
      g.item_name?.toLowerCase().includes(search.toLowerCase()) ||
      g.item_code?.toLowerCase().includes(search.toLowerCase()) ||
      g.supplier_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || g.docs.some(d => d.status === filterStatus)
    return matchSearch && matchStatus
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar />

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)',
          borderRadius: '12px', padding: '24px 28px', marginBottom: '24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px',
        }}>
          <div>
            <h1 style={{ margin: 0, color: '#fff', fontSize: '22px', fontWeight: '800' }}>
              Document Control
            </h1>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
              Track and manage required documents per item/supplier
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <span key={k} style={{ background: v.bg, color: v.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700' }}>
                {v.label}
              </span>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            placeholder="Search item or supplier..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: '220px', padding: '9px 14px', borderRadius: '8px',
              border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{
              padding: '9px 14px', borderRadius: '8px', border: '1px solid #e2e8f0',
              fontSize: '14px', background: '#fff', cursor: 'pointer',
            }}
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Loading documents…</div>
        )}
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '14px 18px', borderRadius: '8px', marginBottom: '16px' }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
            No document records found.
          </div>
        )}

        {!loading && filtered.map(g => (
          <div key={`${g.item_code}::${g.supplier_code}`} style={{
            background: '#fff', borderRadius: '10px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            marginBottom: '14px', overflow: 'hidden',
          }}>
            {/* Row header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '14px 18px 10px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '6px',
            }}>
              <div>
                <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>{g.item_name}</span>
                <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>{g.item_code}</span>
              </div>
              <div style={{ color: '#475569', fontSize: '13px' }}>
                <span style={{ fontWeight: '600' }}>{g.supplier_name}</span>
                <span style={{ color: '#94a3b8', marginLeft: '6px' }}>{g.supplier_code}</span>
              </div>
            </div>
            {/* Doc badges */}
            <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {g.docs.map(doc => (
                <DocTypeBadge key={doc.doc_type} doc={doc} onClick={(d) => openPanel(g, d)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sliding panel */}
      {panel && (
        <>
          {/* Overlay */}
          <div
            onClick={closePanel}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
              zIndex: 300, cursor: 'pointer',
            }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px',
            background: '#fff', zIndex: 301, boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            {/* Panel header */}
            <div style={{
              background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)',
              padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '15px' }}>
                    {DOC_TYPE_LABELS_FULL[panel.doc.doc_type] || panel.doc.doc_type}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', marginTop: '3px' }}>
                    {panel.itemGroup.item_name} • {panel.itemGroup.supplier_name}
                  </div>
                </div>
                <button onClick={closePanel} style={{
                  background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                  width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer',
                  fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>×</button>
              </div>
            </div>

            <div style={{ padding: '20px', flex: 1 }}>
              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>Status:</span>
                <StatusBadge status={panel.doc.status} />
              </div>

              {/* File info */}
              {panel.doc.file_name && (
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
                  <span style={{ fontWeight: '600' }}>File:</span> {panel.doc.file_name}
                  {panel.doc.uploaded_at && (
                    <span style={{ marginLeft: '8px', color: '#94a3b8' }}>
                      ({new Date(panel.doc.uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})
                    </span>
                  )}
                </div>
              )}

              {/* Preview */}
              {panelLoading && (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
                  Loading preview…
                </div>
              )}
              {panelError && (
                <div style={{ color: '#991b1b', fontSize: '13px', padding: '10px 14px', background: '#fee2e2', borderRadius: '6px', marginBottom: '16px' }}>
                  {panelError}
                </div>
              )}
              {previewUrl && !panelLoading && (
                <div style={{ marginBottom: '16px' }}>
                  {previewType?.startsWith('image/') ? (
                    <img src={previewUrl} alt="preview" style={{ width: '100%', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  ) : previewType === 'application/pdf' ? (
                    <iframe src={previewUrl} title="pdf-preview" style={{ width: '100%', height: '340px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  ) : (
                    <div style={{ color: '#64748b', fontSize: '13px', padding: '14px', background: '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
                      Preview not available for this file type.
                    </div>
                  )}
                  <a
                    href={previewUrl}
                    download={panel.doc.file_name || 'document'}
                    style={{
                      display: 'inline-block', marginTop: '10px', padding: '7px 16px',
                      background: '#1C1208', color: '#fff', borderRadius: '6px',
                      textDecoration: 'none', fontSize: '13px', fontWeight: '600',
                    }}
                  >
                    Download
                  </a>
                </div>
              )}

              {/* QA remarks */}
              {panel.doc.qa_remarks && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>QA Remarks</div>
                  <div style={{ fontSize: '13px', color: '#0f172a' }}>{panel.doc.qa_remarks}</div>
                  {panel.doc.qa_reviewed_at && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      {new Date(panel.doc.qa_reviewed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  )}
                </div>
              )}
              {panel.doc.buying_remarks && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Buying Remarks</div>
                  <div style={{ fontSize: '13px', color: '#0f172a' }}>{panel.doc.buying_remarks}</div>
                  {panel.doc.buying_reviewed_at && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                      {new Date(panel.doc.buying_reviewed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '16px', paddingTop: '16px' }}>
                {/* Upload section */}
                {canUpload(panel.doc) && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                      Upload Document
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      onChange={e => setUploadFile(e.target.files[0] || null)}
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0',
                          background: '#f8fafc', fontSize: '13px', cursor: 'pointer',
                          color: '#475569', fontWeight: '600',
                        }}
                      >
                        {uploadFile ? uploadFile.name : 'Choose File'}
                      </button>
                      {uploadFile && (
                        <button
                          onClick={handleUpload}
                          disabled={uploading}
                          style={{
                            padding: '8px 20px', borderRadius: '6px', border: 'none',
                            background: '#E8470F', color: '#fff', fontSize: '13px',
                            fontWeight: '700', cursor: uploading ? 'not-allowed' : 'pointer',
                            opacity: uploading ? 0.7 : 1,
                          }}
                        >
                          {uploading ? 'Uploading…' : 'Upload'}
                        </button>
                      )}
                    </div>
                    {uploadError && (
                      <div style={{ color: '#991b1b', fontSize: '12px', marginTop: '6px' }}>{uploadError}</div>
                    )}
                  </div>
                )}

                {/* QA Review section */}
                {(canQaReview(panel.doc) || canBuyingReview(panel.doc)) && (
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                      {canBuyingReview(panel.doc) ? 'Buying Approval' : 'QA Review'}
                    </div>
                    <textarea
                      placeholder="Remarks (optional)"
                      value={reviewRemarks}
                      onChange={e => setReviewRemarks(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '6px',
                        border: '1px solid #e2e8f0', fontSize: '13px', resize: 'vertical',
                        boxSizing: 'border-box', marginBottom: '10px',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => { setReviewAction('approve'); }}
                        style={{
                          flex: 1, padding: '9px', borderRadius: '6px', border: 'none',
                          background: reviewAction === 'approve' ? '#15803d' : '#f0fdf4',
                          color: reviewAction === 'approve' ? '#fff' : '#15803d',
                          fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                          border: '1px solid #16a34a',
                        }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => { setReviewAction('reject'); }}
                        style={{
                          flex: 1, padding: '9px', borderRadius: '6px', border: '1px solid #dc2626',
                          background: reviewAction === 'reject' ? '#dc2626' : '#fef2f2',
                          color: reviewAction === 'reject' ? '#fff' : '#dc2626',
                          fontWeight: '700', fontSize: '13px', cursor: 'pointer',
                        }}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewAction && (
                      <button
                        onClick={handleReview}
                        disabled={reviewing}
                        style={{
                          width: '100%', marginTop: '10px', padding: '10px', borderRadius: '6px', border: 'none',
                          background: '#1C1208', color: '#fff', fontWeight: '700', fontSize: '13px',
                          cursor: reviewing ? 'not-allowed' : 'pointer', opacity: reviewing ? 0.7 : 1,
                        }}
                      >
                        {reviewing ? 'Submitting…' : `Confirm ${reviewAction === 'approve' ? 'Approval' : 'Rejection'}`}
                      </button>
                    )}
                    {reviewError && (
                      <div style={{ color: '#991b1b', fontSize: '12px', marginTop: '6px' }}>{reviewError}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

