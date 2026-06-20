import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { getJob, makeDecision } from '../api/inspectionJobs.js'
import { getTemplate } from '../api/checklistTemplates.js'
import { getResponses } from '../api/inspectionResponses.js'

const resultColors = {
  pass: { backgroundColor: '#d1fae5', color: '#065f46' },
  fail: { backgroundColor: '#fee2e2', color: '#dc2626' },
  na: { backgroundColor: '#f3f4f6', color: '#6b7280' }
}

const criticalityColors = {
  critical: { backgroundColor: '#fee2e2', color: '#dc2626' },
  major: { backgroundColor: '#fef3c7', color: '#d97706' },
  minor: { backgroundColor: '#dbeafe', color: '#1d4ed8' }
}

// ISO 2859-1 AQL-based suggestion
// Critical: AQL 0 — any fail = reject
// Major: AQL 2.5 — more than 2.5% of answered items = reject
// Minor: AQL 4.0 — more than 4.0% of answered items = reject
function getAQLSuggestion(items, responseMap) {
  const getItemId = (item) => item.item_id || item.checklist_item_id || item.id
  const answered = items.filter(item => {
    const r = responseMap[getItemId(item)]
    return r?.result && r.result !== 'na'
  })
  const total = answered.length
  if (total === 0) return { outcome: null, reason: 'No responses recorded.' }

  const criticalFails = answered.filter(item =>
    item.criticality === 'critical' && responseMap[getItemId(item)]?.result === 'fail'
  ).length

  const majorFails = answered.filter(item =>
    item.criticality === 'major' && responseMap[getItemId(item)]?.result === 'fail'
  ).length

  const minorFails = answered.filter(item =>
    item.criticality === 'minor' && responseMap[getItemId(item)]?.result === 'fail'
  ).length

  const majorPct = (majorFails / total) * 100
  const minorPct = (minorFails / total) * 100

  if (criticalFails > 0) {
    return {
      outcome: 'rejected',
      reason: `${criticalFails} critical defect(s) found — AQL 0 tolerance exceeded. Rejection required per ISO 2859-1.`
    }
  }
  if (majorPct > 2.5) {
    return {
      outcome: 'rejected',
      reason: `Major defect rate ${majorPct.toFixed(1)}% exceeds AQL 2.5 limit per ISO 2859-1.`
    }
  }
  if (minorPct > 4.0) {
    return {
      outcome: 'rejected',
      reason: `Minor defect rate ${minorPct.toFixed(1)}% exceeds AQL 4.0 limit per ISO 2859-1.`
    }
  }
  return {
    outcome: 'approved',
    reason: `No AQL thresholds exceeded (Critical: 0 fails, Major: ${majorPct.toFixed(1)}% ≤ 2.5%, Minor: ${minorPct.toFixed(1)}% ≤ 4.0%) per ISO 2859-1.`
  }
}

