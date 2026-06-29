import React, { useState, useRef, useEffect } from 'react'
import { useCurrency, CURRENCIES } from '../context/CurrencyContext.jsx'

/**
 * A number input with an inline currency selector.
 * Defaults to the globally selected currency but can be overridden per-field.
 *
 * Props:
 *   value          – numeric string
 *   onChange       – (value: string) => void
 *   currencyCode   – controlled currency code (optional)
 *   onCurrencyChange – (code: string) => void (optional)
 *   placeholder    – input placeholder
 *   disabled       – bool
 *   style          – extra style for the wrapper
 *   inputStyle     – extra style for the input
 *   min            – input min
 *   step           – input step
 */
export default function CurrencyAmountInput({
  value, onChange,
  currencyCode, onCurrencyChange,
  placeholder = '0.00',
  disabled = false,
  style = {},
  inputStyle = {},
  min = '0',
  step = '0.01',
}) {
  const { currentCurrency } = useCurrency()
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef()

  // Use controlled code if provided, else fall back to global
  const activeCurrency = CURRENCIES.find(c => c.code === (currencyCode || currentCurrency.code)) || currentCurrency

  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (code) => {
    onCurrencyChange?.(code)
    setDropOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch', ...style }}>
      {/* Currency selector pill on left */}
      <div ref={dropRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setDropOpen(o => !o)}
          style={{
            height: '100%',
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '0 10px',
            background: disabled ? '#f8fafc' : (dropOpen ? '#eff6ff' : '#f1f5f9'),
            border: '1.5px solid #e2e8f0',
            borderRight: 'none',
            borderRadius: '7px 0 0 7px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '12px', fontWeight: '700',
            color: disabled ? '#94a3b8' : '#374151',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
        >
          <span style={{ fontSize: '14px' }}>{activeCurrency.flag}</span>
          <span style={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}>{activeCurrency.code}</span>
          {!disabled && <span style={{ fontSize: '9px', opacity: 0.6 }}>▼</span>}
        </button>

        {dropOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: '210px',
            zIndex: 500, overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Select Currency</span>
            </div>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {CURRENCIES.map(c => {
                const active = c.code === activeCurrency.code
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleSelect(c.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      width: '100%', padding: '8px 12px', border: 'none',
                      background: active ? '#eff6ff' : '#fff',
                      cursor: 'pointer', textAlign: 'left',
                      borderBottom: '1px solid #f9fafb',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#fff' }}
                  >
                    <span style={{ fontSize: '15px', flexShrink: 0 }}>{c.flag}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', fontFamily: 'monospace', color: active ? '#1e40af' : '#374151' }}>{c.symbol}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{c.code}</span>
                        {c.local && <span style={{ fontSize: '9px', background: '#fef9c3', color: '#92400e', padding: '1px 4px', borderRadius: '9999px', fontWeight: '700' }}>Local</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.name}</div>
                    </div>
                    {active && <span style={{ color: '#1e40af', fontSize: '13px' }}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Number input */}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '8px 12px',
          border: '1.5px solid #e2e8f0',
          borderRadius: '0 7px 7px 0',
          fontSize: '13px',
          outline: 'none',
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#94a3b8' : '#0f172a',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = '#E8470F'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,71,15,0.1)' }}
        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
      />
    </div>
  )
}
