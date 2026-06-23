import { useState, useMemo } from 'react'

/**
 * useColumnFilter — lightweight per-column client-side filter
 *
 * columns: array of { key, label, type? }
 *   key   — the field name on each data row (or null for action-only columns)
 *   type  — 'text' (default) | 'select' (renders a dropdown of unique values)
 *
 * returns { filters, setFilter, filtered, FilterRow }
 */
export function useColumnFilter(data, columns) {
  const [filters, setFilters] = useState({})

  const setFilter = (key, value) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const clearFilters = () => setFilters({})

  const hasActive = Object.values(filters).some(v => v && v !== '')

  const filtered = useMemo(() => {
    if (!hasActive) return data
    return data.filter(row =>
      columns.every(col => {
        if (!col.key) return true
        const fv = filters[col.key]
        if (!fv) return true
        const cell = String(row[col.key] ?? '').toLowerCase()
        return cell.includes(fv.toLowerCase())
      })
    )
  }, [data, filters])

  return { filters, setFilter, clearFilters, filtered, hasActive }
}
