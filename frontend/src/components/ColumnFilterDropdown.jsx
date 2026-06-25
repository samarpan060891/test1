import React, { useState, useRef, useEffect, useMemo } from 'react'

export function ColumnFilterDropdown({ colKey, data, value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef()
  const dropRef = useRef()
  const searchRef = useRef()
  const isActive = !!value

  // Unique values for suggestion list — always from full dataset
  const uniqueVals = useMemo(() => {
    const s = new Set(data.map(r => String(r[colKey] ?? '')).filter(v => v !== ''))
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [data, colKey])

  // Suggestions filtered by whatever the user has typed
  const suggestions = value
    ? uniqueVals.filter(v => v.toLowerCase().includes(value.toLowerCase()))
    : uniqueVals

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const dropH = Math.min(suggestions.length * 32 + 90, 320)
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow > dropH ? rect.bottom + 4 : rect.top - dropH - 4
      const left = Math.min(rect.left, window.innerWidth - 220)
      setPos({ top, left })
    }
    setOpen(p => !p)
  }

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onMouse = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onMouse); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        title={isActive ? `Filtering: "${value}" — click to change` : `Filter by ${label}`}
        style={{
          background: isActive ? '#FEF0EB' : 'transparent',
          border: isActive ? '1px solid #fca5a5' : '1px solid transparent',
          borderRadius: '4px',
          cursor: 'pointer',
          color: isActive ? '#E8470F' : '#b0bec5',
          padding: '1px 5px',
          fontSize: '9px',
          lineHeight: '1.4',
          fontWeight: isActive ? '700' : '400',
          transition: 'all 0.1s',
          marginLeft: '4px',
          flexShrink: 0,
        }}
      >
        {isActive ? '●' : '▾'}
      </button>

      {open && (
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
            minWidth: '200px',
            maxWidth: '260px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search input — typing here filters the TABLE live */}
          <div style={{ padding: '8px 8px 6px' }}>
            <input
              ref={searchRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={`Search ${label}…`}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1.5px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px',
                boxSizing: 'border-box',
                outline: 'none',
                fontFamily: 'inherit',
                color: '#334155',
              }}
            />
          </div>

          {/* Divider + hint */}
          <div style={{
            padding: '4px 10px 4px',
            fontSize: '10px',
            color: '#b0bec5',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            borderTop: '1px solid #f1f5f9',
            borderBottom: '1px solid #f1f5f9',
            background: '#fafafa',
          }}>
            {value ? `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}` : `${uniqueVals.length} unique value${uniqueVals.length !== 1 ? 's' : ''}`}
          </div>

          {/* Suggestion list */}
          <div style={{ maxHeight: '210px', overflowY: 'auto' }}>
            {isActive && (
              <button
                onClick={() => { onChange(''); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 12px',
                  fontSize: '12px', color: '#E8470F', background: '#FEF0EB',
                  border: 'none', borderBottom: '1px solid #fde8e0',
                  cursor: 'pointer', fontWeight: '600',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                ✕ Clear filter
              </button>
            )}

            {suggestions.length === 0 ? (
              <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                No matching values
              </div>
            ) : (
              suggestions.map(v => (
                <button
                  key={v}
                  onClick={() => { onChange(v); setOpen(false) }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 12px',
                    fontSize: '12px',
                    background: v === value ? '#FEF0EB' : 'transparent',
                    color: v === value ? '#E8470F' : '#374151',
                    border: 'none',
                    borderBottom: '1px solid #f8fafc',
                    cursor: 'pointer',
                    fontWeight: v === value ? '600' : '400',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={v}
                >
                  {v}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </span>
  )
}
