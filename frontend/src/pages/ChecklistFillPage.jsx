import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getJob, submitJob } from '../api/inspectionJobs.js'
import { getTemplate } from '../api/checklistTemplates.js'
import { getResponses, submitResponses } from '../api/inspectionResponses.js'

const criticalityColors = {
  critical: { backgroundColor: '#fee2e2', color: '#dc2626' },
  major: { backgroundColor: '#fef3c7', color: '#d97706' },
  minor: { backgroundColor: '#dbeafe', color: '#1d4ed8' }
}

export default function ChecklistFillPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const [job, setJob] = useState(null)
  const [items, setItems] = useState([])
  const [responses, setResponses] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  const [actualDate, setActualDate] = useState(new Date().toISOString().split('T')[0])

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
          getResponses(id).catch(() => ({ data: { responses: [] } }))
        ])

        const templateData = templateRes.data?.template || templateRes.data
        const fetchedItems = templateData?.items || templateData?.checklist_items || []
        setItems(fetchedItems)

        const existingResponses = responsesRes.data?.responses || responsesRes.data || []
        const responseMap = {}
        if (Array.isArray(existingResponses)) {
          existingResponses.forEach(r => {
            responseMap[r.checklist_item_id] = { result: r.result, remark: r.remark || '' }
          })
        }
        setResponses(responseMap)
      } catch (err) {
        setError('Failed to load checklist data.')
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [id])

  const handleResponseChange = (itemId, field, value) => {
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value }
    }))
  }

  const filledCount = items.filter(item => {
    const r = responses[item.item_id || item.checklist_item_id || item.id]
    return r?.result
  }).length

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')

    const unfilledItems = items.filter(item => {
      const itemId = item.item_id || item.checklist_item_id || item.id
      return !responses[itemId]?.result
    })

    if (unfilledItems.length > 0) {
      setSubmitError(`Please fill all ${unfilledItems.length} remaining item(s) before submitting.`)
      return
    }

    setSubmitting(true)
    try {
      const responsePayload = items.map(item => {
        const itemId = item.item_id || item.checklist_item_id || item.id
        return {
          checklist_item_id: itemId,
          result: responses[itemId]?.result,
          remark: responses[itemId]?.remark || ''
        }
      })

      await submitResponses(id, responsePayload)
      await submitJob(id, { actual_inspection_date: actualDate })
      setSuccess(true)
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Failed to submit checklist. Please try again.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Group items by section
  const groupedItems = items.reduce((acc, item) => {
    const section = item.section || 'General'
    if (!acc[section]) acc[section] = []
    acc[section].push(item)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="page">
        <Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
          <p style={{ color: '#6b7280' }}>{t('common_loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <Navbar />
        <div style={{ maxWidth: '700px', margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
          <p style={{ color: '#dc2626', fontSize: '16px' }}>{error}</p>
          <Link to={`/jobs/${id}`} style={{ color: '#1e40af' }}>Back to Job</Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="page">
        <Navbar />
        <div style={{ maxWidth: '600px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            boxShadow: '0 1px 8px rgba(0,0,0,0.1)',
            padding: '48px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: '700', color: '#111827' }}>
              {t('checklist_submitted') || 'Checklist Submitted!'}
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '15px' }}>
              {t('checklist_submitted_msg') || 'Your inspection responses have been saved and submitted for QA review.'}
            </p>
            <Link
              to={`/jobs/${id}`}
              style={{
                backgroundColor: '#1e40af',
                color: '#fff',
                padding: '10px 24px',
                borderRadius: '7px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              {t('job_detail_title')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const progressPct = items.length > 0 ? Math.round((filledCount / items.length) * 100) : 0

  return (
    <div className="page">
      <Navbar />

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
            <Link to={`/jobs/${id}`} style={{ color: '#1e40af', textDecoration: 'none' }}>{t('job_detail_title')}</Link>
            <span style={{ margin: '0 8px' }}>/</span>
            <span>{t('checklist_title')}</span>
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            {t('checklist_fill_title') || 'Fill Inspection Checklist'}
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            PO: <strong>{job?.po_no}</strong> | Agency: <strong>{job?.agency_code}</strong>
          </p>
        </div>

        {/* Progress bar */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                Progress: {filledCount} of {items.length} items filled
              </span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: progressPct === 100 ? '#059669' : '#1e40af' }}>
                {progressPct}%
              </span>
            </div>
            <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progressPct}%`,
                backgroundColor: progressPct === 100 ? '#059669' : '#1e40af',
                borderRadius: '9999px',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        </div>

        {/* Error */}
        {submitError && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {submitError}
          </div>
        )}

        {/* Checklist form */}
        <form onSubmit={handleSubmit}>
          {Object.entries(groupedItems).map(([section, sectionItems]) => (
            <div key={section} style={{ marginBottom: '24px' }}>
              {/* Section header */}
              <div style={{
                backgroundColor: '#1e40af',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: '8px 8px 0 0',
                fontSize: '14px',
                fontWeight: '700',
                letterSpacing: '0.02em'
              }}>
                {section}
              </div>

              <div style={{
                backgroundColor: '#fff',
                borderRadius: '0 0 8px 8px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                borderTop: 'none'
              }}>
                {sectionItems.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((item, idx) => {
                  const itemId = item.item_id || item.checklist_item_id || item.id
                  const resp = responses[itemId] || {}
                  const isFilled = !!resp.result

                  return (
                    <div key={itemId} style={{
                      padding: '18px 20px',
                      borderBottom: idx < sectionItems.length - 1 ? '1px solid #f3f4f6' : 'none',
                      backgroundColor: isFilled ? '#fafffe' : '#fff'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#111827', fontWeight: '500', lineHeight: '1.4' }}>
                            {item.checkpoint_text || item.text}
                          </p>
                        </div>
                        <span style={{
                          ...(criticalityColors[item.criticality] || { backgroundColor: '#f3f4f6', color: '#374151' }),
                          padding: '2px 10px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          flexShrink: 0
                        }}>
                          {item.criticality}
                        </span>
                      </div>

                      {/* Radio buttons */}
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        {['pass', 'fail', 'na'].map(result => (
                          <label key={result} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: `2px solid ${resp.result === result
                              ? (result === 'pass' ? '#059669' : result === 'fail' ? '#dc2626' : '#6b7280')
                              : '#e5e7eb'}`,
                            backgroundColor: resp.result === result
                              ? (result === 'pass' ? '#f0fdf4' : result === 'fail' ? '#fef2f2' : '#f9fafb')
                              : '#fff',
                            transition: 'all 0.15s',
                            fontSize: '13px',
                            fontWeight: '600',
                            color: resp.result === result
                              ? (result === 'pass' ? '#059669' : result === 'fail' ? '#dc2626' : '#374151')
                              : '#6b7280'
                          }}>
                            <input
                              type="radio"
                              name={`result_${itemId}`}
                              value={result}
                              checked={resp.result === result}
                              onChange={() => handleResponseChange(itemId, 'result', result)}
                              style={{ display: 'none' }}
                            />
                            {result === 'pass' ? `✓ ${t('checklist_pass')}` : result === 'fail' ? `✗ ${t('checklist_fail')}` : `— ${t('checklist_na')}`}
                          </label>
                        ))}
                      </div>

                      {/* Remark */}
                      <textarea
                        value={resp.remark || ''}
                        onChange={e => handleResponseChange(itemId, 'remark', e.target.value)}
                        placeholder={`${t('checklist_remarks')} (${t('common_cancel') ? t('map_cancel') : 'optional'})...`}
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '5px',
                          fontSize: '13px',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                          outline: 'none',
                          color: '#374151',
                          fontFamily: 'inherit',
                          backgroundColor: '#fafafa'
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Actual Inspection Date */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            marginBottom: '16px'
          }}>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>
              {t('checklist_actual_date')} <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="date"
              value={actualDate}
              onChange={e => setActualDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              style={{
                padding: '9px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#111827',
                outline: 'none',
                width: '220px'
              }}
            />
          </div>

          {/* Submit */}
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '20px 24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {filledCount}/{items.length} items completed
              {filledCount < items.length && (
                <span style={{ color: '#d97706', marginLeft: '8px' }}>
                  ({items.length - filledCount} remaining)
                </span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Link
                to={`/jobs/${id}`}
                style={{
                  padding: '10px 20px',
                  borderRadius: '7px',
                  fontSize: '14px',
                  fontWeight: '500',
                  textDecoration: 'none',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#fff'
                }}
              >
                {t('common_cancel')}
              </Link>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  backgroundColor: submitting ? '#93c5fd' : '#1e40af',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 28px',
                  borderRadius: '7px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: submitting ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? t('checklist_submitting') : t('checklist_submit')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
