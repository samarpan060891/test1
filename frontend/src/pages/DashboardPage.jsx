import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getJobs } from '../api/inspectionJobs.js'
import { getAdvices } from '../api/inspectionCosts.js'
import InspectionSummaryCard, { buildPresets, resolveActivePeriod } from '../components/InspectionSummaryCard.jsx'
import client from '../api/client.js'
import { useColumnFilter } from '../hooks/useColumnFilter.js'
import { ColumnFilterDropdown } from '../components/ColumnFilterDropdown.jsx'
import { TableScrollWrap } from '../components/TableScrollWrap.jsx'
import { useResizableColumns } from '../hooks/useResizableColumns.js'

const STATUS_KEYS = {
  mapped_awaiting_inspection: { key: 'status_awaiting_inspection', bg: '#eff6ff', color: '#1d4ed8' },
  submitted_pending_qa:       { key: 'status_pending_qa_review',   bg: '#fefce8', color: '#92400e' },
  qa_approved:                { key: 'status_approved',            bg: '#f0fdf4', color: '#15803d' },
  qa_rejected:                { key: 'status_rejected',            bg: '#fef2f2', color: '#dc2626' },
}

const PAYMENT_KEYS = {
  pending_qa:       { key: 'status_pending_qa',       bg: '#FEF0EB', color: '#E8470F' },
  pending_buying:   { key: 'status_pending_buying',    bg: '#fefce8', color: '#92400e' },
  pending_imports:  { key: 'status_pending_imports',   bg: '#eff6ff', color: '#1d4ed8' },
  pending_accounts: { key: 'status_pending_accounts',  bg: '#faf5ff', color: '#7e22ce' },
  paid:             { key: 'status_paid',              bg: '#f0fdf4', color: '#15803d' },
  rejected:         { key: 'status_advice_rejected',   bg: '#fef2f2', color: '#dc2626' },
}

const STAGE_KEYS = {
  pre_production: { key: 'stage_pre_production', bg: '#fefce8', color: '#92400e' },
  inline:         { key: 'stage_inline',          bg: '#eff6ff', color: '#1d4ed8' },
  final:          { key: 'stage_final',           bg: '#f0fdf4', color: '#15803d' },
  loading:        { key: 'stage_loading',         bg: '#faf5ff', color: '#7e22ce' },
}

