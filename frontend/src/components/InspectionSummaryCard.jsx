import React from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'

function fmt(num, currency = 'USD') {
  if (num == null || isNaN(num)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(num)
}

export default function InspectionSummaryCard({ advices = [], showLink = false }) {
  const { t } = useLanguage()
  const approved = advices.filter(a => a.status === 'approved')
  const totalCharges = approved.reduce((s, a) => s + parseFloat(a.total_cost || 0), 0)
  const totalPoValue = approved.reduce((s, a) => s + parseFloat(a.po_value || 0), 0)
  const pctToPo = totalPoValue > 0 ? (totalCharges / totalPoValue) * 100 : null
  const pending = advices.filter(a => a.status === 'pending_qa' || a.status === 'pending_buying').length
  const currency = approved[0]?.currency || 'USD'
  const approvedLabel = approved.length === 1 ? t('summary_approved_advices') : t('summary_approved_advices_plural')

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
          {t('summary_total_charges')}
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', color: '#E8470F', lineHeight: 1 }}>
          {fmt(totalCharges, currency)}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          {approved.length} {approvedLabel}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          {t('summary_pct_to_po')}
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', lineHeight: 1 }}>
          {pctToPo != null
            ? <span style={{ color: pctToPo > 5 ? '#f87171' : pctToPo > 3 ? '#fbbf24' : '#4ade80' }}>{pctToPo.toFixed(2)}%</span>
            : <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          {t('summary_of_po_value')} {totalPoValue > 0 ? `(${fmt(totalPoValue, currency)})` : ''}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          {t('summary_pending_approval')}
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', color: pending > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)', lineHeight: 1 }}>
          {pending}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          {t('summary_awaiting_qa')}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          {t('summary_total_advices')}
        </div>
        <div style={{ fontSize: '26px', fontWeight: '800', color: '#fff', lineHeight: 1 }}>
          {advices.length}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
          {t('summary_all_time')}
        </div>
        {showLink && (
          <Link to="/inspection-costs" style={{ fontSize: '12px', color: '#E8470F', fontWeight: '600', textDecoration: 'none', display: 'inline-block', marginTop: '8px' }}>
            {t('summary_view_details')}
          </Link>
        )}
      </div>
    </div>
  )
}
