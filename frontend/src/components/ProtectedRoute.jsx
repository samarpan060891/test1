import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, token, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p style={{ fontSize: '18px', color: '#6b7280' }}>Loading...</p>
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{
          backgroundColor: '#fff',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '48px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <h2 style={{ color: '#dc2626', marginBottom: '8px', fontSize: '24px' }}>Access Denied</h2>
          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            You do not have permission to view this page. Required role(s): {allowedRoles.join(', ')}.
          </p>
          <a
            href="/dashboard"
            style={{
              backgroundColor: '#1e40af',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '14px'
            }}
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    )
  }

  return children
}
