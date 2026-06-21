import React, { useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { changePassword } from '../api/auth.js'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function ChangePasswordPage() {
  const { t } = useLanguage()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

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
      setMsg(t('change_pwd_success'))
      setIsError(false)
      setForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      setIsError(true)
      setMsg(err?.response?.data?.error || 'Failed to change password')
    } finally { setSaving(false) }
  }

  return (
    <div className="page">
      <Navbar />
      <div style={{ maxWidth: '480px', margin: '60px auto', padding: '0 24px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '36px', boxShadow: '0 1px 6px rgba(0,0,0,0.1)' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '700', color: '#111827' }}>{t('change_pwd_title')}</h1>
          <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '14px' }}>{t('change_pwd_subtitle')}</p>

          <form onSubmit={handleSubmit}>
            {[
              { key: 'current_password', label: t('change_pwd_current') },
              { key: 'new_password', label: t('change_pwd_new') },
              { key: 'confirm_password', label: t('change_pwd_confirm') },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '5px' }}>{label} *</label>
                <input
                  type="password"
                  value={form[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
            ))}

            {msg && (
              <div style={{
                padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
                backgroundColor: isError ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${isError ? '#fca5a5' : '#86efac'}`,
                color: isError ? '#dc2626' : '#16a34a'
              }}>
                {msg}
              </div>
            )}

            <button type="submit" disabled={saving} style={{
              width: '100%', backgroundColor: saving ? '#93c5fd' : '#1e40af', color: '#fff',
              border: 'none', padding: '11px', borderRadius: '7px', fontSize: '15px', fontWeight: '600',
              cursor: saving ? 'not-allowed' : 'pointer'
            }}>
              {saving ? t('change_pwd_submitting') : t('change_pwd_submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
