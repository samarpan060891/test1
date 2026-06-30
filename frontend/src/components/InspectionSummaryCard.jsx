import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCurrency } from '../context/CurrencyContext.jsx'
function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(1) + '%'
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Shift a range back by exactly 1 year
function priorYearRange(start, end) {
  const s = new Date(start); s.setFullYear(s.getFullYear() - 1)
  const e = new Date(end);   e.setFullYear(e.getFullYear() - 1)
  return { start: s, end: e }
}

function inRange(dateStr, from, to) {
  const d = new Date(dateStr)
  return d >= from && d <= to
}

export const DATE_FIELD_OPTIONS = [
  { value: 'mapped_at',        label: 'Mapped Date' },
  { value: 'inspection_date',  label: 'Inspection Date' },
  { value: 'submitted_at',     label: 'Submitted Date' },
  { value: 'created_at',       label: 'Created Date' },
]

function getJobDate(job, field) {
  return job[field] || job.mapped_at || job.created_at
}

function computeMetrics(advices, jobs, from, to, jobDateField = 'mapped_at') {
  const pa = advices.filter(a => inRange(a.created_at, from, to))
  const pj = jobs.filter(j => inRange(getJobDate(j, jobDateField), from, to))

  const approved     = pa.filter(a => ['paid','pending_imports','pending_accounts','approved'].includes(a.status))
  const totalCharges = approved.reduce((s, a) => s + parseFloat(a.total_cost || 0), 0)
  const totalPO      = approved.reduce((s, a) => s + parseFloat(a.po_value || 0), 0)
  const pctToPo      = totalPO > 0 ? (totalCharges / totalPO) * 100 : null
  const pending      = pa.filter(a => ['pending_qa','pending_buying','pending_imports','pending_accounts'].includes(a.status)).length
  const inspected    = pj.filter(j => j.status !== 'mapped_awaiting_inspection').length
  const coverage     = pj.length > 0 ? (inspected / pj.length) * 100 : null
  const currency     = approved[0]?.currency || advices[0]?.currency || 'USD'

  return { totalCharges, totalPO, pctToPo, pending, coverage, approvedCount: approved.length, jobCount: pj.length, currency }
}

function Delta({ cur, prev, isPercent, lowerIsBetter }) {
  if (cur == null || prev == null || prev === 0) return null
  const diff = isPercent ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100
  if (Math.abs(diff) < 0.1) return null
  const up   = diff > 0
  const good = lowerIsBetter ? !up : up
  return (
    <span style={{ fontSize: '10px', fontWeight: '700', marginLeft: '5px', color: good ? '#4ade80' : '#f87171' }}>
      {up ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}{isPercent ? 'pp' : '%'}
    </span>
  )
}

function Tile({ label, curVal, prevVal, curSub, prevSub, delta }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '9.5px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
        {label}
      </div>
      <div>
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginBottom: '2px', fontWeight: '600' }}>CURRENT PERIOD</div>
        <div style={{ fontSize: '20px', fontWeight: '800', color: '#E8470F', lineHeight: 1, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
          {curVal}{delta}
        </div>
        {curSub && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>{curSub}</div>}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: '10px', paddingTop: '8px' }}>
        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginBottom: '2px', fontWeight: '600' }}>PRIOR YEAR (LFL)</div>
        <div style={{ fontSize: '16px', fontWeight: '700', color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>{prevVal}</div>
        {prevSub && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>{prevSub}</div>}
      </div>
    </div>
  )
}

/**
 * Props (period state lifted to parent — DashboardPage):
 *   advices, jobs, showLink
 *   selectedId, onSelectId
 *   customFrom, onCustomFrom
 *   customTo,   onCustomTo
 *   jobDateField, onJobDateField   — which date column jobs are filtered by
 */
