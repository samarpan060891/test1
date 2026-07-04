import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 8px rgba(0,0,0,0.1)', padding: '40px', maxWidth: '440px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>😵</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#64748b' }}>
            An unexpected error occurred while rendering this page. Reloading usually fixes it.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => window.location.reload()}
              style={{ padding: '10px 22px', borderRadius: '8px', background: '#E8470F', color: '#fff', border: 'none', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>
              Reload Page
            </button>
            <button onClick={() => { window.location.href = '/' }}
              style={{ padding: '10px 22px', borderRadius: '8px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
              Go to Login
            </button>
          </div>
        </div>
      </div>
    )
  }
}
