import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { changePassword } from '../api/auth.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { PasswordInput } from '../components/PasswordInput.jsx'

export default function ChangePasswordPage() {
  const { t } = useLanguage()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [countdown, setCountdown] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.new_password !== form.confirm_password) {
      setIsError(true); setMsg(t('change_pwd_mismatch')); return
    }
    if (form.new_password.length < 6) {
      setIsError(true); setMsg(t('change_pwd_minlength')); return
    }
    setSaving(true); setMsg(''); setIsError(false)
    try {
      await changePassword(form.current_password, form.new_password)
      setIsError(false)
      setForm({ current_password: '', new_password: '', confirm_password: '' })

      // Count down 3s then log out and redirect to login
      let secs = 3
      setCountdown(secs)
      setMsg(`Password changed successfully. Redirecting to login in ${secs}s…`)
      const timer = setInterval(() => {
        secs -= 1
        if (secs <= 0) {
          clearInterval(timer)
          logout()
          navigate('/login')
        } else {
          setCountdown(secs)
          setMsg(`Password changed successfully. Redirecting to login in ${secs}s…`)
        }
      }, 1000)
    } catch (err) {
      setIsError(true)
      setMsg(err?.response?.data?.error || 'Failed to change password')
    } finally { setSaving(false) }
  }

  return (
    <div className="page">
      <Navbar />
      <div style={{ maxWidth: '480px', margin: '60px auto', padding: '0 24px' }}>
        <div className="card" style={{ padding: '36px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>{t('change_pwd_title')}</h1>
          <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '14px' }}>{t('change_pwd_subtitle')}</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { key: 'current_password', label: t('change_pwd_current') },
              { key: 'new_password',     label: t('change_pwd_new') },
              { key: 'confirm_password', label: t('change_pwd_confirm') },
            ].map(({ key, label }) => (
              <div key={key} className="field" style={{ marginBottom: 0 }}>
                <label>{label} *</label>
                <PasswordInput
                  value={form[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  required
                  className="input"
                  disabled={countdown !== null}
                />
              </div>
            ))}

            {msg && (
              <div className={`alert ${isError ? 'alert-error' : 'alert-success'}`}>
                {!isError && <span>✅</span>}
                <span>{msg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || countdown !== null}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px' }}
            >
              {saving ? t('change_pwd_submitting') : t('change_pwd_submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
