import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getNotifications, deleteNotification } from '../api/notifications.js'

const POLL_MS = 30000

function buildMessage(n, t) {
  try {
    const parsed = JSON.parse(n.message)
    if (parsed?.key) {
      const tmpl = t(`notif_${parsed.key}`)
      if (tmpl && tmpl !== `notif_${parsed.key}`) {
        return tmpl.replace(/\{(\w+)\}/g, (_, k) => parsed[k] ?? `{${k}}`)
      }
    }
  } catch {}
  if (n.event_type === 'REMARK_POSTED' && n.message) {
    const base = t('notif_REMARK_POSTED')
    const q = n.message.match(/"(.+)"/)
    return q ? `${base}: "${q[1]}"` : base
  }
  const key = n.event_type ? `notif_${n.event_type}` : null
  const translated = key ? t(key) : null
  if (translated && translated !== key) return translated
  return n.message || n.body || n.event_type || ''
}

export default function NotificationBell() {
  const { t } = useLanguage()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [dismissing, setDismissing] = useState(new Set())
  const prevIdsRef = useRef(null)
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  const load = useCallback(async (silent = false) => {
    try {
      const res = await getNotifications()
      const items = Array.isArray(res.data) ? res.data : res.data?.notifications || []
      setNotifications(items)

      // Detect new notifications and fire browser notification
      if (prevIdsRef.current !== null) {
        const prevIds = prevIdsRef.current
        const newItems = items.filter(n => !prevIds.has(String(n.event_id || n.id)))
        if (newItems.length > 0 && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            newItems.forEach(n => {
              new Notification('QC Portal', {
                body: buildMessage(n, t),
                icon: '/favicon.ico',
              })
            })
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') {
                newItems.forEach(n => {
                  new Notification('QC Portal', {
                    body: buildMessage(n, t),
                    icon: '/favicon.ico',
                  })
                })
              }
            })
          }
        }
      }
      prevIdsRef.current = new Set(items.map(n => String(n.event_id || n.id)))
    } catch {}
  }, [t])

  useEffect(() => {
    // Request permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    load()
    const interval = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(interval)
  }, [load])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !btnRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleDismiss = async (n) => {
    const id = n.event_id || n.id
    setDismissing(s => new Set([...s, id]))
    try {
      await deleteNotification(id)
      setNotifications(prev => prev.filter(x => (x.event_id || x.id) !== id))
    } catch {}
    setDismissing(s => { const ns = new Set(s); ns.delete(id); return ns })
  }

  const handleDismissAll = async () => {
    const all = [...notifications]
    setNotifications([])
    for (const n of all) {
      try { await deleteNotification(n.event_id || n.id) } catch {}
    }
  }

  const count = notifications.length

  return (
    <div style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        ref={btnRef}
        onClick={() => setOpen(p => !p)}
        style={{
          position: 'relative',
          background: open ? 'rgba(232,71,15,0.25)' : 'rgba(255,255,255,0.10)',
          border: open ? '1px solid rgba(232,71,15,0.6)' : '1px solid rgba(255,255,255,0.20)',
          color: '#fff',
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '17px',
          transition: 'all 0.15s',
          flexShrink: 0,
        }}
        title="Notifications"
      >
        🔔
        {count > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: '#E8470F',
            color: '#fff',
            fontSize: '10px',
            fontWeight: '800',
            minWidth: '16px',
            height: '16px',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
            boxShadow: '0 0 0 2px #1C1208',
            animation: 'bell-pulse 1.5s infinite',
          }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Slide panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: '56px',
            right: '12px',
            width: '360px',
            maxHeight: 'calc(100vh - 72px)',
            background: '#fff',
            borderRadius: '14px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
            border: '1px solid #e2e8f0',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Panel header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px 12px',
            borderBottom: '1px solid #f1f5f9',
            background: '#fafafa',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🔔</span>
              <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>
                {t('dashboard_notifications')}
              </span>
              {count > 0 && (
                <span style={{ background: '#E8470F', color: '#fff', fontSize: '10px', fontWeight: '800', padding: '1px 7px', borderRadius: '9999px' }}>
                  {count}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {count > 0 && (
                <button
                  onClick={handleDismissAll}
                  style={{ fontSize: '11px', color: '#E8470F', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 6px', borderRadius: '4px' }}
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ fontSize: '16px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '2px 4px' }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {count === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔔</div>
                <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>{t('dashboard_no_notifications')}</p>
              </div>
            ) : (
              notifications.map((n) => {
                const id = n.event_id || n.id
                const msg = buildMessage(n, t)
                const isDismissing = dismissing.has(id)
                return (
                  <div
                    key={id}
                    onClick={() => !isDismissing && handleDismiss(n)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f8fafc',
                      cursor: isDismissing ? 'wait' : 'pointer',
                      opacity: isDismissing ? 0.5 : 1,
                      transition: 'background 0.12s, opacity 0.2s',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                    }}
                    onMouseEnter={e => { if (!isDismissing) e.currentTarget.style.background = '#fef2f2' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '' }}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E8470F', flexShrink: 0, marginTop: '5px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: '0 0 3px', fontSize: '13px', color: '#1e293b', lineHeight: '1.4', fontWeight: '500' }}>{msg}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                        {new Date(n.sent_at || n.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0, marginTop: '2px' }}>✕</span>
                  </div>
                )
              })
            )}
          </div>

          {count > 0 && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Click a notification to dismiss it</span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes bell-pulse {
          0%, 100% { box-shadow: 0 0 0 2px #1C1208; }
          50% { box-shadow: 0 0 0 2px #1C1208, 0 0 0 4px rgba(232,71,15,0.4); }
        }
      `}</style>
    </div>
  )
}
