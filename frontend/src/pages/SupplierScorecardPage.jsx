import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import Navbar from '../components/Navbar.jsx'

const GRADE_META = {
  Excellent:         { color: '#15803d', bg: '#dcfce7', border: '#86efac', icon: '★' },
  Good:              { color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd', icon: '◆' },
  Average:           { color: '#b45309', bg: '#fef3c7', border: '#fcd34d', icon: '▲' },
  'Needs Improvement':{ color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', icon: '✕' },
}

function GradeBadge({ grade }) {
  if (!grade) return null
  const m = GRADE_META[grade] || { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db', icon: '?' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      {m.icon} {grade}
    </span>
  )
}

function ScoreRing({ score }) {
  if (score === null) return (
    <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f3f4f6', border: '3px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <span style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.2 }}>N/A</span>
    </div>
  )
  const color = score >= 85 ? '#15803d' : score >= 70 ? '#1d4ed8' : score >= 50 ? '#b45309' : '#b91c1c'
  const bg    = score >= 85 ? '#dcfce7' : score >= 70 ? '#dbeafe' : score >= 50 ? '#fef3c7' : '#fee2e2'
  return (
    <div style={{ width: 72, height: 72, borderRadius: '50%', background: bg, border: `3px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <span style={{ fontSize: '22px', fontWeight: '800', color, lineHeight: 1 }}>{score}</span>
      <span style={{ fontSize: '10px', color, fontWeight: '600' }}>/100</span>
    </div>
  )
}

function DeductionBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
        <span>{label}</span>
        <span style={{ fontWeight: '600', color: value > 0 ? '#dc2626' : '#16a34a' }}>−{value}</span>
      </div>
      <div style={{ height: '5px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

export default function SupplierScorecardPage() {
  const { t } = useLanguage()
  const { formatFrom } = useCurrency()
  const navigate = useNavigate()

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [filterGrade, setFilterGrade] = useState('all')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    client.get('/scorecard/suppliers')
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false))
  }, [])

  const cfg = data?.config
  const suppliers = (data?.suppliers || []).filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.supplier_code.toLowerCase().includes(search.toLowerCase())
    const matchGrade  = filterGrade === 'all' || s.grade === filterGrade || (filterGrade === 'N/A' && s.score === null)
    return matchSearch && matchGrade
  })

  const summary = {
    total:     data?.suppliers?.length || 0,
    excellent: data?.suppliers?.filter(s => s.grade === 'Excellent').length || 0,
    good:      data?.suppliers?.filter(s => s.grade === 'Good').length || 0,
    average:   data?.suppliers?.filter(s => s.grade === 'Average').length || 0,
    needs:     data?.suppliers?.filter(s => s.grade === 'Needs Improvement').length || 0,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#111827', margin: 0 }}>Supplier Scorecard</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
            Performance rating based on complaints ({cfg?.weight_complaints ?? 50}%), claims ({cfg?.weight_claims ?? 40}%) and inspection failures ({cfg?.weight_failures ?? 10}%)
          </p>
        </div>

        {/* Summary cards */}
        {data && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {[
              { label: 'Total Suppliers', value: summary.total, color: '#374151', bg: '#fff' },
              { label: 'Excellent',        value: summary.excellent, color: '#15803d', bg: '#dcfce7' },
              { label: 'Good',             value: summary.good,      color: '#1d4ed8', bg: '#dbeafe' },
              { label: 'Average',          value: summary.average,   color: '#b45309', bg: '#fef3c7' },
              { label: 'Needs Improvement',value: summary.needs,     color: '#b91c1c', bg: '#fee2e2' },
            ].map(c => (
              <div key={c.label} style={{ flex: '1 1 130px', background: c.bg, border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ fontSize: '26px', fontWeight: '800', color: c.color }}>{c.value}</div>
                <div style={{ fontSize: '12px', color: c.color, fontWeight: '600', marginTop: '2px' }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier…"
            style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
          />
          <select
            value={filterGrade}
            onChange={e => setFilterGrade(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px' }}
          >
            <option value="all">All Grades</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Average">Average</option>
            <option value="Needs Improvement">Needs Improvement</option>
            <option value="N/A">Insufficient Data</option>
          </select>
        </div>

        {/* Content */}
        {loading && <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading scorecard…</div>}
        {error   && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '16px', borderRadius: '8px' }}>{error}</div>}

        {!loading && !error && suppliers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>No suppliers found.</div>
        )}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {suppliers.map(s => {
              const isOpen = expanded === s.supplier_code
              const bk = s.breakdown
              return (
                <div
                  key={s.supplier_code}
                  style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                >
                  {/* Row */}
                  <div
                    onClick={() => setExpanded(isOpen ? null : s.supplier_code)}
                    style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', cursor: 'pointer' }}
                  >
                    <ScoreRing score={s.score} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '16px', color: '#111827' }}>{s.name}</span>
                        <span style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>{s.supplier_code}</span>
                        {s.country && <span style={{ fontSize: '12px', color: '#6b7280' }}>🌍 {s.country}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {s.grade ? <GradeBadge grade={s.grade} /> : (
                          <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
                            Insufficient data (min {cfg?.min_inspections} inspections required)
                          </span>
                        )}
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{bk.total_inspections} inspections · {bk.fail_rate}% fail rate</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{bk.total_complaints} complaint{bk.total_complaints !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{bk.total_claims} claim{bk.total_claims !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: '18px' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded breakdown */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 20px', background: '#fafafa' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>

                        {/* Score breakdown */}
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score Breakdown</div>
                          {s.score !== null ? (
                            <>
                              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Starting score: 100</div>
                              <DeductionBar label={`Customer Complaints (${cfg?.weight_complaints}%)`} value={bk.comp_deduction}  max={Number(cfg?.weight_complaints)} color="#f59e0b" />
                              <DeductionBar label={`Claims (${cfg?.weight_claims}%)`}                  value={bk.claim_deduction} max={Number(cfg?.weight_claims)}      color="#ef4444" />
                              <DeductionBar label={`Inspection Failures (${cfg?.weight_failures}%)`}   value={bk.fail_deduction}  max={Number(cfg?.weight_failures)}     color="#8b5cf6" />
                              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700' }}>
                                <span>Final Score</span>
                                <span style={{ color: s.score >= 85 ? '#15803d' : s.score >= 70 ? '#1d4ed8' : s.score >= 50 ? '#b45309' : '#b91c1c' }}>{s.score} / 100</span>
                              </div>
                              <div style={{ marginTop: '10px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', fontSize: '11px', color: '#6b7280', lineHeight: 1.7 }}>
                                <div style={{ fontWeight: '700', color: '#374151', marginBottom: '4px' }}>* Formula</div>
                                <div style={{ fontWeight: '600', color: '#374151' }}>Score = 100 − Complaint Deduction − Claims Deduction − Failure Deduction</div>
                                <div style={{ marginTop: '5px' }}>
                                  * <b>Complaints ({cfg?.weight_complaints}pts):</b> (Total Complaints ÷ Total Inspections) × {cfg?.weight_complaints} — full deduction when ≥1 complaint per inspection<br/>
                                  * <b>Claims ({cfg?.weight_claims}pts):</b> (Total Claimed ÷ PO Value) ÷ {cfg?.claims_full_deduction_pct}% threshold × {cfg?.weight_claims} — capped at {cfg?.weight_claims}pts<br/>
                                  * <b>Failures ({cfg?.weight_failures}pts):</b> (Failed Inspections ÷ Total Inspections) × {cfg?.weight_failures}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ color: '#9ca3af', fontSize: '13px' }}>Not enough inspection history to calculate score.</div>
                          )}
                        </div>

                        {/* Complaints */}
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Complaints</div>
                          {[
                            { label: 'Total', value: bk.total_complaints },
                            { label: 'Open',  value: bk.open_complaints, warn: true },
                            { label: 'Resolved', value: bk.total_complaints - bk.open_complaints },
                            { label: 'Per Inspection', value: `${bk.comp_rate}%`, warn: bk.comp_rate > 50 },
                          ].map(r => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                              <span style={{ color: '#6b7280' }}>{r.label}</span>
                              <span style={{ fontWeight: '600', color: r.warn && r.value > 0 ? '#dc2626' : '#111827' }}>{r.value}</span>
                            </div>
                          ))}
                        </div>

                        {/* Claims */}
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Claims</div>
                          {[
                            { label: 'Total Claims',    value: bk.total_claims },
                            { label: 'Total Claimed',   value: formatFrom(bk.total_claimed, 'AED') },
                            { label: 'PO Value',        value: formatFrom(bk.po_value, 'AED') },
                          ].map(r => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                              <span style={{ color: '#6b7280' }}>{r.label}</span>
                              <span style={{ fontWeight: '600', color: '#111827' }}>{r.value}</span>
                            </div>
                          ))}
                        </div>

                        {/* Inspections */}
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#374151', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inspections</div>
                          {[
                            { label: 'Total',   value: bk.total_inspections },
                            { label: 'Passed',  value: bk.total_inspections - bk.failed_inspections },
                            { label: 'Failed',  value: bk.failed_inspections, warn: true },
                            { label: 'Fail Rate', value: `${bk.fail_rate}%`, warn: bk.fail_rate > 20 },
                          ].map(r => (
                            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                              <span style={{ color: '#6b7280' }}>{r.label}</span>
                              <span style={{ fontWeight: '600', color: r.warn && r.value > 0 ? '#dc2626' : '#111827' }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
