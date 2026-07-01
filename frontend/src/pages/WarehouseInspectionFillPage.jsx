import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getWarehouseInspection,
  getWarehouseResponses,
  getWarehousePriorQC,
  saveWarehouseResponses,
  completeWarehouseInspection,
  getWarehouseImages,
  getWarehouseImageFile,
  uploadWarehouseImage,
  deleteWarehouseImage,
  addCheckpointTemplate,
  deleteCheckpointTemplate,
  syncInspectionResponses,
  submitWarehouseForQA,
  qaReviewWarehouseInspection,
} from '../api/warehouseInspections.js'

const RESULT_OPTIONS = ['', 'pass', 'fail', 'na']
const RESULT_COLORS = {
  pass: { bg: '#d1fae5', color: '#065f46', label: 'Pass' },
  fail: { bg: '#fee2e2', color: '#991b1b', label: 'Fail' },
  na:   { bg: '#f1f5f9', color: '#475569', label: 'N/A' },
  '':   { bg: '#fff', color: '#94a3b8', label: 'Pending' },
}
const STATUS_COLOR = {
  in_progress:      { bg: '#fef3c7', color: '#92400e',  label: 'In Progress' },
  pass:             { bg: '#d1fae5', color: '#065f46',  label: 'Pass' },
  fail:             { bg: '#fee2e2', color: '#991b1b',  label: 'Fail' },
  submitted_for_qa: { bg: '#eff6ff', color: '#1d4ed8',  label: 'Submitted for QA' },
  qa_approved:      { bg: '#d1fae5', color: '#065f46',  label: 'QA Approved' },
  qa_rejected:      { bg: '#fee2e2', color: '#991b1b',  label: 'QA Rejected' },
}

