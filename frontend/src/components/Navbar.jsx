import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
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
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  const role = user?.role
  const [hoveredLink, setHoveredLink] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (path) => location.pathname === path

  const navLinks = [
    { to: '/dashboard', label: t('nav_dashboard'), key: 'dash', show: true },
    { to: '/po-log', label: t('nav_po_log'), key: 'po', show: true },
    { to: '/map-inspection', label: t('nav_map_inspection'), key: 'map', show: role === 'qa' || role === 'buying' },
    { to: '/checklist-templates', label: t('nav_checklist_templates'), key: 'tmpl', show: role === 'qa' || role === 'admin' },
    { to: '/inspection-costs', label: role === 'supplier_user' ? 'Inspection Charges' : t('nav_inspection_costs'), key: 'costs',
      show: ['qa','buying','imports','accounts','agency_user','admin','supplier_user'].includes(role) },
    { to: '/documents', label: 'Document Control', key: 'docs', show: true },
    { to: '/admin/users', label: t('nav_users'), key: 'users', show: role === 'admin' },
    { to: '/admin/masters', label: t('nav_masters'), key: 'masters', show: role === 'admin' },
  ].filter(l => l.show)

  const rm = roleMeta[role] || { label: role, bg: '#475569', color: '#fff' }

  const linkStyle = (key) => {
    const active = isActive(navLinks.find(l => l.key === key)?.to || '')
    const hovered = hoveredLink === key
    return {
      color: active ? '#E8470F' : hovered ? '#fff' : 'rgba(255,255,255,0.72)',
      textDecoration: 'none',
      padding: '6px 13px',
      borderRadius: '6px',
      fontSize: '13.5px',
      fontWeight: active ? '700' : '450',
      backgroundColor: active ? 'rgba(232,71,15,0.15)' : hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
      borderBottom: active ? '2px solid #E8470F' : '2px solid transparent',
      transition: 'all 0.15s',
      whiteSpace: 'nowrap',
    }
  }

  return (
    <>
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
        zIndex: 200,
      }}>
        {/* Left: brand + desktop nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: 0, overflow: 'hidden' }}>
          <BrandLogo size="md" showTagline />
          <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {navLinks.map(l => (
              <Link key={l.key} to={l.to}
                onMouseEnter={() => setHoveredLink(l.key)}
                onMouseLeave={() => setHoveredLink(null)}
                style={linkStyle(l.key)}
              >{l.label}</Link>
            ))}
          </div>
        </div>

        {/* Right: desktop actions + hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Desktop-only: email + role badge + lang + password + logout */}
          {user && (
            <span className="nav-email" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </span>
          )}
          {user && (
            <span style={{ backgroundColor: rm.bg, color: rm.color, padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
              {rm.label}
            </span>
          )}
          <NotificationBell />
          <div className="nav-lang" style={{ opacity: 0.85 }}><LanguageSwitcher /></div>
          <Link to="/change-password" className="nav-password-link"
            style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: '13px', padding: '5px 10px', borderRadius: '6px', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.72)'; e.currentTarget.style.background = 'transparent' }}
          >{t('nav_change_password')}</Link>
          <button onClick={logout} className="nav-logout-btn"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', padding: '6px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          >{t('nav_logout')}</button>

          {/* Hamburger — mobile/tablet only */}
          <button className="hamburger" onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#fff', flexDirection: 'column', gap: '5px' }}
          >
            <span style={{ display: 'block', width: '22px', height: '2px', background: '#fff', borderRadius: '2px', transition: 'transform 0.2s', transform: menuOpen ? 'rotate(45deg) translate(5px,5px)' : 'none' }} />
            <span style={{ display: 'block', width: '22px', height: '2px', background: '#fff', borderRadius: '2px', opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
            <span style={{ display: 'block', width: '22px', height: '2px', background: '#fff', borderRadius: '2px', transition: 'transform 0.2s', transform: menuOpen ? 'rotate(-45deg) translate(5px,-5px)' : 'none' }} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="mobile-menu" style={{
          position: 'fixed', top: '52px', left: 0, right: 0, bottom: 0,
          background: '#1C1208', zIndex: 199, overflowY: 'auto',
          padding: '12px 0 24px',
        }} onClick={() => setMenuOpen(false)}>
          {navLinks.map(l => (
            <Link key={l.key} to={l.to}
              style={{
                display: 'block', padding: '14px 24px',
                color: isActive(l.to) ? '#E8470F' : 'rgba(255,255,255,0.85)',
                textDecoration: 'none', fontSize: '15px', fontWeight: isActive(l.to) ? '700' : '400',
                borderLeft: isActive(l.to) ? '3px solid #E8470F' : '3px solid transparent',
                background: isActive(l.to) ? 'rgba(232,71,15,0.1)' : 'transparent',
              }}
            >{l.label}</Link>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '12px 0' }} />
          {user && (
            <div style={{ padding: '10px 24px', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
              {user.email}
            </div>
          )}
          <Link to="/change-password"
            style={{ display: 'block', padding: '14px 24px', color: 'rgba(255,255,255,0.85)', textDecoration: 'none', fontSize: '15px' }}
          >{t('nav_change_password')}</Link>
          <button onClick={logout}
            style={{ display: 'block', width: 'calc(100% - 48px)', margin: '12px 24px 0', background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', textAlign: 'center' }}
          >{t('nav_logout')}</button>
        </div>
      )}
    </>
  )
}