export default function InspectionSummaryCard({
  advices = [], jobs = [], showLink = false,
  selectedId: selectedIdProp, onSelectId: onSelectIdProp,
  customFrom: customFromProp, onCustomFrom: onCustomFromProp,
  customTo: customToProp,     onCustomTo: onCustomToProp,
  presets: presetsProp,
  jobDateField: jobDateFieldProp, onJobDateField: onJobDateFieldProp,
}) {
  const { formatFrom } = useCurrency()

  // Allow the card to be self-contained when period props are not passed from parent
  const [internalId,        setInternalId]        = useState('ytd')
  const [internalFrom,      setInternalFrom]      = useState('')
  const [internalTo,        setInternalTo]        = useState('')
  const [internalDateField, setInternalDateField] = useState('mapped_at')

  const controlled     = !!onSelectIdProp
  const PRESETS        = presetsProp || buildPresets()
  const selectedId     = controlled ? selectedIdProp      : internalId
  const onSelectId     = controlled ? onSelectIdProp      : setInternalId
  const customFrom     = controlled ? customFromProp      : internalFrom
  const onCustomFrom   = controlled ? onCustomFromProp    : setInternalFrom
  const customTo       = controlled ? customToProp        : internalTo
  const onCustomTo     = controlled ? onCustomToProp      : setInternalTo
  const jobDateField   = jobDateFieldProp  ?? internalDateField
  const onJobDateField = onJobDateFieldProp ?? setInternalDateField
  const isCustom = selectedId === 'custom'
  const preset   = PRESETS.find(p => p.id === selectedId) || PRESETS[0]

  const curFrom = isCustom ? (customFrom ? new Date(customFrom) : null) : preset.start
  const curTo   = isCustom ? (customTo   ? new Date(customTo + 'T23:59:59') : null) : preset.end

  const ready = curFrom && curTo && curFrom <= curTo
  const prior = ready ? priorYearRange(curFrom, curTo) : null

  const cur  = ready ? computeMetrics(advices, jobs, curFrom, curTo, jobDateField) : null
  const prev = ready && prior ? computeMetrics(advices, jobs, prior.start, prior.end, jobDateField) : null

  const y = new Date().getFullYear()

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)',
      borderRadius: '14px',
      padding: '18px 24px 20px',
      color: '#fff',
      marginBottom: '12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {'Inspection Summary'}
          </div>
          {ready && (
            <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
              <span style={{ color: '#E8470F', fontWeight: '700' }}>{fmtDate(curFrom)} – {fmtDate(curTo)}</span>
              {prior && <span> vs <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: '600' }}>{fmtDate(prior.start)} – {fmtDate(prior.end)}</span> (prior year LFL)</span>}
            </div>
          )}
        </div>
        {showLink && (
          <Link to="/inspection-costs" style={{ fontSize: '11px', color: '#E8470F', fontWeight: '700', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            View details →
          </Link>
        )}
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px', alignItems: 'center' }}>
        {PRESETS.filter(p => p.group === 'current').map(p => (
          <button key={p.id} onClick={() => onSelectId(p.id)} style={{
            padding: '4px 12px', borderRadius: '20px', border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
            background: selectedId === p.id ? '#E8470F' : 'rgba(255,255,255,0.1)',
            color: selectedId === p.id ? '#fff' : 'rgba(255,255,255,0.55)', transition: 'all 0.15s',
          }}>{p.label}</button>
        ))}
        <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 2px', flexShrink: 0 }} />
        {PRESETS.filter(p => p.group === 'prior').map(p => (
          <button key={p.id} onClick={() => onSelectId(p.id)} style={{
            padding: '4px 12px', borderRadius: '20px', border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
            background: selectedId === p.id ? '#7e22ce' : 'rgba(255,255,255,0.08)',
            color: selectedId === p.id ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s',
          }}>{p.label}</button>
        ))}
        <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 2px', flexShrink: 0 }} />
        <button onClick={() => onSelectId('custom')} style={{
          padding: '4px 12px', borderRadius: '20px', border: 'none', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
          background: selectedId === 'custom' ? '#0f766e' : 'rgba(255,255,255,0.08)',
          color: selectedId === 'custom' ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s',
        }}>Custom</button>
      </div>

      {/* Reference date field selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9.5px', fontWeight: '700', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
          Jobs filtered by:
        </span>
        {DATE_FIELD_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => onJobDateField(opt.value)} style={{
            padding: '3px 10px', borderRadius: '20px', border: 'none', fontSize: '10.5px', fontWeight: '700', cursor: 'pointer',
            background: jobDateField === opt.value ? 'rgba(232,71,15,0.25)' : 'rgba(255,255,255,0.06)',
            color: jobDateField === opt.value ? '#E8470F' : 'rgba(255,255,255,0.35)',
            outline: jobDateField === opt.value ? '1px solid rgba(232,71,15,0.5)' : '1px solid transparent',
            transition: 'all 0.15s',
          }}>{opt.label}</button>
        ))}
      </div>

      {/* Custom date picker */}
      {isCustom && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div>
            <label style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>From</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => onCustomFrom(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: '12px', fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>To</label>
            <input
              type="date"
              value={customTo}
              onChange={e => onCustomTo(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: '12px', fontFamily: 'inherit' }}
            />
          </div>
          {!ready && customFrom && customTo && (
            <div style={{ fontSize: '11px', color: '#f87171', alignSelf: 'flex-end', paddingBottom: '4px' }}>From must be before To</div>
          )}
        </div>
      )}

      {/* Metrics */}
      {ready ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '24px' }}>
          <Tile
            label="Total Approved Charges"
            curVal={formatFrom(cur.totalCharges, cur.currency)}
            curSub={`${cur.approvedCount} approved advice${cur.approvedCount !== 1 ? 's' : ''}`}
            prevVal={formatFrom(prev.totalCharges, prev.currency)}
            prevSub={`${prev.approvedCount} approved`}
            delta={<Delta cur={cur.totalCharges} prev={prev.totalCharges} isPercent={false} lowerIsBetter={true} />}
          />
          <Tile
            label="% to PO Value"
            curVal={
              cur.pctToPo != null
                ? <span style={{ color: cur.pctToPo > 5 ? '#f87171' : cur.pctToPo > 3 ? '#fbbf24' : '#4ade80' }}>{fmtPct(cur.pctToPo)}</span>
                : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
            }
            curSub={cur.totalPO > 0 ? `of ${formatFrom(cur.totalPO, cur.currency)} PO value` : undefined}
            prevVal={fmtPct(prev.pctToPo)}
            prevSub={prev.totalPO > 0 ? `of ${formatFrom(prev.totalPO, prev.currency)}` : undefined}
            delta={<Delta cur={cur.pctToPo} prev={prev.pctToPo} isPercent={true} lowerIsBetter={true} />}
          />
          <Tile
            label="Inspection Coverage"
            curVal={
              cur.coverage != null
                ? <span style={{ color: cur.coverage >= 80 ? '#4ade80' : cur.coverage >= 50 ? '#fbbf24' : '#f87171' }}>{fmtPct(cur.coverage)}</span>
                : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
            }
            curSub={`${cur.jobCount} jobs mapped`}
            prevVal={fmtPct(prev.coverage)}
            prevSub={`${prev.jobCount} jobs mapped`}
            delta={<Delta cur={cur.coverage} prev={prev.coverage} isPercent={true} lowerIsBetter={false} />}
          />
          <Tile
            label="Pending Approval"
            curVal={<span style={{ color: cur.pending > 0 ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}>{cur.pending}</span>}
            curSub="awaiting QA / Buying"
            prevVal={<span style={{ color: 'rgba(255,255,255,0.5)' }}>{prev.pending}</span>}
            prevSub="same period prior year"
          />
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '12px 0' }}>
          Select a from and to date to view metrics
        </div>
      )}
    </div>
  )
}

