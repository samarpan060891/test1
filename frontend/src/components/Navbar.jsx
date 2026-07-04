import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import CurrencySwitcher from './CurrencySwitcher.jsx'
import BrandLogo from './BrandLogo.jsx'
import NotificationBell from './NotificationBell.jsx'

const roleMeta = {
  qa:            { label: 'QA',       bg: '#4f46e5', color: '#fff' },
  buying:        { label: 'Buying',   bg: '#0284c7', color: '#fff' },
  imports:       { label: 'Imports',  bg: '#0891b2', color: '#fff' },
  accounts:      { label: 'Accounts', bg: '#059669', color: '#fff' },
  agency_user:   { label: 'Agency',   bg: '#d97706', color: '#fff' },
  supplier_user: { label: 'Supplier', bg: '#7c3aed', color: '#fff' },
  admin:         { label: 'Admin',    bg: '#dc2626', color: '#fff' },
  warehouse:     { label: 'Warehouse', bg: '#0f766e', color: '#fff' },
}

const NAV_ICONS = {
  dash:    '⊞',
  po:      '📋',
  map:     '🗺',
  tmpl:    '✅',
  costs:   '💰',
  docs:    '📁',
  wh:      '🏭',
  claims:  '⚖️',
  score:   '🏆',
  users:   '👥',
  masters: '⚙',
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  const role = user?.role
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isActive = (path) => location.pathname === path

  const navLinks = [
    { to: '/warehouse-inspections', label: 'Warehouse Inspections',   key: 'wh',
      show: role === 'warehouse' },
    { to: '/claims',             label: 'Claims',                     key: 'claims',
      show: role === 'warehouse' },
    { to: '/dashboard',          label: t('nav_dashboard'),           key: 'dash',    show: role !== 'warehouse' },
    { to: '/po-log',             label: t('nav_po_log'),              key: 'po',      show: role !== 'warehouse' },
    { to: '/map-inspection',     label: t('nav_map_inspection'),      key: 'map',
      show: ['qa', 'buying', 'admin'].includes(role) },
    { to: '/checklist-templates',label: t('nav_checklist_templates'), key: 'tmpl',    show: role === 'qa' || role === 'admin' },
    { to: '/inspection-costs',   label: role === 'supplier_user' ? 'Inspection Charges' : t('nav_inspection_costs'), key: 'costs',
      show: ['qa','buying','imports','accounts','agency_user','admin','supplier_user'].includes(role) },
    { to: '/documents',          label: 'Document Control',           key: 'docs',    show: true },
    { to: '/warehouse-inspections', label: 'Warehouse Inspections',   key: 'wh',
      show: ['admin', 'qa', 'buying'].includes(role) },
    { to: '/claims',             label: 'Claims',                     key: 'claims',
      show: ['admin', 'qa', 'buying'].includes(role) },
    { to: '/scorecard',          label: 'Supplier Scorecard',         key: 'score',
      show: ['admin','qa','buying','imports','accounts','supplier_user','warehouse'].includes(role) },
    { to: '/admin/users',        label: t('nav_users'),               key: 'users',   show: role === 'admin' },
    { to: '/admin/masters',      label: t('nav_masters'),             key: 'masters', show: role === 'admin' },
  ].filter(l => l.show)

  const rm = roleMeta[role] || { label: role, bg: '#475569', color: '#fff' }

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <nav style={{
        background: 'linear-gradient(135deg, #1C1208 0%, #2E1D0E 100%)',
        padding: '0 16px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(28,18,8,0.5)',
        position: 'sticky',
        top: 0,
        zIndex: 300,
      }}>
        {/* Left: hamburger + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => setDrawerOpen(o => !o)}
            aria-label="Open navigation menu"
            style={{
              background: drawerOpen ? 'rgba(232,71,15,0.2)' : 'rgba(255,255,255,0.08)',
              border: drawerOpen ? '1px solid rgba(232,71,15,0.5)' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              cursor: 'pointer',
              padding: '7px 9px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              transition: 'all 0.2s',
            }}
          >
            <span style={{ display: 'block', width: '20px', height: '2px', background: drawerOpen ? '#E8470F' : '#fff', borderRadius: '2px', transition: 'transform 0.25s', transform: drawerOpen ? 'rotate(45deg) translate(4px,4px)' : 'none' }} />
            <span style={{ display: 'block', width: '20px', height: '2px', background: '#fff', borderRadius: '2px', opacity: drawerOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
            <span style={{ display: 'block', width: '20px', height: '2px', background: drawerOpen ? '#E8470F' : '#fff', borderRadius: '2px', transition: 'transform 0.25s', transform: drawerOpen ? 'rotate(-45deg) translate(4px,-4px)' : 'none' }} />
          </button>
          <BrandLogo size="md" showTagline />
        </div>

        {/* Right: badge + bell + language only */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {user && (
            <span style={{ backgroundColor: rm.bg, color: rm.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
              {rm.label}
            </span>
          )}
          <NotificationBell />
          <div style={{ opacity: 0.85 }}><CurrencySwitcher /></div>
          <div style={{ opacity: 0.85 }}><LanguageSwitcher /></div>
          <button
            onClick={logout}
            title="Logout"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
          >
            <svg width="26" height="26" viewBox="0 0 26 26">
              <circle cx="13" cy="13" r="13" fill="#cc1111" />
              <circle cx="13" cy="13" r="11" fill="#dd1a1a" />
              {/* power arc */}
              <path d="M8.5 7.8 A7 7 0 1 0 17.5 7.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              {/* vertical stem */}
              <line x1="13" y1="5.5" x2="13" y2="13" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      <div
        onClick={() => setDrawerOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 298,
          background: 'rgba(0,0,0,0.45)',
          opacity: drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'all' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* ── Left drawer ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '260px',
        background: 'linear-gradient(180deg, #1C1208 0%, #2a1a0a 100%)',
        zIndex: 299,
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: drawerOpen ? '4px 0 32px rgba(0,0,0,0.5)' : 'none',
        overflowY: 'auto',
      }}>
        {/* Drawer header */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandLogo size="sm" showTagline={false} />
          <button
            onClick={() => setDrawerOpen(false)}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: '16px', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* User pill */}
        {user && (
          <div style={{ margin: '12px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: rm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: rm.color, flexShrink: 0 }}>
              {(user.name || user.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</div>
              {user.name && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>}
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '1px' }}>{rm.label}</div>
            </div>
          </div>
        )}

        {/* Nav links */}
        <div style={{ flex: 1, padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px 8px' }}>Navigation</div>
          {navLinks.map(l => {
            const active = isActive(l.to)
            return (
              <Link
                key={l.key}
                to={l.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '2px',
                  textDecoration: 'none',
                  color: active ? '#E8470F' : 'rgba(255,255,255,0.78)',
                  background: active ? 'rgba(232,71,15,0.12)' : 'transparent',
                  borderLeft: active ? '3px solid #E8470F' : '3px solid transparent',
                  fontSize: '14px',
                  fontWeight: active ? '700' : '400',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.78)' } }}
              >
                <span style={{ fontSize: '16px', width: '20px', textAlign: 'center', flexShrink: 0 }}>{NAV_ICONS[l.key]}</span>
                <span>{l.label}</span>
                {active && <span style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: '#E8470F', flexShrink: 0 }} />}
              </Link>
            )
          })}
        </div>

        {/* Drawer footer */}
        <div style={{ padding: '12px 14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Link to="/change-password"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', color: 'rgba(255,255,255,0.65)', textDecoration: 'none', fontSize: '13px', marginBottom: '6px' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
          >
            <span style={{ fontSize: '16px' }}>🔑</span> {t('nav_change_password')}
          </Link>
          <button onClick={logout}
            style={{ width: '100%', background: 'rgba(220,38,38,0.15)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.3)', padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.15)' }}
          >
            <span>⏻</span> {t('nav_logout')}
          </button>
        </div>
      </div>
    </>
  )
}
