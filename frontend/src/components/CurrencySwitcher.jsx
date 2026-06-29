import React, { useState, useRef, useEffect } from 'react'
import { useCurrency } from '../context/CurrencyContext.jsx'

export default function CurrencySwitcher() {
  const { currency, setCurrency, currentCurrency, CURRENCIES, rateDate, rateLoading } = useCurrency()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const rateInfo = rateDate
    ? `Rates: ${new Date(rateDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : rateLoading ? 'Fetching live rates…' : 'Using fallback rates'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={rateInfo}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
          color: '#fff', fontSize: '13px', fontWeight: '500',
        }}
      >
        <span style={{ fontSize: '15px' }}>{currentCurrency.flag}</span>
        <span style={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}>{currentCurrency.code}</span>
        <span style={{ fontSize: '10px', opacity: 0.8 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          backgroundColor: '#fff', borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          border: '1px solid #e5e7eb', minWidth: '220px', zIndex: 1001, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Select Currency
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{rateInfo}</div>
          </div>

          {/* AED first (local), then rest */}
          {CURRENCIES.map(c => {
            const isActive = c.code === currency
            const isLocal = c.code === 'AED'
            return (
              <button
                key={c.code}
                onClick={() => { setCurrency(c.code); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '9px 14px', border: 'none',
                  background: isActive ? '#eff6ff' : '#fff',
                  cursor: 'pointer', fontSize: '13px', color: '#374151',
                  fontWeight: isActive ? '700' : '400', textAlign: 'left',
                  borderBottom: '1px solid #f9fafb',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}
              >
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{c.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '12px', color: isActive ? '#1e40af' : '#374151' }}>{c.symbol}</span>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '400' }}>{c.code}</span>
                    {isLocal && <span style={{ fontSize: '9px', background: '#fef9c3', color: '#92400e', padding: '1px 5px', borderRadius: '9999px', fontWeight: '700', textTransform: 'uppercase' }}>Local</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{c.name}</div>
                </div>
                {isActive && <span style={{ color: '#1e40af', fontSize: '14px', flexShrink: 0 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