// Export period utilities so DashboardPage can use them
export function buildPresets() {
  const today = new Date()
  const y = today.getFullYear()
  const py = y - 1  // prior year

  const fyStart = new Date(y, 0, 1)
  const fyEnd   = new Date(y, 11, 31, 23, 59, 59)

  // Prior year like-for-like: same elapsed days as current YTD but in prior year
  const pyLFLEnd = new Date(today); pyLFLEnd.setFullYear(py)

  return [
    { id: 'ytd',    label: 'FY to Date',     start: fyStart,                         end: today,                              group: 'current' },
    { id: 'fy',     label: `Full FY ${y}`,   start: fyStart,                         end: fyEnd,                              group: 'current' },
    { id: 'q1',     label: 'Q1',             start: new Date(y, 0, 1),               end: new Date(y, 2, 31, 23, 59, 59),     group: 'current' },
    { id: 'q2',     label: 'Q2',             start: new Date(y, 3, 1),               end: new Date(y, 5, 30, 23, 59, 59),     group: 'current' },
    { id: 'q3',     label: 'Q3',             start: new Date(y, 6, 1),               end: new Date(y, 8, 30, 23, 59, 59),     group: 'current' },
    { id: 'q4',     label: 'Q4',             start: new Date(y, 9, 1),               end: new Date(y, 11, 31, 23, 59, 59),    group: 'current' },
    { id: 'py_lfl', label: `Prior Year LFL`, start: new Date(py, 0, 1),              end: pyLFLEnd,                           group: 'prior' },
    { id: 'py',     label: `Full FY ${py}`,  start: new Date(py, 0, 1),              end: new Date(py, 11, 31, 23, 59, 59),   group: 'prior' },
    { id: 'py_q1',  label: `${py} Q1`,       start: new Date(py, 0, 1),              end: new Date(py, 2, 31, 23, 59, 59),    group: 'prior' },
    { id: 'py_q2',  label: `${py} Q2`,       start: new Date(py, 3, 1),              end: new Date(py, 5, 30, 23, 59, 59),    group: 'prior' },
    { id: 'py_q3',  label: `${py} Q3`,       start: new Date(py, 6, 1),              end: new Date(py, 8, 30, 23, 59, 59),    group: 'prior' },
    { id: 'py_q4',  label: `${py} Q4`,       start: new Date(py, 9, 1),              end: new Date(py, 11, 31, 23, 59, 59),   group: 'prior' },
    { id: 'custom', label: 'Custom',         start: null,                            end: null,                               group: 'custom' },
  ]
}

export function resolveActivePeriod(presets, selectedId, customFrom, customTo) {
  if (selectedId === 'custom') {
    const from = customFrom ? new Date(customFrom) : null
    const to   = customTo   ? new Date(customTo + 'T23:59:59') : null
    return (from && to && from <= to) ? { from, to } : null
  }
  const p = presets.find(x => x.id === selectedId)
  return p ? { from: p.start, to: p.end } : null
}
