import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'

const roleMeta = {
  qa:            { label: 'QA',       bg: '#4f46e5', color: '#fff' },
  buying:        { label: 'Buying',   bg: '#0284c7', color: '#fff' },
  agency_user:   { label: 'Agency',   bg: '#059669', color: '#fff' },
  supplier_user: { label: 'Supplier', bg: '#7c3aed', color: '#fff' },
  admin:         { label: 'Admin',    bg: '#dc2626', color: '#fff' },
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  const role = user?.role
  const [hoveredLink, setHoveredLink] = useState(null)

  const isActive = (path) => location.pathname === path

  const navLink = (to, label, key) => {
    const active = isActive(to)
    const hovered = hoveredLink === key
    return (
      <Link
        key={key}
        to={to}
        onMouseEnter={() => setHoveredLink(key)}
        onMouseLeave={() => setHoveredLink(null)}
        style={{
          color: active ? '#fff' : hovered ? '#fff' : 'rgba(255,255,255,0.72)',
          textDecoration: 'none',
          padding: '6px 13px',
          borderRadius: '6px',
          fontSize: '13.5px',
          fontWeight: active ? '600' : '450',
          backgroundColor: active
            ? 'rgba(255,255,255,0.18)'
            : hovered ? 'rgba(255,255,255,0.1)' : 'transparent',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Link>
    )
  }

  const rm = roleMeta[role] || { label: role, bg: '#475569', color: '#fff' }

  return (
    <nav style={{
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
      padding: '0 28px',
      height: '62px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 12px rgba(30,58,138,0.35)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{
            width: '32px', height: '32px',
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px',
          }}>🔍</div>
          <span style={{
            color: '#fff',
            fontWeight: '700',
            fontSize: '16px',
            letterSpacing: '-0.2px',
            whiteSpace: 'nowrap',
          }}>
            Quality Inspection Portal
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {navLink('/dashboard', t('nav_dashboard'), 'dash')}
          {navLink('/po-log', t('nav_po_log'), 'po')}
          {(role === 'qa' || role === 'buying') && navLink('/map-inspection', t('nav_map_inspection'), 'map')}
          {(role === 'qa' || role === 'admin') && navLink('/checklist-templates', t('nav_checklist_templates'), 'tmpl')}
          {(role === 'qa' || role === 'buying' || role === 'agency_user' || role === 'admin') &&
            navLink('/inspection-costs', t('nav_inspection_costs'), 'costs')}
          {role === 'supplier_user' && navLink('/inspection-costs', 'Inspection Charges', 'costs-s')}
          {role === 'admin' && navLink('/admin/users', t('nav_users'), 'users')}
          {role === 'admin' && navLink('/admin/masters', t('nav_masters'), 'masters')}
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {user && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </span>
            <span style={{
              backgroundColor: rm.bg,
              color: rm.color,
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}>
              {rm.label}
            </span>
          </>
        )}
        <div style={{ opacity: 0.85 }}><LanguageSwitcher /></div>
        <Link
          to="/change-password"
          style={{
            color: 'rgba(255,255,255,0.72)',
            textDecoration: 'none',
            fontSize: '13px',
            padding: '5px 10px',
            borderRadius: '6px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.72)'; e.currentTarget.style.background = 'transparent' }}
        >
          {t('nav_change_password')}
        </Link>
        <button
          onClick={logout}
          style={{
            background: 'rgba(255,255,255,0.12)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.25)',
            padding: '6px 16px',
            borderRadius: '7px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.22)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
        >
          {t('nav_logout')}
        </button>
      </div>
    </nav>
  )
}
