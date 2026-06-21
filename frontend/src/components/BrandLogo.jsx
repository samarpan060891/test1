import React from 'react'

export default function BrandLogo({ size = 'md', showTagline = false }) {
  const sizes = {
    sm: { font: '15px', r: '15px', gap: '8px', icon: '28px' },
    md: { font: '18px', r: '18px', gap: '10px', icon: '34px' },
    lg: { font: '26px', r: '26px', gap: '14px', icon: '48px' },
  }
  const s = sizes[size] || sizes.md

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }}>
      {/* Icon mark — square with stylised 'h' initial */}
      <div style={{
        width: s.icon, height: s.icon,
        background: 'rgba(255,255,255,0.15)',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        border: '1px solid rgba(255,255,255,0.25)',
      }}>
        <span style={{ fontSize: `calc(${s.icon} * 0.52)`, lineHeight: 1 }}>🏠</span>
      </div>

      {/* Wordmark */}
      <div>
        <div style={{
          fontWeight: '800',
          fontSize: s.font,
          letterSpacing: '-0.3px',
          lineHeight: 1,
          color: '#fff',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          homes<span style={{ color: '#E8470F' }}>r</span>us
        </div>
        {showTagline && (
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '2px' }}>
            Quality Inspection Portal
          </div>
        )}
      </div>
    </div>
  )
}
