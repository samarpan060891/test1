import { useState, useRef } from 'react'

/**
 * Drag-to-resize column widths.
 * @param {number[]} initialWidths  - default pixel widths for each column
 * @returns {{ widths, getHandleProps, resetWidths }}
 *
 * Usage:
 *   const { widths, getHandleProps } = useResizableColumns([120, 80, ...])
 *
 *   <th style={{ width: widths[i], minWidth: widths[i], position: 'relative' }}>
 *     ...
 *     <div {...getHandleProps(i)} />
 *   </th>
 */
export function useResizableColumns(initialWidths) {
  const [widths, setWidths] = useState(initialWidths)
  const startX = useRef(0)
  const startW = useRef(0)
  const activeIdx = useRef(null)

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

  const resetWidths = () => setWidths(initialWidths)

  return { widths, getHandleProps, resetWidths }
}
