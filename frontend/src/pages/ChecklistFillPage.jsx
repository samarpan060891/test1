import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getJob, submitJob } from '../api/inspectionJobs.js'
import { getTemplate } from '../api/checklistTemplates.js'
import { getResponses, submitResponses } from '../api/inspectionResponses.js'
import axios from 'axios'

const apiBase = import.meta.env.VITE_API_URL || ''

function ImageUploader({ jobId, sectionKey, readOnly }) {
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef()

  useEffect(() => {
    const token = localStorage.getItem('token')
    axios.get(`${apiBase}/api/checklist-images/${jobId}/images`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      setImages(r.data.filter(img => img.section_key === sectionKey))
    }).catch(() => {})
  }, [jobId, sectionKey])

  async function handleFiles(files) {
    if (!files?.length) return
    const token = localStorage.getItem('token')
    const remaining = 10 - images.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (toUpload.length === 0) { setError('Maximum 10 images reached for this section.'); return }
    setUploading(true); setError('')
    for (const file of toUpload) {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('section_key', sectionKey)
      try {
        const r = await axios.post(`${apiBase}/api/checklist-images/${jobId}/images`, fd, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setImages(prev => [...prev, r.data])
      } catch (err) {
        setError(err.response?.data?.error || 'Upload failed')
      }
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDelete(imageId) {
    const token = localStorage.getItem('token')
    try {
      await axios.delete(`${apiBase}/api/checklist-images/${jobId}/images/${imageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setImages(prev => prev.filter(i => i.image_id !== imageId))
    } catch { setError('Delete failed') }
  }

  return (
    <div style={{ padding: '14px 20px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          📷 Photos ({images.length}/10)
        </span>
        {!readOnly && images.length < 10 && (
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer',
            background: '#1e40af', color: '#fff', padding: '5px 12px', borderRadius: '6px',
            fontSize: '12px', fontWeight: '700',
          }}>
            {uploading ? 'Uploading…' : '+ Add Photos'}
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => handleFiles(e.target.files)} disabled={uploading} />
          </label>
        )}
      </div>
      {error && <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px' }}>{error}</div>}
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {images.map(img => (
            <div key={img.image_id} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 }}>
              <img
                src={`${apiBase}/api/checklist-images/${jobId}/images/${img.image_id}/file`}
                alt={img.file_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {!readOnly && (
                <button onClick={() => handleDelete(img.image_id)} style={{
                  position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px',
                  borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                  fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
      {images.length === 0 && !readOnly && (
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>No photos yet. Tap "+ Add Photos" to attach images.</div>
      )}
      {images.length === 0 && readOnly && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: '80px', height: '80px', borderRadius: '6px', border: '1.5px dashed #d1d5db', background: '#f3f4f6', flexShrink: 0 }} />
          ))}
        </div>
      )}
    </div>
  )
}

function VideoLinksPanel({ jobId, readOnly }) {
  const [links, setLinks] = useState([])
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('token')
    axios.get(`${apiBase}/api/checklist-images/${jobId}/video-links`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => setLinks(r.data)).catch(() => {})
  }, [jobId])

  async function handleAdd() {
    if (!url.trim()) { setError('Please enter a URL'); return }
    setSaving(true); setError('')
    const token = localStorage.getItem('token')
    try {
      const r = await axios.post(`${apiBase}/api/checklist-images/${jobId}/video-links`, { url, label }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setLinks(prev => [...prev, r.data])
      setUrl(''); setLabel('')
    } catch (err) { setError(err.response?.data?.error || 'Failed to save link') }
    finally { setSaving(false) }
  }

  async function handleDelete(linkId) {
    const token = localStorage.getItem('token')
    try {
      await axios.delete(`${apiBase}/api/checklist-images/${jobId}/video-links/${linkId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setLinks(prev => prev.filter(l => l.link_id !== linkId))
    } catch {}
  }

  return (
    <div style={{ background: '#fff', borderRadius: '10px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
      <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>🎥 Video Links</div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '14px' }}>
        If you have inspection videos, upload them to OneDrive, WeTransfer, Google Drive, or Dropbox and paste the share link here.
      </div>

      {links.map(l => (
        <div key={l.link_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '9px 12px', marginBottom: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔗</span>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {l.label && <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '2px' }}>{l.label}</div>}
            <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#1e40af', wordBreak: 'break-all' }}>{l.url}</a>
          </div>
          {!readOnly && (
            <button onClick={() => handleDelete(l.link_id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px', padding: '2px', flexShrink: 0 }}>×</button>
          )}
        </div>
      ))}

      {!readOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Label (optional, e.g. 'Packaging Video')"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={url} onChange={e => setUrl(e.target.value)}
              placeholder="Paste OneDrive / WeTransfer / Google Drive share link…"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
            />
            <button onClick={handleAdd} disabled={saving} style={{
              background: '#1e40af', color: '#fff', border: 'none', padding: '8px 16px',
              borderRadius: '6px', fontWeight: '700', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
            }}>+ Add Link</button>
          </div>
          {error && <div style={{ fontSize: '12px', color: '#dc2626' }}>{error}</div>}
        </div>
      )}

      {links.length === 0 && readOnly && (
        <div style={{ fontSize: '12px', color: '#9ca3af' }}>No video links attached.</div>
      )}
    </div>
  )
}

const criticalityColors = {
  critical: { backgroundColor: '#fee2e2', color: '#dc2626' },
  major: { backgroundColor: '#fef3c7', color: '#d97706' },
  minor: { backgroundColor: '#dbeafe', color: '#1d4ed8' }
}

// ISO 2859-1 Normal Inspection Level II
// [lotMin, lotMax, code, sampleSize]
const ISO_LOT_TABLE = [
  [2,      8,       'A', 2],
  [9,      15,      'B', 3],
  [16,     25,      'C', 5],
  [26,     50,      'D', 8],
  [51,     90,      'E', 13],
  [91,     150,     'F', 20],
  [151,    280,     'G', 32],
  [281,    500,     'H', 50],
  [501,    1200,    'J', 80],
  [1201,   3200,    'K', 125],
  [3201,   10000,   'L', 200],
  [10001,  35000,   'M', 315],
  [35001,  150000,  'N', 500],
  [150001, 500000,  'P', 800],
  [500001, Infinity,'Q', 1250],
]

// Ac/Re by code letter for AQL 0.65, 1.0, 1.5, 2.5, 4.0 (null = use arrow from table)
// Format: [Ac, Re]  null = no accept at this AQL for this code
const ISO_ACRE = {
  //      0.65      1.0       1.5       2.5       4.0
  A: [  null,     null,     null,     null,     null   ],
  B: [  null,     null,     null,     null,     null   ],
  C: [  null,     null,     null,    [0,1],    [0,1]   ],
  D: [  null,     null,    [0,1],    [0,1],    [1,2]   ],
  E: [  null,    [0,1],    [0,1],    [1,2],    [2,3]   ],
  F: [ [0,1],    [0,1],    [1,2],    [2,3],    [3,4]   ],
  G: [ [0,1],    [1,2],    [1,2],    [3,4],    [5,6]   ],
  H: [ [0,1],    [1,2],    [2,3],    [5,6],    [7,8]   ],
  J: [ [1,2],    [2,3],    [3,4],    [7,8],   [10,11]  ],
  K: [ [2,3],    [3,4],    [5,6],   [10,11],  [14,15]  ],
  L: [ [3,4],    [5,6],    [7,8],   [14,15],  [21,22]  ],
  M: [ [5,6],    [7,8],   [10,11],  [21,22],   null    ],
  N: [ [7,8],   [10,11],  [14,15],   null,      null   ],
  P: [[10,11],  [14,15],  [21,22],   null,      null   ],
  Q: [[14,15],  [21,22],   null,     null,      null   ],
}
const AQL_LABELS = ['0.65', '1.0', '1.5', '2.5', '4.0']

function getISO2859Sample(lotSize) {
  if (!lotSize || lotSize < 2) return null
  const row = ISO_LOT_TABLE.find(([min, max]) => lotSize >= min && lotSize <= max)
  if (!row) return null
  const code = row[2]
  const sampleSize = row[3]
  const acreRow = ISO_ACRE[code] || []
  return {
    code,
    sampleSize,
    acre: AQL_LABELS.map((aql, i) => ({ aql, acre: acreRow[i] || null })),
  }
}

export default function ChecklistFillPage() {
  const { id } = useParams()
  const { t } = useLanguage()

  const [job, setJob] = useState(null)
  // allSections: [{ itemName, itemCode, section, items: [...] }]
  const [allSections, setAllSections] = useState([])
  const [totalItems, setTotalItems] = useState(0)
  const [responses, setResponses] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  const [actualDate, setActualDate] = useState(new Date().toISOString().split('T')[0])
  const [draftSaved, setDraftSaved] = useState(false)

  const DRAFT_KEY = `checklist_draft_${id}`

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const jobRes = await getJob(id)
        const jobData = jobRes.data?.job || jobRes.data
        setJob(jobData)

        const jobItems = jobData?.items || []

        // Determine which templates to load
        let templateEntries = []
        if (jobItems.length > 0) {
          templateEntries = jobItems.map(ji => ({
            itemCode: ji.item_code,
            itemName: ji.item_name,
            templateId: ji.checklist_template_id,
            quantity: ji.quantity,
          }))
        } else if (jobData?.checklist_template_id) {
          // Legacy single-item job
          templateEntries = [{
            itemCode: jobData.item_code,
            itemName: jobData.item_name || jobData.item_code,
            templateId: jobData.checklist_template_id,
            quantity: jobData.quantity,
          }]
        }

        if (templateEntries.length === 0) {
          setError('No checklist template assigned to this job.')
          return
        }

        const [responsesRes, ...templateResults] = await Promise.all([
          getResponses(id).catch(() => ({ data: { responses: [] } })),
          ...templateEntries.map(e => getTemplate(e.templateId)),
        ])

        const existingResponses = responsesRes.data?.responses || responsesRes.data || []
        const responseMap = {}
        if (Array.isArray(existingResponses)) {
          existingResponses.forEach(r => {
            responseMap[r.checklist_item_id] = { result: r.result, remark: r.remark || '' }
          })
        }
        // Merge locally saved draft on top of server data
        try {
          const draft = localStorage.getItem(`checklist_draft_${id}`)
          if (draft) {
            const parsed = JSON.parse(draft)
            Object.assign(responseMap, parsed)
          }
        } catch {}
        setResponses(responseMap)

        // Build sections grouped by item then by section
        const sections = []
        let count = 0
        templateEntries.forEach((entry, idx) => {
          const templateData = templateResults[idx]?.data?.template || templateResults[idx]?.data
          const checklistItems = templateData?.items || templateData?.checklist_items || []
          count += checklistItems.length
          // Group by section
          const bySection = checklistItems.reduce((acc, item) => {
            const s = item.section || 'General'
            if (!acc[s]) acc[s] = []
            acc[s].push(item)
            return acc
          }, {})
          Object.entries(bySection).forEach(([section, items]) => {
            sections.push({ itemName: entry.itemName, itemCode: entry.itemCode, quantity: entry.quantity, section, items })
          })
        })
        setAllSections(sections)
        setTotalItems(count)
      } catch (err) {
        setError('Failed to load checklist data.')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [id])

  const handleResponseChange = (itemId, field, value) => {
    setResponses(prev => {
      const next = { ...prev, [itemId]: { ...prev[itemId], [field]: value } }
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch {}
      setDraftSaved(true)
      return next
    })
  }

  const filledCount = allSections.reduce((acc, s) =>
    acc + s.items.filter(item => {
      const iid = item.item_id || item.checklist_item_id || item.id
      return !!responses[iid]?.result
    }).length
  , 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')

    const allItems = allSections.flatMap(s => s.items)
    const unfilledItems = allItems.filter(item => {
      const itemId = item.item_id || item.checklist_item_id || item.id
      return !responses[itemId]?.result
    })
    if (unfilledItems.length > 0) {
      setSubmitError(`Please fill all ${unfilledItems.length} remaining item(s) before submitting.`)
      return
    }

    const failWithoutRemark = allItems.filter(item => {
      const itemId = item.item_id || item.checklist_item_id || item.id
      return responses[itemId]?.result === 'fail' && !responses[itemId]?.remark?.trim()
    })
    if (failWithoutRemark.length > 0) {
      setSubmitError(`Remarks are mandatory for failed items. Please add remarks for ${failWithoutRemark.length} failed item(s).`)
      return
    }

    setSubmitting(true)
    try {
      const responsePayload = allItems.map(item => {
        const itemId = item.item_id || item.checklist_item_id || item.id
        return {
          checklist_item_id: itemId,
          result: responses[itemId]?.result,
          remark: responses[itemId]?.remark || ''
        }
      })
      await submitResponses(id, responsePayload)
      await submitJob(id, { actual_inspection_date: actualDate })
      try { localStorage.removeItem(DRAFT_KEY) } catch {}
      setSuccess(true)
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Failed to submit checklist. Please try again.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="page"><Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <p style={{ color: '#6b7280' }}>{t('common_loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page"><Navbar />
        <div style={{ maxWidth: '700px', margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ color: '#dc2626', fontSize: '16px' }}>{error}</p>
          <Link to={`/jobs/${id}`} style={{ color: '#1e40af' }}>{t('jobdetail_job_breadcrumb')}</Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="page"><Navbar />
        <div style={{ maxWidth: '600px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 8px rgba(0,0,0,0.1)', padding: '48px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: '700', color: '#111827' }}>
              {t('checklist_submitted') || 'Checklist Submitted!'}
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '15px' }}>
              {t('checklist_submitted_msg') || 'Your inspection responses have been saved and submitted for QA review.'}
            </p>
            <Link to={`/jobs/${id}`} style={{ backgroundColor: '#1e40af', color: '#fff', padding: '10px 24px', borderRadius: '7px', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}>
              {t('job_detail_title')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const progressPct = totalItems > 0 ? Math.round((filledCount / totalItems) * 100) : 0

  // Track which item we're currently rendering to show item headers
  let lastItemCode = null

  return (
    <div className="page">
      <Navbar />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              <Link to={`/jobs/${id}`} style={{ color: '#1e40af', textDecoration: 'none' }}>{t('job_detail_title')}</Link>
              <span style={{ margin: '0 8px' }}>/</span>
              <span>{t('checklist_title')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {draftSaved && (
                <span style={{ fontSize: '11px', color: '#15803d', background: '#f0fdf4', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '9999px', fontWeight: '600' }}>
                  ✓ Draft auto-saved
                </span>
              )}
              <Link to={`/jobs/${id}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#1C1208', color: '#fff', borderRadius: '7px', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>
                ← Back to Job Details
              </Link>
            </div>
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            {t('checklist_fill_title') || 'Fill Inspection Checklist'}
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            PO: <strong>{job?.po_no}</strong> | Agency: <strong>{job?.agency_code}</strong>
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                Progress: {filledCount} of {totalItems} items filled
              </span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: progressPct === 100 ? '#059669' : '#1e40af' }}>
                {progressPct}%
              </span>
            </div>
            <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, backgroundColor: progressPct === 100 ? '#059669' : '#1e40af', borderRadius: '9999px', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        </div>

        {submitError && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
            {submitError}
          </div>
        )}

        {/* Checklist form */}
        <form onSubmit={handleSubmit}>
          {allSections.map((group, groupIdx) => {
            const showItemHeader = group.itemCode !== lastItemCode
            lastItemCode = group.itemCode

            return (
              <div key={`${group.itemCode}-${group.section}-${groupIdx}`} style={{ marginBottom: '24px' }}>
                {/* Item header — shown once per item */}
                {showItemHeader && (() => {
                  const iso = getISO2859Sample(group.quantity)
                  return (
                    <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: '8px 8px 0 0', overflow: 'hidden' }}>
                      {/* Title row */}
                      <div style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 10px', borderRadius: '9999px', fontSize: '11px' }}>{group.itemCode}</span>
                        <span style={{ flex: 1 }}>{group.itemName}</span>
                        {iso && (
                          <span style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 12px', borderRadius: '9999px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            Lot: {group.quantity} pcs · Sample: <strong>{iso.sampleSize}</strong> pcs · Code {iso.code}
                          </span>
                        )}
                      </div>
                      {/* ISO 2859-1 Ac/Re table */}
                      {iso && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', padding: '8px 20px 10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginRight: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ISO 2859-1 Normal · AQL →</span>
                          {iso.acre.map(({ aql, acre }) => (
                            <div key={aql} style={{ background: acre ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '4px 10px', textAlign: 'center', minWidth: '60px' }}>
                              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>AQL {aql}</div>
                              {acre
                                ? <div style={{ fontSize: '12px', fontWeight: '700' }}>
                                    <span style={{ color: '#86efac' }}>Ac {acre[0]}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 3px' }}>/</span>
                                    <span style={{ color: '#fca5a5' }}>Re {acre[1]}</span>
                                  </div>
                                : <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>—</div>
                              }
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Section header */}
                <div style={{
                  backgroundColor: '#1e40af',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: showItemHeader ? '0' : '8px 8px 0 0',
                  fontSize: '13px',
                  fontWeight: '700',
                  letterSpacing: '0.02em',
                  paddingLeft: showItemHeader ? '32px' : '20px',
                }}>
                  {group.section}
                </div>

                <div style={{ backgroundColor: '#fff', borderRadius: '0 0 8px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid #e5e7eb', borderTop: 'none' }}>
                  {group.items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((item, idx) => {
                    const itemId = item.item_id || item.checklist_item_id || item.id
                    const resp = responses[itemId] || {}
                    const isFilled = !!resp.result
                    return (
                      <div key={itemId} style={{ padding: '18px 20px', borderBottom: idx < group.items.length - 1 ? '1px solid #f3f4f6' : 'none', backgroundColor: isFilled ? '#fafffe' : '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                          <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#111827', fontWeight: '500', lineHeight: '1.4', flex: 1 }}>
                            {item.checkpoint_text || item.text}
                          </p>
                          <span style={{ ...(criticalityColors[item.criticality] || { backgroundColor: '#f3f4f6', color: '#374151' }), padding: '2px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', flexShrink: 0 }}>
                            {item.criticality}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                          {['pass', 'fail', 'na'].map(result => (
                            <label key={result} style={{
                              display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 14px',
                              borderRadius: '6px',
                              border: `2px solid ${resp.result === result ? (result === 'pass' ? '#059669' : result === 'fail' ? '#dc2626' : '#6b7280') : '#e5e7eb'}`,
                              backgroundColor: resp.result === result ? (result === 'pass' ? '#f0fdf4' : result === 'fail' ? '#fef2f2' : '#f9fafb') : '#fff',
                              fontSize: '13px', fontWeight: '600',
                              color: resp.result === result ? (result === 'pass' ? '#059669' : result === 'fail' ? '#dc2626' : '#374151') : '#6b7280',
                            }}>
                              <input type="radio" name={`result_${itemId}`} value={result} checked={resp.result === result}
                                onChange={() => handleResponseChange(itemId, 'result', result)} style={{ display: 'none' }} />
                              {result === 'pass' ? `✓ ${t('checklist_pass')}` : result === 'fail' ? `✗ ${t('checklist_fail')}` : `— ${t('checklist_na')}`}
                            </label>
                          ))}
                        </div>
                        {resp.result === 'fail' && !resp.remark?.trim() && (
                          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>
                            ⚠ Remarks are mandatory for failed items
                          </p>
                        )}
                        <textarea
                          value={resp.remark || ''}
                          onChange={e => handleResponseChange(itemId, 'remark', e.target.value)}
                          placeholder={resp.result === 'fail' ? 'Describe the defect / failure reason...' : `${t('checklist_remarks')} (optional)...`}
                          rows={2}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '5px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', outline: 'none', color: '#374151', fontFamily: 'inherit', backgroundColor: resp.result === 'fail' && !resp.remark?.trim() ? '#fff5f5' : '#fafafa', border: resp.result === 'fail' && !resp.remark?.trim() ? '1px solid #fca5a5' : '1px solid #e5e7eb' }}
                        />
                      </div>
                    )
                  })}
                  {/* Per-section image uploader */}
                  <ImageUploader
                    jobId={id}
                    sectionKey={`${group.itemCode}__${group.section}`}
                    readOnly={job?.status !== 'mapped_awaiting_inspection'}
                  />
                </div>
              </div>
            )
          })}

          {/* Defect Images */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ background: '#7f1d1d', color: '#fff', padding: '10px 20px', borderRadius: '8px 8px 0 0', fontSize: '13px', fontWeight: '700' }}>
              🔴 Defect Images
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 8px 8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: '12px 20px 4px', fontSize: '12px', color: '#6b7280' }}>
                Attach photos of any defects found during inspection. Maximum 10 images.
              </div>
              <ImageUploader
                jobId={id}
                sectionKey="__defects__"
                readOnly={job?.status !== 'mapped_awaiting_inspection'}
              />
            </div>
          </div>

          {/* Video Links */}
          <VideoLinksPanel jobId={id} readOnly={job?.status !== 'mapped_awaiting_inspection'} />

          {/* Actual Inspection Date */}
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>
              {t('checklist_actual_date')} <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input type="date" value={actualDate} onChange={e => setActualDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={{ padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', color: '#111827', outline: 'none', width: '220px' }} />
          </div>

          {/* Submit */}
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {filledCount}/{totalItems} items completed
              {filledCount < totalItems && <span style={{ color: '#d97706', marginLeft: '8px' }}>({totalItems - filledCount} remaining)</span>}
            </span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Link to={`/jobs/${id}`} style={{ padding: '10px 20px', borderRadius: '7px', fontSize: '14px', fontWeight: '500', textDecoration: 'none', color: '#374151', border: '1px solid #d1d5db', backgroundColor: '#fff' }}>
                {t('common_cancel')}
              </Link>
              <button type="submit" disabled={submitting} style={{ backgroundColor: submitting ? '#93c5fd' : '#1e40af', color: '#fff', border: 'none', padding: '10px 28px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}>
                {submitting ? t('checklist_submitting') : t('checklist_submit')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
