import { useState, useMemo } from 'react'

/**
 * useColumnFilter — per-column multi-select client-side filter (Excel-style)
 *
 * filters[key] = string[]  — rows where col value is IN the array (empty = show all)
 */
export function useColumnFilter(data, columns) {
  const [filters, setFilters] = useState({})

  const setFilter = (key, value) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const clearFilters = () => setFilters({})

  const hasActive = Object.values(filters).some(v => Array.isArray(v) && v.length > 0)

  const filtered = useMemo(() => {
    if (!hasActive) return data
    return data.filter(row =>
      columns.every(col => {
        if (!col.key) return true
        const selected = filters[col.key]
        if (!selected || selected.length === 0) return true
        const cell = String(row[col.key] ?? '')
        return selected.includes(cell)
      })
    )
  }, [data, filters, hasActive])

  return { filters, setFilter, clearFilters, filtered, hasActive }
}