export default function QAReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [job, setJob] = useState(null)
  const [items, setItems] = useState([])
  const [responseMap, setResponseMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [outcome, setOutcome] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  const getItemId = (item) => item.item_id || item.checklist_item_id || item.id

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const jobRes = await getJob(id)
        const jobData = jobRes.data?.job || jobRes.data
        setJob(jobData)

        const templateId = jobData?.checklist_template_id
        if (!templateId) {
          setError('No checklist template assigned to this job.')
          return
        }

        const [templateRes, responsesRes] = await Promise.all([
          getTemplate(templateId),
          getResponses(id).catch(() => ({ data: [] }))
        ])

        const templateData = templateRes.data?.template || templateRes.data
        const fetchedItems = templateData?.items || templateData?.checklist_items || []
        setItems(fetchedItems)

        const existingResponses = responsesRes.data?.responses || responsesRes.data || []
        const rMap = {}
        if (Array.isArray(existingResponses)) {
          existingResponses.forEach(r => {
            rMap[r.checklist_item_id] = r
          })
        }
        setResponseMap(rMap)
      } catch (err) {
        setError('Failed to load review data.')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [id])

  const totalItems = items.length
  const passCount = items.filter(item => responseMap[getItemId(item)]?.result === 'pass').length
  const failCount = items.filter(item => responseMap[getItemId(item)]?.result === 'fail').length
  const naCount = items.filter(item => responseMap[getItemId(item)]?.result === 'na').length
  const criticalFails = items.filter(item =>
    item.criticality === 'critical' && responseMap[getItemId(item)]?.result === 'fail'
  ).length

  const aql = getAQLSuggestion(items, responseMap)

  const handleDecision = async (e) => {
    e.preventDefault()
    if (!outcome) {
      setSubmitError('Please select Approve or Reject.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await makeDecision(id, { outcome, remarks })
      setSuccess(true)
      setTimeout(() => navigate(`/jobs/${id}`), 2000)
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Failed to submit decision. Please try again.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <p style={{ color: '#6b7280' }}>Loading review data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Navbar />
        <div style={{ maxWidth: '700px', margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ color: '#dc2626' }}>{error}</p>
          <Link to={`/jobs/${id}`} style={{ color: '#1e40af' }}>Back to Job</Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Navbar />
        <div style={{ maxWidth: '500px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 8px rgba(0,0,0,0.1)', padding: '48px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              {outcome === 'approved' ? '✅' : '❌'}
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: '700', color: '#111827' }}>
              Decision Submitted!
            </h2>
            <p style={{ color: '#6b7280', fontSize: '15px' }}>
              Job has been {outcome === 'approved' ? 'approved' : 'rejected'}. Redirecting to job details...
            </p>
          </div>
        </div>
      </div>
    )
  }

  const groupedItems = items.reduce((acc, item) => {
    const section = item.section || 'General'
    if (!acc[section]) acc[section] = []
    acc[section].push(item)
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
            <Link to={`/jobs/${id}`} style={{ color: '#1e40af', textDecoration: 'none' }}>Job Details</Link>
            <span style={{ margin: '0 8px' }}>/</span>
            <span>QA Review</span>
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            QA Review & Decision
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            PO: <strong>{job?.po_no}</strong> | Supplier: <strong>{job?.supplier_code}</strong>
          </p>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Items', value: totalItems, color: '#1e40af', bg: '#dbeafe' },
            { label: 'Pass', value: passCount, color: '#059669', bg: '#d1fae5' },
            { label: 'Fail', value: failCount, color: '#dc2626', bg: '#fee2e2' },
            { label: 'N/A', value: naCount, color: '#6b7280', bg: '#f3f4f6' },
            { label: 'Critical Fails', value: criticalFails, color: '#b91c1c', bg: '#fee2e2' }
          ].map(stat => (
            <div key={stat.label} style={{
              backgroundColor: stat.bg, borderRadius: '8px', padding: '14px 20px',
              flex: '1', minWidth: '100px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '12px', color: stat.color, fontWeight: '600', marginTop: '2px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* AQL Suggestion */}
        {aql.outcome && (
          <div style={{
            backgroundColor: aql.outcome === 'approved' ? '#f0fdf4' : '#fef2f2',
            border: `2px solid ${aql.outcome === 'approved' ? '#86efac' : '#fca5a5'}`,
            borderRadius: '10px', padding: '16px 20px', marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '22px', marginTop: '2px' }}>{aql.outcome === 'approved' ? '✅' : '❌'}</span>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '700', color: aql.outcome === 'approved' ? '#15803d' : '#dc2626' }}>
                  ISO 2859-1 AQL Suggestion: {aql.outcome === 'approved' ? 'APPROVE' : 'REJECT'}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: aql.outcome === 'approved' ? '#166534' : '#7f1d1d', lineHeight: '1.5' }}>
                  {aql.reason}
                </p>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Checklist responses */}
          <div style={{ flex: 1, minWidth: '400px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
              Checklist Responses
            </h2>

            {Object.entries(groupedItems).map(([section, sectionItems]) => (
              <div key={section} style={{ marginBottom: '16px' }}>
                <div style={{
                  backgroundColor: '#374151', color: '#fff', padding: '10px 16px',
                  borderRadius: '6px 6px 0 0', fontSize: '13px', fontWeight: '600'
                }}>
                  {section}
                </div>
                <div style={{
                  border: '1px solid #e5e7eb', borderTop: 'none',
                  borderRadius: '0 0 6px 6px', backgroundColor: '#fff', overflow: 'hidden'
                }}>
                  {sectionItems.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((item, idx) => {
                    const itemId = getItemId(item)
                    const resp = responseMap[itemId]
                    const result = resp?.result

                    return (
                      <div key={itemId} style={{
                        padding: '14px 16px',
                        borderBottom: idx < sectionItems.length - 1 ? '1px solid #f3f4f6' : 'none'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: resp?.remark ? '6px' : 0 }}>
                          <p style={{ margin: 0, fontSize: '13px', color: '#374151', lineHeight: '1.4', flex: 1 }}>
                            {item.checkpoint_text || item.text}
                          </p>
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <span style={{
                              ...(criticalityColors[item.criticality] || {}),
                              padding: '2px 8px', borderRadius: '9999px',
                              fontSize: '10px', fontWeight: '700', textTransform: 'uppercase'
                            }}>
                              {item.criticality}
                            </span>
                            <span style={{
                              ...(result ? resultColors[result] : { backgroundColor: '#f3f4f6', color: '#9ca3af' }),
                              padding: '2px 10px', borderRadius: '9999px',
                              fontSize: '11px', fontWeight: '700', textTransform: 'uppercase'
                            }}>
                              {result ? result.toUpperCase() : 'No Response'}
                            </span>
                          </div>
                        </div>
                        {resp?.remark && (
                          <p style={{
                            margin: '6px 0 0', fontSize: '12px', color: '#6b7280', fontStyle: 'italic',
                            backgroundColor: '#f9fafb', padding: '6px 10px', borderRadius: '4px'
                          }}>
                            Remark: {resp.remark}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Decision form */}
          <div style={{
            width: '300px', flexShrink: 0, backgroundColor: '#fff',
            borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            padding: '24px', position: 'sticky', top: '80px'
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
              Your Decision
            </h2>

            {submitError && (
              <div style={{
                backgroundColor: '#fef2f2', border: '1px solid #fca5a5',
                color: '#dc2626', padding: '10px 14px', borderRadius: '6px',
                marginBottom: '16px', fontSize: '13px'
              }}>
                {submitError}
              </div>
            )}

            <form onSubmit={handleDecision}>
              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                  Decision <span style={{ color: '#dc2626' }}>*</span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { value: 'approved', label: 'Approve', icon: '✓', color: '#059669', bg: '#f0fdf4', border: '#86efac' },
                    { value: 'rejected', label: 'Reject', icon: '✗', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' }
                  ].map(opt => (
                    <label key={opt.value} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                      padding: '12px 14px', borderRadius: '8px',
                      border: `2px solid ${outcome === opt.value ? opt.border : '#e5e7eb'}`,
                      backgroundColor: outcome === opt.value ? opt.bg : '#fff',
                      transition: 'all 0.15s'
                    }}>
                      <input type="radio" name="outcome" value={opt.value}
                        checked={outcome === opt.value}
                        onChange={() => setOutcome(opt.value)}
                        style={{ display: 'none' }} />
                      <span style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        backgroundColor: outcome === opt.value ? opt.color : '#e5e7eb',
                        color: '#fff', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '14px', fontWeight: '700', flexShrink: 0
                      }}>
                        {opt.icon}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: outcome === opt.value ? opt.color : '#374151' }}>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                  Remarks
                </label>
                <textarea
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Add your QA remarks..."
                  rows={4}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db',
                    borderRadius: '6px', fontSize: '13px', resize: 'vertical',
                    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', color: '#374151'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !outcome}
                style={{
                  width: '100%',
                  backgroundColor: submitting || !outcome ? '#9ca3af'
                    : outcome === 'approved' ? '#059669' : '#dc2626',
                  color: '#fff', border: 'none', padding: '11px',
                  borderRadius: '7px', fontSize: '14px', fontWeight: '600',
                  cursor: (submitting || !outcome) ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Decision'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
