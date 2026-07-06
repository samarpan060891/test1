import { useState, useRef, useEffect } from 'react'

/**
 * Drag-to-resize column widths, optionally persisted per-table in localStorage.
 * @param {number[]} initialWidths  - default pixel widths for each column
 * @param {string}  [storageKey]    - if given, widths are saved/restored under this key
 * @returns {{ widths, getHandleProps, resetWidths }}
 *
 * Usage:
 *   const { widths, getHandleProps } = useResizableColumns([120, 80, ...], 'wh-inspections')
 *
 *   <th style={{ width: widths[i], minWidth: widths[i], position: 'relative' }}>
 *     ...
 *     <div {...getHandleProps(i)} />
 *   </th>
 */
export function useResizableColumns(initialWidths, storageKey) {
  const readStored = () => {
    if (!storageKey) return initialWidths
    try {
      const raw = localStorage.getItem(`colwidths_${storageKey}`)
      if (!raw) return initialWidths
      const saved = JSON.parse(raw)
      // Only trust it if the column count still matches (schema changes reset it)
      if (Array.isArray(saved) && saved.length === initialWidths.length &&
          saved.every(n => typeof n === 'number' && n > 0)) {
        return saved
      }
    } catch { /* ignore corrupt storage */ }
    return initialWidths
  }

  const [widths, setWidths] = useState(readStored)
  const startX = useRef(0)
  const startW = useRef(0)
  const activeIdx = useRef(null)

  // Persist whenever widths change (and a key is provided)
  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(`colwidths_${storageKey}`, JSON.stringify(widths)) } catch { /* quota / private mode */ }
  }, [widths, storageKey])

  const getHandleProps = (idx) => ({
    onMouseDown: (e) => {
      e.preventDefault()
      startX.current = e.clientX
      startW.current = widths[idx]
      activeIdx.current = idx

      const onMove = (e) => {
        const delta = e.clientX - startX.current
        setWidths(prev => {
          const next = [...prev]
          next[activeIdx.current] = Math.max(40, startW.current + delta)
          return next
        })
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        activeIdx.current = null
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    style: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '5px',
      cursor: 'col-resize',
      userSelect: 'none',
      zIndex: 1,
    },
    title: 'Drag to resize column',
  })

  const resetWidths = () => {
    setWidths(initialWidths)
    if (storageKey) { try { localStorage.removeItem(`colwidths_${storageKey}`) } catch { /* ignore */ } }
  }

  return { widths, getHandleProps, resetWidths }
}
