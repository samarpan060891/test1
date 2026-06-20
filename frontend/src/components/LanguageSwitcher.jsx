import React, { useState, useRef, useEffect } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { LANGUAGES } from '../i18n/translations.js'

export default function LanguageSwitcher() {
  const { lang, setLanguage } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: '6px', padding: '6px 10px', cursor: 'pointer',
          color: '#fff', fontSize: '13px', fontWeight: '500'
        }}
      >
        <span style={{ fontSize: '16px' }}>{current.flag}</span>
        <span>{current.name}</span>
        <span style={{ fontSize: '10px', opacity: 0.8 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          backgroundColor: '#fff', borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          border: '1px solid #e5e7eb', minWidth: '160px', zIndex: 1000, overflow: 'hidden'
        }}>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLanguage(l.code); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '10px 14px', border: 'none',
                background: l.code === lang ? '#eff6ff' : '#fff',
                cursor: 'pointer', fontSize: '13px', color: '#374151',
                fontWeight: l.code === lang ? '600' : '400', textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '16px' }}>{l.flag}</span>
              <span>{l.name}</span>
              {l.code === lang && <span style={{ marginLeft: 'auto', color: '#1e40af' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
