import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { LANGUAGES } from '../i18n/translations.js'
import BrandLogo from '../components/BrandLogo.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const { lang, setLanguage, t } = useLanguage()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [focusedField, setFocusedField] = useState(null)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Invalid email or password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field) => ({
    width: '100%',
    padding: '11px 14px',
    border: `1.5px solid ${focusedField === field ? '#E8470F' : '#e2e8f0'}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: '#0f172a',
    background: focusedField === field ? '#fafcff' : '#f8fafc',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.15s',
    boxShadow: focusedField === field ? '0 0 0 3px rgba(232,71,15,0.12)' : 'none',
    fontFamily: 'inherit',
  })

  const features = [
    { icon: '📋', text: t('login_feature_1') || 'End-to-end inspection job management' },
    { icon: '✅', text: t('login_feature_2') || 'Multi-stage QA checklist workflows' },
    { icon: '💰', text: t('login_feature_3') || 'Inspection cost tracking & approvals' },
    { icon: '🔔', text: t('login_feature_4') || 'Real-time stakeholder notifications' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#f1f5f9',
    }}>
      {/* Left branding panel */}
      <div style={{
        width: '42%',
        background: 'linear-gradient(160deg, #1C1208 0%, #2E1D0E 55%, #4A2E18 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 56px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* decorative circles */}
        <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '320px', height: '320px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: '-60px', left: '-40px', width: '240px', height: '240px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />

        <div style={{ position: 'relative' }}>
          {/* Logo */}
          <div style={{ marginBottom: '36px' }}>
            <BrandLogo size="lg" />
          </div>

          <h1 style={{ color: '#fff', fontSize: '26px', fontWeight: '800', lineHeight: '1.2', marginBottom: '12px', letterSpacing: '-0.4px' }}>
            Quality Inspection<br />Portal
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '15px', lineHeight: '1.6', marginBottom: '48px' }}>
            Streamline your quality control process across suppliers, agencies, and internal teams.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '36px', height: '36px',
                  background: 'rgba(255,255,255,0.12)',
                  borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: '450' }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          {/* Heading */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.4px', marginBottom: '6px' }}>
              {t('login_welcome') || 'Welcome back'}
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              {t('login_subtitle_short') || 'Sign in to your account to continue'}
            </p>
          </div>

          {/* Language selector */}
          <div style={{ marginBottom: '28px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
              {t('login_select_language') || 'Select Language'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
              {LANGUAGES.map(l => {
                const active = l.code === lang
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLanguage(l.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '5px 11px',
                      borderRadius: '20px',
                      border: active ? '2px solid #E8470F' : '1.5px solid #e2e8f0',
                      background: active ? '#FEF0EB' : '#f8fafc',
                      color: active ? '#E8470F' : '#475569',
                      fontWeight: active ? '700' : '400',
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      transition: 'all 0.13s',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: '15px', lineHeight: 1 }}>{l.flag}</span>
                    <span>{l.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#dc2626',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#334155' }}>
                {t('login_email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                style={inputStyle('email')}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#334155' }}>
                {t('login_password')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ ...inputStyle('password'), paddingRight: '40px' }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px' }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '6px',
                width: '100%',
                background: loading
                  ? '#f0a080'
                  : 'linear-gradient(135deg, #E8470F 0%, #C93A08 100%)',
                color: '#fff',
                border: 'none',
                padding: '13px',
                borderRadius: '9px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(232,71,15,0.4)',
                transition: 'all 0.15s',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 6px 20px rgba(232,71,15,0.5)' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = '0 4px 14px rgba(232,71,15,0.4)' }}
            >
              {loading ? t('login_loading') : t('login_button')}
            </button>
          </form>

          <p style={{ marginTop: '40px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
            Quality Inspection Portal © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
