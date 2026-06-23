import { useRef, useEffect } from 'react'

/**
 * Wraps a horizontally-scrollable table container and adds a mirrored
 * scrollbar at the top, so users can scroll without reaching the bottom.
 */
export function TableScrollWrap({ children, style }) {
  const topRef = useRef()
  const bottomRef = useRef()
  const syncing = useRef(false)

  useEffect(() => {
    const top = topRef.current
    const bottom = bottomRef.current
    if (!top || !bottom) return

    const mirror = top.firstElementChild

    const updateWidth = () => {
      if (mirror) mirror.style.width = bottom.scrollWidth + 'px'
    }
    updateWidth()

    const ro = new ResizeObserver(updateWidth)
    ro.observe(bottom)

    const onTop = () => {
      if (syncing.current) return
      syncing.current = true
      bottom.scrollLeft = top.scrollLeft
      syncing.current = false
    }
    const onBottom = () => {
      if (syncing.current) return
      syncing.current = true
      top.scrollLeft = bottom.scrollLeft
      syncing.current = false
    }

    top.addEventListener('scroll', onTop)
    bottom.addEventListener('scroll', onBottom)
    return () => {
      top.removeEventListener('scroll', onTop)
      bottom.removeEventListener('scroll', onBottom)
      ro.disconnect()
    }
  }, [])

  return (
    <div style={style}>
      {/* Top mirror scrollbar */}
      <div
        ref={topRef}
        style={{
          overflowX: 'scroll',
          overflowY: 'hidden',
          height: '14px',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <div style={{ height: '1px' }} />
      </div>
      {/* Actual scrollable content */}
      <div ref={bottomRef} style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