export default function WarehouseInspectionFillPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManageCheckpoints = user?.role === 'admin' || user?.role === 'qa'

  const [inspection, setInspection] = useState(null)
  const [responses, setResponses] = useState([])
  const [priorQC, setPriorQC] = useState([])
  const [images, setImages] = useState([])
  const [imageURLs, setImageURLs] = useState({})
  const [activeTab, setTab] = useState('checklist')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [msg, setMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  // QA review state
  const [submittingForQA, setSubmittingForQA] = useState(false)
  const [qaAction, setQaAction] = useState('')
  const [qaRemarks, setQaRemarks] = useState('')
  const [qaReviewing, setQaReviewing] = useState(false)

  // Item-specific checkpoint management
  const [showAddCheckpoint, setShowAddCheckpoint] = useState(false)
  const [newCp, setNewCp] = useState({ section: '', checkpoint: '', criticality: 'major' })
  const [addingCp, setAddingCp] = useState(false)
  const [cpMsg, setCpMsg] = useState('')

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    // Sync first so any newly added item-specific checkpoints get response rows
    await syncInspectionResponses(id).catch(() => {})
    const [insRes, respRes, priorRes, imgRes] = await Promise.allSettled([
      getWarehouseInspection(id),
      getWarehouseResponses(id),
      getWarehousePriorQC(id),
      getWarehouseImages(id),
    ])
    if (insRes.status === 'fulfilled') {
      setInspection(insRes.value.data)
      setRemarks(insRes.value.data.remarks || '')
    }
    if (respRes.status === 'fulfilled') setResponses(respRes.value.data || [])
    if (priorRes.status === 'fulfilled') setPriorQC(priorRes.value.data || [])
    if (imgRes.status === 'fulfilled') {
      const imgs = imgRes.value.data || []
      setImages(imgs)
      loadImageURLs(imgs)
    }
  }

  async function handleAddCheckpoint(e) {
    e.preventDefault()
    if (!newCp.section.trim() || !newCp.checkpoint.trim()) {
      setCpMsg('Section and checkpoint text are required')
      return
    }
    setAddingCp(true)
    setCpMsg('')
    try {
      await addCheckpointTemplate({
        stage: inspection.stage,
        section: newCp.section.trim(),
        checkpoint: newCp.checkpoint.trim(),
        criticality: newCp.criticality,
        item_code: inspection.item_code,
      })
      setNewCp({ section: '', checkpoint: '', criticality: 'major' })
      setShowAddCheckpoint(false)
      // Re-sync and reload responses so the new checkpoint appears
      await fetchAll()
      setCpMsg('Checkpoint added')
    } catch (err) {
      setCpMsg(err.response?.data?.error || 'Failed to add')
    } finally {
      setAddingCp(false)
    }
  }

  async function handleDeleteCheckpoint(checkpointId) {
    if (!window.confirm('Remove this item-specific checkpoint from ALL inspections of this item?')) return
    try {
      await deleteCheckpointTemplate(checkpointId)
      await fetchAll()
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to delete checkpoint')
    }
  }

  async function loadImageURLs(imgs) {
    const urls = {}
    await Promise.all(imgs.map(async img => {
      try {
        const r = await getWarehouseImageFile(id, img.image_id)
        urls[img.image_id] = URL.createObjectURL(r.data)
      } catch {}
    }))
    setImageURLs(urls)
  }

  function updateResponse(checkpointId, field, value) {
    setResponses(prev => prev.map(r =>
      r.checkpoint_id === checkpointId ? { ...r, [field]: value } : r
    ))
  }

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      await saveWarehouseResponses(id, responses.map(r => ({
        checkpoint_id: r.checkpoint_id,
        result: r.result || null,
        remarks: r.remarks || null,
      })))
      setMsg('Saved successfully')
    } catch (err) {
      setMsg('Save failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setSaving(false)
    }
  }

  async function handleComplete() {
    if (!window.confirm('Mark this inspection as complete? This will auto-determine Pass/Fail based on results.')) return
    setCompleting(true)
    setMsg('')
    try {
      await saveWarehouseResponses(id, responses.map(r => ({
        checkpoint_id: r.checkpoint_id,
        result: r.result || null,
        remarks: r.remarks || null,
      })))
      const r = await completeWarehouseInspection(id, remarks)
      setInspection(r.data)
      setMsg('Inspection completed')
    } catch (err) {
      setMsg('Failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setCompleting(false)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const r = await uploadWarehouseImage(id, file, '__general__')
      const newImg = r.data
      setImages(prev => [...prev, newImg])
      const urlRes = await getWarehouseImageFile(id, newImg.image_id)
      setImageURLs(prev => ({ ...prev, [newImg.image_id]: URL.createObjectURL(urlRes.data) }))
    } catch (err) {
      setMsg('Upload failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSubmitForQA() {
    if (!window.confirm('Submit this inspection for QA review? QA will be notified by email.')) return
    setSubmittingForQA(true)
    setMsg('')
    try {
      const r = await submitWarehouseForQA(id)
      setInspection(r.data)
      setMsg('Submitted for QA review. QA team has been notified.')
    } catch (err) {
      setMsg('Failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setSubmittingForQA(false)
    }
  }

  async function handleQAReview(action) {
    if (!qaRemarks.trim() && action === 'reject') {
      setMsg('Please provide remarks when rejecting.')
      return
    }
    if (!window.confirm(`${action === 'approve' ? 'Approve' : 'Reject'} this warehouse inspection?`)) return
    setQaReviewing(true)
    setMsg('')
    try {
      const r = await qaReviewWarehouseInspection(id, action, qaRemarks)
      setInspection(r.data)
      setMsg(`Inspection ${action === 'approve' ? 'approved' : 'rejected'}. Warehouse team has been notified.`)
      setQaAction('')
    } catch (err) {
      setMsg('Failed: ' + (err.response?.data?.error || err.message))
    } finally {
      setQaReviewing(false)
    }
  }

  async function handleDeleteImage(imageId) {
    if (!window.confirm('Delete this image?')) return
    try {
      await deleteWarehouseImage(id, imageId)
      setImages(prev => prev.filter(i => i.image_id !== imageId))
      setImageURLs(prev => { const n = { ...prev }; delete n[imageId]; return n })
    } catch (err) {
      setMsg('Delete failed: ' + (err.response?.data?.error || err.message))
    }
  }

  // Group responses by section
  const sections = {}
  responses.forEach(r => {
    if (!sections[r.section]) sections[r.section] = []
    sections[r.section].push(r)
  })

  const isComplete = !['in_progress', 'pending'].includes(inspection?.status)
  const canSubmitForQA = ['warehouse', 'admin'].includes(user?.role) &&
    ['in_progress', 'pass', 'fail'].includes(inspection?.status)
  const canQAReview = ['qa', 'admin'].includes(user?.role) &&
    inspection?.status === 'submitted_for_qa'
  const st = inspection ? (STATUS_COLOR[inspection.status] || { bg: '#f1f5f9', color: '#475569', label: inspection.status }) : null

  const card = { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.08)', padding: '20px' }
  const tabStyle = (active) => ({
    padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
    background: active ? '#1C1208' : '#f1f5f9', color: active ? '#fff' : '#475569',
  })

  if (!inspection) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>Loading…</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/warehouse-inspections')} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#374151', flexShrink: 0 }}>
            ← Back
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>
              🏭 {inspection.stage?.charAt(0).toUpperCase() + inspection.stage?.slice(1)} Inspection
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              PO: <strong>{inspection.po_no}</strong> &nbsp;·&nbsp; {inspection.item_name || inspection.item_code}
              {inspection.po_status ? ` · PO ${inspection.po_status}` : ''}
              {inspection.trigger_source ? ` · Trigger: ${inspection.trigger_source}` : ''}
            </p>
          </div>
          {st && (
            <span style={{ background: st.bg, color: st.color, padding: '5px 14px', borderRadius: '9999px', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
              {st.label}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button style={tabStyle(activeTab === 'checklist')} onClick={() => setTab('checklist')}>Checklist</button>
          <button style={tabStyle(activeTab === 'photos')} onClick={() => setTab('photos')}>Photos ({images.length})</button>
          <button style={tabStyle(activeTab === 'prior')} onClick={() => setTab('prior')}>Prior QC ({priorQC.length})</button>
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px',
            background: msg.startsWith('Save') || msg.startsWith('Inspection') ? '#d1fae5' : '#fee2e2',
            color: msg.startsWith('Save') || msg.startsWith('Inspection') ? '#065f46' : '#991b1b' }}>
            {msg}
          </div>
        )}

        {/* ── CHECKLIST TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'checklist' && (
          <div>
            {Object.entries(sections).map(([section, items]) => (
              <div key={section} style={{ ...card, marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: '700', color: '#1C1208', paddingBottom: '10px', borderBottom: '2px solid #e2e8f0' }}>
                  {section}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {items.map(r => {
                    const rc = RESULT_COLORS[r.result || '']
                    return (
                      <div key={r.checkpoint_id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        {/* Criticality indicator */}
                        <div style={{ width: '3px', alignSelf: 'stretch', borderRadius: '2px', flexShrink: 0,
                          background: r.criticality === 'critical' ? '#dc2626' : r.criticality === 'major' ? '#f59e0b' : '#10b981' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#1e293b', marginBottom: '8px' }}>
                            {r.checkpoint}
                            <span style={{ marginLeft: '8px', fontSize: '10px', padding: '1px 6px', borderRadius: '9999px', fontWeight: '600',
                              background: r.criticality === 'critical' ? '#fee2e2' : r.criticality === 'major' ? '#fef3c7' : '#dcfce7',
                              color: r.criticality === 'critical' ? '#991b1b' : r.criticality === 'major' ? '#92400e' : '#166534' }}>
                              {r.criticality}
                            </span>
                          </div>
                          {!isComplete ? (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {RESULT_OPTIONS.map(opt => (
                                <button key={opt} onClick={() => updateResponse(r.checkpoint_id, 'result', opt)}
                                  style={{ padding: '4px 12px', borderRadius: '6px', border: `1.5px solid ${(r.result || '') === opt ? '#1C1208' : '#e2e8f0'}`,
                                    background: (r.result || '') === opt ? '#1C1208' : '#fff',
                                    color: (r.result || '') === opt ? '#fff' : '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                                  {opt === '' ? 'Pending' : opt.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span style={{ ...rc, padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>{rc.label}</span>
                          )}
                          {!isComplete ? (
                            <input
                              value={r.remarks || ''}
                              onChange={e => updateResponse(r.checkpoint_id, 'remarks', e.target.value)}
                              placeholder="Remarks (optional)"
                              style={{ marginTop: '6px', width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#374151', boxSizing: 'border-box' }}
                            />
                          ) : r.remarks ? (
                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>{r.remarks}</div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Item-specific checkpoint management (admin/qa only) */}
            {canManageCheckpoints && (
              <div style={{ ...card, marginBottom: '16px', borderLeft: '3px solid #1C1208' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#1C1208' }}>Item-Specific Checkpoints</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      Add checkpoints that apply only to <strong>{inspection.item_code}</strong> for {inspection.stage} inspections
                    </div>
                  </div>
                  <button onClick={() => { setShowAddCheckpoint(v => !v); setCpMsg('') }}
                    style={{ background: '#1C1208', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                    {showAddCheckpoint ? 'Cancel' : '+ Add'}
                  </button>
                </div>

                {/* List of existing item-specific checkpoints */}
                {responses.filter(r => r.item_code).length > 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {responses.filter(r => r.item_code).map(r => (
                      <div key={r.checkpoint_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#eff6ff', borderRadius: '6px', fontSize: '13px' }}>
                        <span style={{ color: '#1e3b5f' }}><strong>{r.section}</strong>: {r.checkpoint}</span>
                        <button onClick={() => handleDeleteCheckpoint(r.checkpoint_id)}
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', fontWeight: '700', padding: '0 4px' }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddCheckpoint && (
                  <form onSubmit={handleAddCheckpoint} style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input value={newCp.section} onChange={e => setNewCp(p => ({ ...p, section: e.target.value }))}
                        placeholder="Section (e.g. Product Check)"
                        style={{ flex: 1, minWidth: '140px', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                      <select value={newCp.criticality} onChange={e => setNewCp(p => ({ ...p, criticality: e.target.value }))}
                        style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                        <option value="critical">Critical</option>
                        <option value="major">Major</option>
                        <option value="minor">Minor</option>
                      </select>
                    </div>
                    <input value={newCp.checkpoint} onChange={e => setNewCp(p => ({ ...p, checkpoint: e.target.value }))}
                      placeholder="Checkpoint description"
                      style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                    {cpMsg && <div style={{ fontSize: '12px', color: '#dc2626' }}>{cpMsg}</div>}
                    <button type="submit" disabled={addingCp}
                      style={{ alignSelf: 'flex-start', padding: '7px 16px', background: '#1C1208', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: addingCp ? 'default' : 'pointer', opacity: addingCp ? 0.7 : 1 }}>
                      {addingCp ? 'Adding…' : 'Add Checkpoint'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Summary + actions */}
            {!isComplete && (
              <div style={{ ...card, marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '14px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Overall Remarks</span>
                  <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3}
                    placeholder="Overall inspection remarks…"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#1C1208', color: '#fff', border: 'none', fontWeight: '600', fontSize: '14px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Saving…' : 'Save Progress'}
                  </button>
                  <button onClick={handleComplete} disabled={completing}
                    style={{ padding: '10px 20px', borderRadius: '8px', background: '#059669', color: '#fff', border: 'none', fontWeight: '600', fontSize: '14px', cursor: completing ? 'default' : 'pointer', opacity: completing ? 0.7 : 1 }}>
                    {completing ? 'Completing…' : 'Mark as Complete'}
                  </button>
                  {canSubmitForQA && (
                    <button onClick={handleSubmitForQA} disabled={submittingForQA}
                      style={{ padding: '10px 20px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', fontWeight: '600', fontSize: '14px', cursor: submittingForQA ? 'default' : 'pointer', opacity: submittingForQA ? 0.7 : 1 }}>
                      {submittingForQA ? 'Submitting…' : '📋 Submit for QA Review'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Submit for QA — for pass/fail statuses */}
            {canSubmitForQA && isComplete && (
              <div style={{ ...card, marginTop: '16px', borderLeft: '4px solid #1d4ed8' }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: '#1d4ed8', marginBottom: '8px' }}>Submit for QA Review</div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
                  Submit this completed inspection for QA team review. They will be notified by email and in-app notification.
                </p>
                <button onClick={handleSubmitForQA} disabled={submittingForQA}
                  style={{ padding: '10px 20px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', fontWeight: '600', fontSize: '14px', cursor: submittingForQA ? 'default' : 'pointer', opacity: submittingForQA ? 0.7 : 1 }}>
                  {submittingForQA ? 'Submitting…' : '📋 Submit for QA Review'}
                </button>
              </div>
            )}

            {/* QA Review panel */}
            {canQAReview && (
              <div style={{ ...card, marginTop: '16px', borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
                <div style={{ fontWeight: '700', fontSize: '15px', color: '#92400e', marginBottom: '8px' }}>⚠️ QA Review Required</div>
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
                  This inspection was submitted by the warehouse team. Review and approve or reject.
                </p>
                <label style={{ display: 'block', marginBottom: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>QA Remarks {qaAction === 'reject' ? '(required)' : '(optional)'}</span>
                  <textarea value={qaRemarks} onChange={e => setQaRemarks(e.target.value)} rows={3}
                    placeholder="Add your review remarks…"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box' }} />
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleQAReview('approve')} disabled={qaReviewing}
                    style={{ padding: '10px 24px', borderRadius: '8px', background: '#059669', color: '#fff', border: 'none', fontWeight: '700', fontSize: '14px', cursor: qaReviewing ? 'default' : 'pointer', opacity: qaReviewing ? 0.7 : 1 }}>
                    {qaReviewing ? 'Processing…' : '✓ Approve'}
                  </button>
                  <button onClick={() => handleQAReview('reject')} disabled={qaReviewing}
                    style={{ padding: '10px 24px', borderRadius: '8px', background: '#dc2626', color: '#fff', border: 'none', fontWeight: '700', fontSize: '14px', cursor: qaReviewing ? 'default' : 'pointer', opacity: qaReviewing ? 0.7 : 1 }}>
                    {qaReviewing ? 'Processing…' : '✕ Reject'}
                  </button>
                </div>
              </div>
            )}

            {/* Status banner for submitted/reviewed */}
            {['submitted_for_qa', 'qa_approved', 'qa_rejected'].includes(inspection?.status) && (
              <div style={{ ...card, marginTop: '16px',
                background: inspection.status === 'qa_approved' ? '#d1fae5' : inspection.status === 'qa_rejected' ? '#fee2e2' : '#eff6ff',
                border: `1px solid ${inspection.status === 'qa_approved' ? '#6ee7b7' : inspection.status === 'qa_rejected' ? '#fca5a5' : '#93c5fd'}` }}>
                <div style={{ fontWeight: '700', fontSize: '16px', color: inspection.status === 'qa_approved' ? '#065f46' : inspection.status === 'qa_rejected' ? '#991b1b' : '#1d4ed8' }}>
                  {inspection.status === 'qa_approved' ? '✓ QA Approved' : inspection.status === 'qa_rejected' ? '✕ QA Rejected' : '📋 Submitted for QA Review'}
                </div>
                {inspection.qa_remarks && (
                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#374151' }}>
                    <strong>QA Remarks:</strong> {inspection.qa_remarks}
                  </div>
                )}
                {inspection.qa_reviewed_at && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                    Reviewed: {new Date(inspection.qa_reviewed_at).toLocaleString()}
                  </div>
                )}
                {inspection.submitted_at && inspection.status === 'submitted_for_qa' && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                    Submitted: {new Date(inspection.submitted_at).toLocaleString()}
                  </div>
                )}
                {/* QA Reject → allow warehouse to re-open */}
                {inspection.status === 'qa_rejected' && ['warehouse', 'admin'].includes(user?.role) && (
                  <button onClick={async () => {
                    if (!window.confirm('Re-open this inspection for editing?')) return
                    try {
                      const r = await (await import('../api/client.js')).default.patch(`/warehouse-inspections/${id}/reopen`)
                      setInspection(r.data)
                      setMsg('Inspection re-opened for editing.')
                    } catch (err) { setMsg('Failed: ' + (err.response?.data?.error || err.message)) }
                  }}
                    style={{ marginTop: '12px', padding: '8px 18px', borderRadius: '8px', background: '#1C1208', color: '#fff', border: 'none', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                    Re-open for Editing
                  </button>
                )}
              </div>
            )}

            {['pass', 'fail'].includes(inspection?.status) && (
              <div style={{ ...card, marginTop: '16px', background: inspection.status === 'pass' ? '#d1fae5' : '#fee2e2', border: `1px solid ${inspection.status === 'pass' ? '#6ee7b7' : '#fca5a5'}` }}>
                <div style={{ fontWeight: '700', fontSize: '16px', color: inspection.status === 'pass' ? '#065f46' : '#991b1b' }}>
                  {inspection.status === 'pass' ? '✓ Inspection Passed' : '✗ Inspection Failed'}
                </div>
                {inspection.remarks && <div style={{ marginTop: '6px', fontSize: '13px', color: '#374151' }}>{inspection.remarks}</div>}
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                  Completed: {inspection.completed_at ? new Date(inspection.completed_at).toLocaleString() : '—'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PHOTOS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'photos' && (
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>Inspection Photos</h3>
              {!isComplete && (
                <>
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    style={{ background: '#1C1208', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', cursor: uploading ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600', opacity: uploading ? 0.7 : 1 }}>
                    {uploading ? 'Uploading…' : '+ Upload Photo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
                </>
              )}
            </div>
            {images.length === 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ aspectRatio: '4/3', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '24px', color: '#d1d5db' }}>📷</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                {images.map(img => (
                  <div key={img.image_id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    {imageURLs[img.image_id] ? (
                      <img src={imageURLs[img.image_id]} alt={img.file_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Loading…</div>
                    )}
                    {!isComplete && (
                      <button onClick={() => handleDeleteImage(img.image_id)}
                        style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '12px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ✕
                      </button>
                    )}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '10px', padding: '3px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {img.file_name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PRIOR QC TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'prior' && (
          <div>
            <div style={{ marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
              Prior QC inspection history for PO <strong>{inspection.po_no}</strong> / {inspection.item_name || inspection.item_code}
            </div>
            {priorQC.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No prior QC inspections found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {priorQC.map(j => {
                  const pass = parseInt(j.pass_count) || 0
                  const fail = parseInt(j.fail_count) || 0
                  const total = parseInt(j.total_count) || 0
                  const pct = total > 0 ? Math.round((pass / total) * 100) : 0
                  const outcomeColor = j.final_outcome === 'approved' ? '#065f46' : j.final_outcome === 'rejected' ? '#991b1b' : '#92400e'
                  const outcomeBg = j.final_outcome === 'approved' ? '#d1fae5' : j.final_outcome === 'rejected' ? '#fee2e2' : '#fef3c7'
                  return (
                    <div key={j.job_id} style={card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '14px', color: '#1e293b' }}>{j.job_ref}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                            {j.inspection_stage} · {j.inspection_type} · {j.agency_name || 'No agency'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                            Inspection date: {j.inspection_date ? new Date(j.inspection_date).toLocaleDateString() : '—'}
                            {j.actual_inspection_date ? ` · Actual: ${new Date(j.actual_inspection_date).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ background: outcomeBg, color: outcomeColor, padding: '3px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700' }}>
                            {j.final_outcome || j.status || '—'}
                          </span>
                        </div>
                      </div>
                      {total > 0 && (
                        <div style={{ marginTop: '10px' }}>
                          <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: fail > 0 ? '#ef4444' : '#10b981' }} />
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                            {pass} pass · {fail} fail · {total} total checkpoints
                          </div>
                        </div>
                      )}
                      {j.qa_remarks && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#374151', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', borderLeft: '3px solid #94a3b8' }}>
                          QA: {j.qa_remarks}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
