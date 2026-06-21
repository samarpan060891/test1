import React from 'react'
import { Link } from 'react-router-dom'

function fmt(num, currency = 'USD') {
  if (num == null || isNaN(num)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(num)
}

function Pct({ value }) {
  if (value == null || isNaN(value)) return <span style={{ color: '#94a3b8' }}>—</span>
  const color = value > 5 ? '#dc2626' : value > 3 ? '#d97706' : '#15803d'
  return <span style={{ color, fontWeight: '700' }}>{value.toFixed(2)}%</span>
}

export default function InspectionSummaryCard({ advices = [], showLink = false }) {
  const approved = advices.filter(a => a.status === 'approved')
  const totalCharges = approved.reduce((s, a) => s + parseFloat(a.total_cost || 0), 0)
  const totalPoValue = approved.reduce((s, a) => s + parseFloat(a.po_value || 0), 0)
  const pctToPo = totalPoValue > 0 ? (totalCharges / totalPoValue) * 100 : null
  const pending = advices.filter(a => a.status === 'pending_qa' || a.status === 'pending_buying').length
  const currency = approved[0]?.currency || 'USD'

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)',
      borderRadius: '14px',
      padding: '24px 28px',
      color: '#fff',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: '24px',
      marginBottom: '24px',
    }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          Total Approved Charges
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', color: '#E8470F', lineHeight: 1 }}>
          {fmt(totalCharges, currency)}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          {approved.length} approved advice{approved.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          % to PO Value
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', lineHeight: 1 }}>
          {pctToPo != null ? <span style={{ color: pctToPo > 5 ? '#f87171' : pctToPo > 3 ? '#fbbf24' : '#4ade80' }}>{pctToPo.toFixed(2)}%</span> : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          of total PO value {totalPoValue > 0 ? `(${fmt(totalPoValue, currency)})` : ''}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          Pending Approval
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', color: pending > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)', lineHeight: 1 }}>
          {pending}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          awaiting QA / Buying
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          Total Advices
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', color: '#fff', lineHeight: 1 }}>
          {advices.length}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          all time
        </div>
        {showLink && (
          <Link to="/inspection-costs" style={{ fontSize: '12px', color: '#E8470F', fontWeight: '600', textDecoration: 'none', display: 'inline-block', marginTop: '8px' }}>
            View details →
          </Link>
        )}
      </div>
    </div>
  )
}
