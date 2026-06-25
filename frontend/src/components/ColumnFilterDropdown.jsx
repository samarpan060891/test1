import React, { useState, useRef, useEffect, useMemo } from 'react'

export function ColumnFilterDropdown({ colKey, data, value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef()
  const dropRef = useRef()
  const searchRef = useRef()

  // value is string[] (selected values); normalise to array
  const selected = Array.isArray(value) ? value : (value ? [value] : [])
  const isActive = selected.length > 0

  const uniqueVals = useMemo(() => {
    const s = new Set(data.map(r => String(r[colKey] ?? '')).filter(v => v !== ''))
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [data, colKey])

  const visible = search
    ? uniqueVals.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : uniqueVals

  const allVisibleSelected = visible.length > 0 && visible.every(v => selected.includes(v))
  const someVisibleSelected = visible.some(v => selected.includes(v))

  const calcPos = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const dropH = Math.min(visible.length * 34 + 110, 340)
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow > dropH ? rect.bottom + 4 : rect.top - dropH - 4
    const left = Math.min(rect.left, window.innerWidth - 240)
    setPos({ top, left })
  }

  const handleOpen = () => {
    calcPos()
    setOpen(p => !p)
    setSearch('')
  }

  // Reposition while open if user scrolls / resizes
  useEffect(() => {
    if (!open) return
    const update = () => calcPos()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onMouse = e => {
      if (
        dropRef.current && !dropRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) setOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = val => {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val]
    onChange(next)
  }

  const toggleAll = () => {
    if (allVisibleSelected) {
      onChange(selected.filter(v => !visible.includes(v)))
    } else {
      const next = [...new Set([...selected, ...visible])]
      onChange(next)
    }
  }

  const clearAll = () => { onChange([]); setOpen(false) }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        title={isActive ? `${selected.length} filter(s) active — click to change` : `Filter by ${label}`}
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
        {isActive ? `▼ ${selected.length}` : '▾'}
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
            boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
            width: '240px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search */}
          <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid #f1f5f9' }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
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

          {/* Select All row */}
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 12px', cursor: 'pointer',
              borderBottom: '1px solid #f1f5f9',
              background: '#fafafa',
              fontSize: '12px', fontWeight: '700', color: '#374151',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected }}
              onChange={toggleAll}
              style={{ accentColor: '#E8470F', width: '14px', height: '14px', flexShrink: 0 }}
            />
            {search ? `Select all matching (${visible.length})` : `Select All (${uniqueVals.length})`}
          </label>

          {/* Value list */}
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {visible.length === 0 ? (
              <div style={{ padding: '14px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
                No matching values
              </div>
            ) : (
              visible.map(v => {
                const checked = selected.includes(v)
                return (
                  <label
                    key={v}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '7px 12px', cursor: 'pointer',
                      borderBottom: '1px solid #f8fafc',
                      background: checked ? '#FEF0EB' : 'transparent',
                      fontSize: '12px',
                      color: checked ? '#E8470F' : '#374151',
                      fontWeight: checked ? '600' : '400',
                      userSelect: 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { e.currentTarget.style.background = checked ? '#FEF0EB' : 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(v)}
                      style={{ accentColor: '#E8470F', width: '14px', height: '14px', flexShrink: 0 }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v}>{v}</span>
                  </label>
                )
              })
            )}
          </div>

          {/* Footer */}
          {isActive && (
            <div style={{ padding: '7px 10px', borderTop: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>{selected.length} selected</span>
              <button
                onClick={clearAll}
                style={{
                  fontSize: '11px', color: '#E8470F', background: 'none',
                  border: 'none', cursor: 'pointer', fontWeight: '700', padding: '2px 6px',
                }}
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
