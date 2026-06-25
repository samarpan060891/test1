import React from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'

function fmt(num, currency = 'USD') {
  if (num == null || isNaN(num)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(num)
}

function pct(n) {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(1) + '%'
}

// April 1 – March 31 financial year
function fyBounds(refDate) {
  const d = new Date(refDate)
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return {
    start: new Date(y, 3, 1),       // 1 Apr
    end:   new Date(y + 1, 2, 31, 23, 59, 59), // 31 Mar
    label: `FY ${y}/${String(y + 1).slice(2)}`,
    year:  y,
  }
}

// For like-for-like: same elapsed days from FY start, but in prev FY
function lflBounds(curFY, today) {
  const elapsed = today - curFY.start          // ms elapsed in current FY
  const prevStart = new Date(curFY.start)
  prevStart.setFullYear(prevStart.getFullYear() - 1)
  const prevEnd = new Date(prevStart.getTime() + elapsed)
  return { start: prevStart, end: prevEnd }
}

function inRange(dateStr, from, to) {
  const d = new Date(dateStr)
  return d >= from && d <= to
}

function computeMetrics(advices, jobs, from, to) {
  const periodAdvices = advices.filter(a => inRange(a.created_at, from, to))
  const periodJobs    = jobs.filter(j => inRange(j.mapped_at || j.created_at, from, to))

  const approved = periodAdvices.filter(a =>
    ['paid', 'pending_imports', 'pending_accounts', 'approved'].includes(a.status)
  )
  const totalCharges  = approved.reduce((s, a) => s + parseFloat(a.total_cost || 0), 0)
  const totalPoValue  = approved.reduce((s, a) => s + parseFloat(a.po_value || 0), 0)
  const pctToPo       = totalPoValue > 0 ? (totalCharges / totalPoValue) * 100 : null
  const pending       = periodAdvices.filter(a =>
    ['pending_qa','pending_buying','pending_imports','pending_accounts'].includes(a.status)
  ).length

  const inspected     = periodJobs.filter(j => j.status !== 'mapped_awaiting_inspection').length
  const coverage      = periodJobs.length > 0 ? (inspected / periodJobs.length) * 100 : null

  return {
    totalCharges,
    totalPoValue,
    pctToPo,
    pending,
    coverage,
    adviceCount: periodAdvices.length,
    approvedCount: approved.length,
    jobCount: periodJobs.length,
    currency: approved[0]?.currency || advices[0]?.currency || 'USD',
  }
}

function Delta({ cur, prev, isPercent, isLower }) {
  if (cur == null || prev == null || prev === 0) return null
  const diff = isPercent ? cur - prev : ((cur - prev) / prev) * 100
  const up   = diff > 0
  // For cost metrics, up is bad (isLower=true); for coverage, up is good
  const good = isLower ? !up : up
  if (Math.abs(diff) < 0.1) return <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginLeft: '4px' }}>—</span>
  return (
    <span style={{
      fontSize: '10px', fontWeight: '700', marginLeft: '5px',
      color: good ? '#4ade80' : '#f87171',
    }}>
      {up ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}{isPercent ? 'pp' : '%'}
    </span>
  )
}

function Metric({ label, curVal, prevVal, curSub, prevSub, delta, isLower }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
      <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>

      {/* Current FY */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Current</div>
        <div style={{ fontSize: '20px', fontWeight: '800', color: '#E8470F', lineHeight: 1, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
          {curVal}
          {delta}
        </div>
        {curSub && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{curSub}</div>}
      </div>

      {/* Prev FY */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '7px' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.35)', marginBottom: '2px' }}>Prior year</div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>
          {prevVal}
        </div>
        {prevSub && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{prevSub}</div>}
      </div>
    </div>
  )
}

export default function InspectionSummaryCard({ advices = [], jobs = [], showLink = false }) {
  const { t } = useLanguage()
  const today  = new Date()
  const curFY  = fyBounds(today)
  const lfl    = lflBounds(curFY, today)
  const prevFY = fyBounds(new Date(curFY.start.getFullYear() - 1, 3, 1))

  const cur  = computeMetrics(advices, jobs, curFY.start, today)
  const prev = computeMetrics(advices, jobs, lfl.start,   lfl.end)

  const fmtDate = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const curPeriodLabel  = `${fmtDate(curFY.start)} – ${fmtDate(today)}`
  const prevPeriodLabel = `${fmtDate(lfl.start)} – ${fmtDate(lfl.end)}`

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)',
      borderRadius: '14px',
      padding: '18px 24px 20px',
      color: '#fff',
      marginBottom: '12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Inspection Financial Summary
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
            <span style={{ color: '#E8470F', fontWeight: '700' }}>{curFY.label}</span>
            {' '}({curPeriodLabel}) vs like-for-like{' '}
            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{prevFY.label}</span>
            {' '}({prevPeriodLabel})
          </div>
        </div>
        {showLink && (
          <Link to="/inspection-costs" style={{ fontSize: '11px', color: '#E8470F', fontWeight: '700', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            View details →
          </Link>
        )}
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '20px' }}>
        {/* Total Approved Charges */}
        <Metric
          label="Total Approved Charges"
          curVal={fmt(cur.totalCharges, cur.currency)}
          curSub={`${cur.approvedCount} approved advice${cur.approvedCount !== 1 ? 's' : ''}`}
          prevVal={fmt(prev.totalCharges, prev.currency)}
          prevSub={`${prev.approvedCount} approved advice${prev.approvedCount !== 1 ? 's' : ''}`}
          delta={<Delta cur={cur.totalCharges} prev={prev.totalCharges} isPercent={false} isLower={true} />}
        />

        {/* % to PO Value */}
        <Metric
          label="% to PO Value"
          curVal={
            cur.pctToPo != null
              ? <span style={{ color: cur.pctToPo > 5 ? '#f87171' : cur.pctToPo > 3 ? '#fbbf24' : '#4ade80' }}>{pct(cur.pctToPo)}</span>
              : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
          }
          curSub={cur.totalPoValue > 0 ? `of ${fmt(cur.totalPoValue, cur.currency)} PO value` : undefined}
          prevVal={prev.pctToPo != null ? pct(prev.pctToPo) : '—'}
          prevSub={prev.totalPoValue > 0 ? `of ${fmt(prev.totalPoValue, prev.currency)} PO value` : undefined}
          delta={<Delta cur={cur.pctToPo} prev={prev.pctToPo} isPercent={true} isLower={true} />}
        />

        {/* Inspection Coverage */}
        <Metric
          label="Inspection Coverage"
          curVal={
            cur.coverage != null
              ? <span style={{ color: cur.coverage >= 80 ? '#4ade80' : cur.coverage >= 50 ? '#fbbf24' : '#f87171' }}>{pct(cur.coverage)}</span>
              : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
          }
          curSub={`${cur.jobCount} jobs mapped`}
          prevVal={prev.coverage != null ? pct(prev.coverage) : '—'}
          prevSub={`${prev.jobCount} jobs mapped`}
          delta={<Delta cur={cur.coverage} prev={prev.coverage} isPercent={true} isLower={false} />}
        />

        {/* Pending Approval */}
        <Metric
          label="Pending Approval"
          curVal={<span style={{ color: cur.pending > 0 ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>{cur.pending}</span>}
          curSub="awaiting QA / Buying"
          prevVal={<span style={{ color: 'rgba(255,255,255,0.55)' }}>{prev.pending}</span>}
          prevSub="same period prior year"
        />
      </div>
    </div>
  )
}