function StatusBadge({ status, t }) {
  const m = STATUS_KEYS[status] || { key: null, bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{ background: m.bg, color: m.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11.5px', fontWeight: '700', whiteSpace: 'nowrap' }}>
      {m.key ? t(m.key) : status}
    </span>
  )
}

function PaymentBadge({ status, t }) {
  if (!status) return <span style={{ color: '#94a3b8', fontSize: '12px' }}>{t('common_no_advice')}</span>
  const m = PAYMENT_KEYS[status] || { key: null, bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{ background: m.bg, color: m.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11.5px', fontWeight: '700', whiteSpace: 'nowrap' }}>
      {m.key ? t(m.key) : status}
    </span>
  )
}

function StageBadge({ stage, t }) {
  const m = STAGE_KEYS[stage]
  if (!m) return <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>
  return (
    <span style={{ background: m.bg, color: m.color, padding: '2px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
      {t(m.key)}
    </span>
  )
}

function fmt(num, currency = 'USD') {
  if (num == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(num)
}

const JOB_RESULT_LABEL = {
  qa_approved:                { key: 'result_pass',              color: '#15803d', bg: '#f0fdf4' },
  qa_rejected:                { key: 'result_fail',              color: '#991b1b', bg: '#fef2f2' },
  submitted_pending_qa:       { key: 'status_pending_qa',        color: '#92400e', bg: '#fefce8' },
  mapped_awaiting_inspection: { key: 'status_awaiting_inspection', color: '#1d4ed8', bg: '#eff6ff' },
}

function AgencyBreakdown({ advices, jobs, period, t }) {
  const filteredAdvices = period ? advices.filter(a => { const d = new Date(a.created_at); return d >= period.from && d <= period.to }) : advices
  const filteredJobs    = period ? jobs.filter(j => { const d = new Date(j.mapped_at || j.created_at); return d >= period.from && d <= period.to }) : jobs

  const byAgency = {}
  filteredAdvices.forEach(a => {
    if (!byAgency[a.agency_code]) {
      byAgency[a.agency_code] = { agency_name: a.agency_name, agency_code: a.agency_code, currency: a.currency, advices: [] }
    }
    byAgency[a.agency_code].advices.push(a)
  })
  const agencies = Object.values(byAgency).sort((a, b) => {
    const aJobs = a.advices.flatMap(x => x.jobs || []).length
    const bJobs = b.advices.flatMap(x => x.jobs || []).length
    return bJobs - aJobs
  })
  if (agencies.length === 0) return null

  const PENDING_PAYMENT_LABELS = {
    pending_qa:       { label: 'Pending QA Approval',    color: '#92400e', bg: '#fefce8', dot: '#d97706' },
    pending_buying:   { label: 'Pending Buying Approval', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
    pending_imports:  { label: 'Pending Imports Approval',color: '#7e22ce', bg: '#faf5ff', dot: '#9333ea' },
    pending_accounts: { label: 'Pending Accounts',        color: '#0f766e', bg: '#f0fdfa', dot: '#14b8a6' },
  }

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <div className="card-header">
        <h2 className="section-title">{t('costs_agency_breakdown')}</h2>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{agencies.length} agencies</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', padding: '16px 24px 20px' }}>
        {agencies.map(ag => {
          const allJobs = ag.advices.flatMap(a =>
            (a.jobs || []).map(j => ({ ...j, adviceStatus: a.status, totalCost: a.total_cost, poValue: a.po_value, currency: a.currency }))
          )
          const finished = allJobs.filter(j => j.status === 'qa_approved' || j.status === 'qa_rejected').length
          const finalStatuses = ['paid', 'pending_imports', 'pending_accounts', 'approved']
          const totalCharges = ag.advices.filter(a => finalStatuses.includes(a.status)).reduce((s, a) => s + parseFloat(a.total_cost || 0), 0)
          const totalPoValue = ag.advices.filter(a => finalStatuses.includes(a.status)).reduce((s, a) => s + parseFloat(a.po_value || 0), 0)
          const pct = totalPoValue > 0 ? ((totalCharges / totalPoValue) * 100).toFixed(2) : null
          const pctColor = pct > 5 ? '#dc2626' : pct > 3 ? '#d97706' : '#15803d'

          // Pending advices that need action
          const pendingAdvices = ag.advices.filter(a => PENDING_PAYMENT_LABELS[a.status])

          return (
            <div key={ag.agency_code} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Agency header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FEF0EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: '#E8470F', flexShrink: 0 }}>
                  {ag.agency_name?.charAt(0)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ag.agency_name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{ag.agency_code}</div>
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ textAlign: 'center', background: '#fff', borderRadius: '6px', padding: '8px 4px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{allJobs.length}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>{t('costs_allocated')}</div>
                </div>
                <div style={{ textAlign: 'center', background: '#fff', borderRadius: '6px', padding: '8px 4px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#15803d' }}>{finished}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>{t('costs_finished')}</div>
                </div>
                <div style={{ textAlign: 'center', background: '#FEF0EB', borderRadius: '6px', padding: '6px 4px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#E8470F' }}>{fmt(totalCharges, ag.currency)}</div>
                  <div style={{ fontSize: '10px', color: '#E8470F', fontWeight: '600', textTransform: 'uppercase' }}>{t('costs_total_charges_col')}</div>
                </div>
                <div style={{ textAlign: 'center', background: pct != null ? (pct > 5 ? '#fef2f2' : pct > 3 ? '#fefce8' : '#f0fdf4') : '#f8fafc', borderRadius: '6px', padding: '6px 4px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: pct != null ? pctColor : '#94a3b8' }}>{pct != null ? `${pct}%` : '—'}</div>
                  <div style={{ fontSize: '10px', color: pct != null ? pctColor : '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>{t('col_pct_to_po')}</div>
                </div>
              </div>

              {/* Pending activity highlights */}
              {pendingAdvices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {pendingAdvices.map((a, i) => {
                    const m = PENDING_PAYMENT_LABELS[a.status]
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: m.bg, borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: m.dot, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: '11px', fontWeight: '700', color: m.color, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.label}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: m.color, flexShrink: 0 }}>
                          {fmt(a.total_cost, a.currency)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const COUNTRY_ISO2 = {
  'Afghanistan': 'af', 'Albania': 'al', 'Algeria': 'dz', 'Argentina': 'ar',
  'Australia': 'au', 'Austria': 'at', 'Azerbaijan': 'az', 'Bangladesh': 'bd',
  'Belarus': 'by', 'Belgium': 'be', 'Bolivia': 'bo', 'Brazil': 'br',
  'Bulgaria': 'bg', 'Cambodia': 'kh', 'Canada': 'ca', 'Chile': 'cl',
  'China': 'cn', 'Colombia': 'co', 'Croatia': 'hr', 'Czech Republic': 'cz',
  'Denmark': 'dk', 'Ecuador': 'ec', 'Egypt': 'eg', 'Ethiopia': 'et',
  'Finland': 'fi', 'France': 'fr', 'Germany': 'de', 'Ghana': 'gh',
  'Greece': 'gr', 'Guatemala': 'gt', 'Honduras': 'hn', 'Hong Kong': 'hk',
  'Hungary': 'hu', 'India': 'in', 'Indonesia': 'id', 'Iran': 'ir',
  'Iraq': 'iq', 'Ireland': 'ie', 'Israel': 'il', 'Italy': 'it',
  'Japan': 'jp', 'Jordan': 'jo', 'Kazakhstan': 'kz', 'Kenya': 'ke',
  'South Korea': 'kr', 'Korea': 'kr', 'Kuwait': 'kw', 'Laos': 'la',
  'Latvia': 'lv', 'Lebanon': 'lb', 'Libya': 'ly', 'Lithuania': 'lt',
  'Malaysia': 'my', 'Mexico': 'mx', 'Morocco': 'ma', 'Myanmar': 'mm',
  'Nepal': 'np', 'Netherlands': 'nl', 'New Zealand': 'nz', 'Nigeria': 'ng',
  'Norway': 'no', 'Oman': 'om', 'Pakistan': 'pk', 'Peru': 'pe',
  'Philippines': 'ph', 'Poland': 'pl', 'Portugal': 'pt', 'Qatar': 'qa',
  'Romania': 'ro', 'Russia': 'ru', 'Saudi Arabia': 'sa', 'Serbia': 'rs',
  'Singapore': 'sg', 'Slovakia': 'sk', 'South Africa': 'za', 'Spain': 'es',
  'Sri Lanka': 'lk', 'Sweden': 'se', 'Switzerland': 'ch', 'Taiwan': 'tw',
  'Tanzania': 'tz', 'Thailand': 'th', 'Tunisia': 'tn', 'Turkey': 'tr',
  'Türkiye': 'tr', 'Uganda': 'ug', 'Ukraine': 'ua', 'United Arab Emirates': 'ae',
  'UAE': 'ae', 'United Kingdom': 'gb', 'UK': 'gb', 'United States': 'us',
  'USA': 'us', 'Uruguay': 'uy', 'Uzbekistan': 'uz', 'Venezuela': 've',
  'Vietnam': 'vn', 'Viet Nam': 'vn', 'Yemen': 'ye', 'Zimbabwe': 'zw',
}

function CountryFlag({ name }) {
  const iso = COUNTRY_ISO2[name?.trim()]
  if (!iso) return <span style={{ fontSize: '20px' }}>🌐</span>
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt={name}
      width="28"
      height="20"
      style={{ borderRadius: '3px', objectFit: 'cover', flexShrink: 0 }}
      onError={e => { e.target.style.display = 'none' }}
    />
  )
}

const PENDING_JOB_LABELS = {
  mapped_awaiting_inspection: { label: 'Awaiting Inspection', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  submitted_pending_qa:       { label: 'Pending QA Review',   color: '#92400e', bg: '#fefce8', dot: '#d97706' },
}

function CountryBreakdown({ jobs, advices, period, t }) {
  const filteredJobs    = period ? jobs.filter(j => { const d = new Date(j.mapped_at || j.created_at); return d >= period.from && d <= period.to }) : jobs
  const filteredAdvices = period ? advices.filter(a => { const d = new Date(a.created_at); return d >= period.from && d <= period.to }) : advices

  const byCountry = {}

  // Build job_id → country map (full jobs, not filtered — needed for advice attribution)
  const jobCountryMap = {}
  jobs.forEach(j => { jobCountryMap[j.job_id] = j.supplier_country || '—' })

  // Aggregate job-level metrics per country
  filteredJobs.forEach(j => {
    const country = j.supplier_country || '—'
    if (!byCountry[country]) byCountry[country] = { country, total: 0, approved: 0, rejected: 0, pendingByStatus: {}, totalCharges: 0, totalPO: 0, inspected: 0 }
    const c = byCountry[country]
    c.total++
    if (j.status === 'qa_approved') c.approved++
    else if (j.status === 'qa_rejected') c.rejected++
    else {
      c.pendingByStatus[j.status] = (c.pendingByStatus[j.status] || 0) + 1
    }
    if (j.status !== 'mapped_awaiting_inspection') c.inspected++
    if (j.po_value) c.totalPO += parseFloat(j.po_value)
  })

  // Attribute advice charges to countries (split equally across jobs in advice)
  const approvedStatuses = ['paid', 'pending_imports', 'pending_accounts', 'approved']
  filteredAdvices.filter(a => approvedStatuses.includes(a.status)).forEach(a => {
    const adviceJobs = (a.jobs || []).filter(aj => jobCountryMap[aj.job_id])
    if (adviceJobs.length === 0) return
    const share = parseFloat(a.total_cost || 0) / adviceJobs.length
    adviceJobs.forEach(aj => {
      const country = jobCountryMap[aj.job_id]
      if (byCountry[country]) byCountry[country].totalCharges += share
    })
  })

  const rows = Object.values(byCountry).sort((a, b) => b.total - a.total)
  if (rows.length === 0) return null

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <div className="card-header">
        <h2 className="section-title">{t('dashboard_country_breakdown')}</h2>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{rows.length} {t('col_country').toLowerCase()}s</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', padding: '16px 24px 20px' }}>
        {rows.map(r => {
          const passRate   = r.total > 0 ? ((r.approved / r.total) * 100).toFixed(0) : null
          const coverage   = r.total > 0 ? ((r.inspected / r.total) * 100).toFixed(0) : null
          const pctToPO    = r.totalPO > 0 ? ((r.totalCharges / r.totalPO) * 100).toFixed(2) : null
          const rateColor  = passRate  >= 80 ? '#15803d' : passRate  >= 50 ? '#d97706' : '#dc2626'
          const covColor   = coverage  >= 80 ? '#15803d' : coverage  >= 50 ? '#d97706' : '#dc2626'
          const pctColor   = pctToPO != null ? (pctToPO > 5 ? '#dc2626' : pctToPO > 3 ? '#d97706' : '#15803d') : '#94a3b8'
          return (
            <div key={r.country} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CountryFlag name={r.country} />
                {r.country}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {/* Total Jobs */}
                <div style={{ textAlign: 'center', background: '#fff', borderRadius: '6px', padding: '8px 4px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{r.total}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>{t('country_total_jobs')}</div>
                </div>
                {/* Pass Rate */}
                <div style={{ textAlign: 'center', background: '#fff', borderRadius: '6px', padding: '8px 4px' }}>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: rateColor }}>{passRate != null ? `${passRate}%` : '—'}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>{t('country_pass_rate')}</div>
                </div>
                {/* Inspection Coverage */}
                <div style={{ textAlign: 'center', background: coverage >= 80 ? '#f0fdf4' : coverage >= 50 ? '#fefce8' : '#fef2f2', borderRadius: '6px', padding: '6px 4px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: covColor }}>{coverage != null ? `${coverage}%` : '—'}</div>
                  <div style={{ fontSize: '10px', color: covColor, fontWeight: '600', textTransform: 'uppercase' }}>Coverage</div>
                </div>
                {/* % to PO */}
                <div style={{ textAlign: 'center', background: pctToPO > 5 ? '#fef2f2' : pctToPO > 3 ? '#fefce8' : '#f0fdf4', borderRadius: '6px', padding: '6px 4px' }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: pctColor }}>{pctToPO != null ? `${pctToPO}%` : '—'}</div>
                  <div style={{ fontSize: '10px', color: pctColor, fontWeight: '600', textTransform: 'uppercase' }}>% to PO</div>
                </div>
              </div>
              {Object.keys(r.pendingByStatus).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '8px' }}>
                  {Object.entries(r.pendingByStatus).map(([status, count]) => {
                    const m = PENDING_JOB_LABELS[status] || { label: status, color: '#475569', bg: '#f1f5f9', dot: '#94a3b8' }
                    return (
                      <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '7px', background: m.bg, borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: m.dot, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontSize: '11px', fontWeight: '700', color: m.color, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.label}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: m.color, flexShrink: 0 }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [jobs, setJobs] = useState([])
  const [advices, setAdvices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Period state — shared across summary card + breakdown cards
  const PRESETS = buildPresets()
  const [selectedPreset, setSelectedPreset] = useState('ytd')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')
  const activePeriod = resolveActivePeriod(PRESETS, selectedPreset, customFrom, customTo)

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true)
    return Promise.all([
      getJobs().catch(() => ({ data: [] })),
      getAdvices().catch(() => ({ data: [] })),
    ]).then(([jobsRes, adviceRes]) => {
      setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : jobsRes.data?.jobs || [])
      setAdvices(Array.isArray(adviceRes.data) ? adviceRes.data : [])
    }).catch(() => {
      if (!silent) setError('Failed to load dashboard data.')
    }).finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(true), 30000)
    return () => clearInterval(interval)
  }, [])

  const [activeFilter, setActiveFilter] = useState(null)

  const totalJobs = jobs.length
  const pendingQA = jobs.filter(j => j.status === 'submitted_pending_qa').length
  const approved  = jobs.filter(j => j.status === 'qa_approved').length
  const rejected  = jobs.filter(j => j.status === 'qa_rejected').length

  const cardFilteredJobs = activeFilter === 'pending' ? jobs.filter(j => j.status === 'submitted_pending_qa')
    : activeFilter === 'approved' ? jobs.filter(j => j.status === 'qa_approved')
    : activeFilter === 'rejected' ? jobs.filter(j => j.status === 'qa_rejected')
    : jobs

  const toggleFilter = (key) => setActiveFilter(p => p === key ? null : key)

  const STATUS_LABELS = {
    mapped_awaiting_inspection: 'Awaiting Inspection',
    submitted_pending_qa:       'Pending QA Review',
    qa_approved:                'Approved',
    qa_rejected:                'Rejected',
  }
  const PAYMENT_LABELS = {
    pending_qa:       'Pending QA',
    pending_buying:   'Pending Buying',
    pending_imports:  'Pending Imports',
    pending_accounts: 'Pending Accounts',
    paid:             'Paid',
    rejected:         'Rejected',
  }
  const STAGE_LABELS = {
    pre_production: 'Pre-Production',
    inline:         'Inline',
    final:          'Final',
    loading:        'Loading',
  }

  const JOB_COLS = [
    { key: 'job_ref',        label: t('col_job_ref') },
    { key: 'inspection_stage', label: t('col_stage'),           valueLabel: STAGE_LABELS },
    { key: 'po_no',          label: t('col_po_no') },
    { key: 'item_name',      label: t('col_item') },
    { key: 'supplier_name',  label: t('col_supplier') },
    { key: 'agency_name',    label: t('col_agency') },
    { key: 'status',         label: t('col_activity_status'),   valueLabel: STATUS_LABELS },
    { key: 'payment_status', label: t('col_payment_status'),    valueLabel: PAYMENT_LABELS },
    { key: 'inspection_date',label: t('col_date') },
    { key: null,             label: t('common_actions') },
  ]
  const JOB_WIDTHS = [120, 90, 120, 90, 100, 100, 160, 160, 100, 80]
  const { filters: jobFilters, setFilter: setJobFilter, filtered: filteredJobs, hasActive: hasJobFilter, clearFilters: clearJobFilters } = useColumnFilter(cardFilteredJobs, JOB_COLS)
  const { widths: colWidths, getHandleProps } = useResizableColumns(JOB_WIDTHS)

  const [downloading, setDownloading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const handleDownloadReport = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.append('from', dateFrom)
      if (dateTo) params.append('to', dateTo)
      const res = await client.get(`/reports/download?${params.toString()}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      const suffix = dateFrom || dateTo
        ? `_${dateFrom || 'start'}_to_${dateTo || 'today'}`
        : `_${new Date().toISOString().slice(0, 10)}`
      a.download = `Quality_Inspection_Summary${suffix}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      setShowDatePicker(false)
    } catch {
      alert('Failed to download. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page">
      <Navbar />

      <div className="page-content">
        {/* Inspection Charges Summary — topmost, matching InspectionCostPage */}
        {!loading && advices.length > 0 && (
          <InspectionSummaryCard
            advices={advices} jobs={jobs} showLink
            presets={PRESETS}
            selectedId={selectedPreset}   onSelectId={setSelectedPreset}
            customFrom={customFrom}       onCustomFrom={setCustomFrom}
            customTo={customTo}           onCustomTo={setCustomTo}
          />
        )}

        {/* Page header */}
        <div className="flex-between mb-4" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 className="page-title">{t('dashboard_title')}</h1>
            <p className="page-subtitle">{t('dashboard_welcome')}, <strong>{user?.email}</strong></p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Download button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDatePicker(p => !p)}
                disabled={downloading}
                className="btn btn-success"
              >
                {downloading ? `⏳ ${t('dashboard_downloading')}` : `⬇ ${t('dashboard_download_summary')}`}
              </button>

              {showDatePicker && (
                <div style={{
                  position: 'absolute', top: '44px', right: 0, zIndex: 50,
                  background: '#fff', borderRadius: '12px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
                  padding: '20px', width: '290px',
                  border: '1px solid #e2e8f0',
                }}>
                  <p style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{t('dashboard_date_range')}</p>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('dashboard_date_from')}</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ padding: '8px 12px', fontSize: '13px' }} />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('dashboard_date_to')}</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ padding: '8px 12px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleDownloadReport} disabled={downloading} className="btn btn-success" style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}>
                      {downloading ? `${t('dashboard_downloading')}` : `⬇ ${t('dashboard_download_btn')}`}
                    </button>
                    <button onClick={() => { setShowDatePicker(false); setDateFrom(''); setDateTo('') }} className="btn btn-ghost" style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}>
                      {t('common_cancel')}
                    </button>
                  </div>
                  <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>{t('dashboard_leave_blank')}</p>
                </div>
              )}
            </div>

            {(user?.role === 'qa' || user?.role === 'buying') && (
              <Link to="/map-inspection" className="btn btn-primary">
                {t('dashboard_map_new')}
              </Link>
            )}
          </div>
        </div>

        {/* Stats — click to filter jobs table */}
        <div className="stat-grid mb-4">
          {[
            { key: null,       cls: 'blue',  accent: '#E8470F', label: t('dashboard_total_jobs'),   value: totalJobs },
            { key: 'pending',  cls: 'amber', accent: '#d97706', label: t('dashboard_pending_qa'),   value: pendingQA },
            { key: 'approved', cls: 'green', accent: '#059669', label: t('dashboard_approved'),     value: approved  },
            { key: 'rejected', cls: 'red',   accent: '#dc2626', label: t('dashboard_rejected'),     value: rejected  },
          ].map(({ key, cls, accent, label, value }) => {
            const isActive = activeFilter === key
            return (
              <div
                key={String(key)}
                className={`stat-card ${cls}`}
                onClick={() => toggleFilter(key)}
                style={{
                  cursor: 'pointer',
                  transform: isActive ? 'translateY(-2px)' : undefined,
                  transition: 'transform 0.1s',
                  userSelect: 'none',
                }}
              >
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {label}
                  {isActive && <span style={{ fontSize: '10px', fontWeight: '700', opacity: 0.7 }}>✕ FILTER</span>}
                </div>
                <div className="stat-value">{value}</div>
              </div>
            )
          })}
        </div>

        {/* Country-Wise Breakdown */}
        {!loading && jobs.length > 0 && (
          <CountryBreakdown jobs={jobs} advices={advices} period={activePeriod} t={t} />
        )}

        {/* Agency Inspection Breakdown */}
        {!loading && advices.length > 0 && (
          <AgencyBreakdown advices={advices} jobs={jobs} period={activePeriod} t={t} />
        )}

        {/* Main layout */}
        <div>
          {/* Jobs table */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="section-title">{t('dashboard_inspection_jobs')}</h2>
                {activeFilter && (
                  <span style={{ background: '#FEF0EB', color: '#E8470F', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px' }}>
                    {activeFilter === 'pending' ? t('dashboard_pending_qa') : activeFilter === 'approved' ? t('dashboard_approved') : t('dashboard_rejected')}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {filteredJobs.length}{activeFilter ? ` ${t('common_of')} ${totalJobs}` : ''} {t('common_job_s')}
              </span>
            </div>

            {loading ? (
              <div className="loading-center"><div className="spinner" /></div>
            ) : error ? (
              <div style={{ padding: '32px 24px' }}><div className="alert alert-error">{error}</div></div>
            ) : jobs.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '40px' }}>📋</div>
                <p>{t('dashboard_no_jobs')}</p>
              </div>
            ) : (
              <TableScrollWrap>
                <table className="data-table" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                  <colgroup>
                    {JOB_COLS.map((c, i) => <col key={i} style={{ width: colWidths[i] }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      {JOB_COLS.map((c, i) => (
                        <th key={c.label} style={{ position: 'relative', width: colWidths[i] }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            {c.label}
                            {c.key && (
                              <ColumnFilterDropdown
                                colKey={c.key}
                                data={cardFilteredJobs}
                                value={jobFilters[c.key] || []}
                                onChange={v => setJobFilter(c.key, v)}
                                label={c.label}
                                valueLabel={c.valueLabel}
                              />
                            )}
                            {!c.key && hasJobFilter && (
                              <button onClick={clearJobFilters} style={{ fontSize: '10px', color: '#E8470F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700', padding: '1px 4px', marginLeft: '2px' }}>✕</button>
                            )}
                          </span>
                          {i < JOB_COLS.length - 1 && (
                            <div className="col-resize-handle" {...getHandleProps(i)} />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job, idx) => (
                      <tr key={job.job_id || job.id || idx}>
                        <td className="text-mono" style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {job.job_ref || String(job.job_id || '').slice(0, 8) + '…'}
                        </td>
                        <td><StageBadge stage={job.inspection_stage} t={t} /></td>
                        <td style={{ fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.po_no || '—'}</td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.item_name || job.item_code || '—'}</td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.supplier_name || job.supplier_code || '—'}</td>
                        <td style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.agency_name || '—'}</td>
                        <td><StatusBadge status={job.status} t={t} /></td>
                        <td><PaymentBadge status={job.payment_status} t={t} /></td>
                        <td style={{ color: '#94a3b8' }}>
                          {job.inspection_date ? new Date(job.inspection_date).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <Link
                            to={`/jobs/${job.job_id || job.id}`}
                            className="btn btn-outline btn-sm"
                          >
                            {t('th_view')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScrollWrap>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}
