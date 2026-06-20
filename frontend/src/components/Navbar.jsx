import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const roleBadgeColors = {
  qa: { backgroundColor: '#7c3aed', color: '#fff' },
  buying: { backgroundColor: '#0891b2', color: '#fff' },
  agency_user: { backgroundColor: '#059669', color: '#fff' },
  admin: { backgroundColor: '#dc2626', color: '#fff' }
}

export default function Navbar() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const navLinkStyle = (path) => ({
    color: location.pathname === path ? '#93c5fd' : '#e2e8f0',
    textDecoration: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: location.pathname === path ? '600' : '400',
    backgroundColor: location.pathname === path ? 'rgba(255,255,255,0.1)' : 'transparent',
    transition: 'background-color 0.15s'
  })

  const role = user?.role

  return (
    <nav style={{
      backgroundColor: '#1e40af',
      padding: '0 24px',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Left: Title + Nav Links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <span style={{
          color: '#fff',
          fontWeight: '700',
          fontSize: '18px',
          letterSpacing: '-0.3px'
        }}>
          QC Inspection
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Link to="/dashboard" style={navLinkStyle('/dashboard')}>Dashboard</Link>
          <Link to="/po-log" style={navLinkStyle('/po-log')}>PO Log</Link>

          {(role === 'qa' || role === 'buying') && (
            <Link to="/map-inspection" style={navLinkStyle('/map-inspection')}>Map Inspection</Link>
          )}

          {role === 'qa' && (
            <Link to="/checklist-templates" style={navLinkStyle('/checklist-templates')}>
              Checklist Templates
            </Link>
          )}

          {(role === 'qa' || role === 'buying' || role === 'agency_user') && (
            <Link to="/inspection-costs" style={navLinkStyle('/inspection-costs')}>Inspection Costs</Link>
          )}

          {role === 'admin' && (
            <>
              <Link to="/admin/users" style={navLinkStyle('/admin/users')}>Users</Link>
              <Link to="/admin/masters" style={navLinkStyle('/admin/masters')}>Masters</Link>
            </>
          )}
        </div>
      </div>

      {/* Right: User info + Logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user && (
          <>
            <span style={{ color: '#e2e8f0', fontSize: '14px' }}>
              {user.email}
            </span>
            <span style={{
              ...(roleBadgeColors[user.role] || { backgroundColor: '#374151', color: '#fff' }),
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              {user.role?.replace('_', ' ')}
            </span>
          </>
        )}
        <Link to="/change-password" style={{ ...navLinkStyle('/change-password'), fontSize: '13px', padding: '5px 10px' }}>
          Change Password
        </Link>
        <button
          onClick={logout}
          style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: '500',
            transition: 'background-color 0.15s'
          }}
          onMouseEnter={e => e.target.style.backgroundColor = 'rgba(255,255,255,0.25)'}
          onMouseLeave={e => e.target.style.backgroundColor = 'rgba(255,255,255,0.15)'}
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
