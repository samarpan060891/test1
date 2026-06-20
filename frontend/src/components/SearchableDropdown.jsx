import React, { useState, useEffect, useRef } from 'react'

/**
 * Searchable dropdown backed by an async fetch function.
 *
 * Props:
 *   label        - field label string
 *   required     - boolean
 *   placeholder  - input placeholder
 *   value        - currently selected item (object with .label and .value)
 *   onChange     - called with { value, label, meta } when user picks an option
 *   fetchOptions - async fn(searchText) => [{ value, label, sublabel? }]
 *   disabled     - boolean
 */
export default function SearchableDropdown({
  label,
  required,
  placeholder = 'Type to search...',
  value,
  onChange,
  fetchOptions,
  disabled = false,
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch on query change
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetchOptions(query).then(res => {
      if (!cancelled) { setOptions(res); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query, open])

  const handleInputChange = (e) => {
    setQuery(e.target.value)
    setOpen(true)
    if (value) onChange(null) // clear selection when user starts typing again
  }

  const handleSelect = (opt) => {
    onChange(opt)
    setQuery('')
    setOpen(false)
  }

  const handleFocus = () => {
    setOpen(true)
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: `1px solid ${open ? '#1e40af' : '#d1d5db'}`,
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    backgroundColor: disabled ? '#f9fafb' : '#fff',
    cursor: disabled ? 'not-allowed' : 'text',
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: '20px' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
          {label} {required && <span style={{ color: '#dc2626' }}>*</span>}
        </label>
      )}

      {/* Selected value pill */}
      {value ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          border: '1px solid #a5b4fc',
          borderRadius: '6px',
          backgroundColor: '#eef2ff',
          fontSize: '14px',
        }}>
          <div>
            <span style={{ fontWeight: '600', color: '#1e40af' }}>{value.label}</span>
            {value.sublabel && (
              <span style={{ marginLeft: '8px', color: '#6b7280', fontSize: '13px' }}>{value.sublabel}</span>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => { onChange(null); setQuery('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '16px', padding: '0 0 0 8px' }}
            >
              ×
            </button>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyle}
        />
      )}

      {/* Dropdown list */}
      {open && !value && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          backgroundColor: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          zIndex: 100,
          maxHeight: '240px',
          overflowY: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '12px 16px', color: '#6b7280', fontSize: '13px' }}>Searching...</div>
          )}
          {!loading && options.length === 0 && (
            <div style={{ padding: '12px 16px', color: '#6b7280', fontSize: '13px' }}>
              {query ? 'No results found.' : 'Start typing to search...'}
            </div>
          )}
          {!loading && options.map((opt, i) => (
            <div
              key={i}
              onMouseDown={() => handleSelect(opt)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: i < options.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f5f3ff'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
            >
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#111827' }}>{opt.label}</div>
              {opt.sublabel && (
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{opt.sublabel}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
