import React, { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getUsers, createUser, updateUser, deleteUser, resetPassword } from '../api/admin.js'

const ROLES = ['qa', 'buying', 'agency_user', 'supplier_user', 'admin']

const emptyForm = { name: '', email: '', password: '', role: 'agency_user', agency_code: '', supplier_code: '' }

export default function AdminUsersPage() {
  const { t } = useLanguage()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resetModal, setResetModal] = useState(null)
  const [newPwd, setNewPwd] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  const load = () => {
    setLoading(true)
    getUsers().then(r => setUsers(r.data)).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditUser(null); setForm(emptyForm); setError(''); setShowForm(true) }
  const openEdit = (u) => {
    setEditUser(u)
    setForm({ name: u.name, email: u.email, password: '', role: u.role, agency_code: u.agency_code || '', supplier_code: u.supplier_code || '' })
    setError('')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      if (editUser) {
        await updateUser(editUser.user_id, { name: form.name, email: form.email, role: form.role, agency_code: form.agency_code || null, supplier_code: form.supplier_code || null })
      } else {
        await createUser({ name: form.name, email: form.email, password: form.password, role: form.role, agency_code: form.agency_code || null, supplier_code: form.supplier_code || null })
      }
      setShowForm(false); load()
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save user')
    } finally { setSaving(false) }
  }

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user ${u.name}?`)) return
    try { await deleteUser(u.user_id); load() } catch (err) { alert(err?.response?.data?.error || 'Delete failed') }
  }

  const handleReset = async () => {
    if (!newPwd || newPwd.length < 6) { setResetMsg('Min 6 characters'); return }
    try {
      await resetPassword(resetModal.user_id, newPwd)
      setResetMsg('Password reset successfully!')
      setTimeout(() => { setResetModal(null); setNewPwd(''); setResetMsg('') }, 1500)
    } catch (err) { setResetMsg(err?.response?.data?.error || 'Failed') }
  }

  const roleColor = { qa: '#7c3aed', buying: '#0369a1', agency_user: '#0f766e', supplier_user: '#b45309', admin: '#dc2626' }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#111827' }}>{t('admin_users_title')}</h1>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>{users.length} users</p>
          </div>
          <button onClick={openCreate} style={{ backgroundColor: '#1e40af', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            {t('admin_add_user')}
          </button>
        </div>

        {loading ? <p style={{ color: '#6b7280' }}>{t('common_loading')}</p> : (
          <div style={{ backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  {['Name', 'Email', 'Role', 'Agency/Supplier', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.user_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: '#111827' }}>{u.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ backgroundColor: roleColor[u.role] + '20', color: roleColor[u.role], padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>{u.role}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{u.agency_code || u.supplier_code || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => openEdit(u)} style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid #d1d5db', borderRadius: '5px', cursor: 'pointer', backgroundColor: '#fff' }}>{t('admin_edit')}</button>
                        <button onClick={() => { setResetModal(u); setNewPwd(''); setResetMsg('') }} style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid #fbbf24', borderRadius: '5px', cursor: 'pointer', backgroundColor: '#fffbeb', color: '#d97706' }}>{t('admin_reset_pwd')}</button>
                        <button onClick={() => handleDelete(u)} style={{ padding: '5px 12px', fontSize: '12px', border: '1px solid #fca5a5', borderRadius: '5px', cursor: 'pointer', backgroundColor: '#fef2f2', color: '#dc2626' }}>{t('admin_delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '32px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '700' }}>{editUser ? t('admin_edit') : t('admin_add_user')}</h2>
            {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
            <form onSubmit={handleSave}>
              {[['Name', 'name', 'text'], ['Email', 'email', 'email']].map(([label, key, type]) => (
                <div key={key} style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>{label} *</label>
                  <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} required style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              ))}
              {!editUser && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Password *</label>
                  <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              )}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Role *</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value, agency_code: '', supplier_code: '' }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {form.role === 'agency_user' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Agency Code *</label>
                  <input value={form.agency_code} onChange={e => setForm(p => ({ ...p, agency_code: e.target.value }))} placeholder="e.g. AGC-001" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              )}
              {form.role === 'supplier_user' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Supplier Code *</label>
                  <input value={form.supplier_code} onChange={e => setForm(p => ({ ...p, supplier_code: e.target.value }))} placeholder="e.g. SUP-001" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" disabled={saving} style={{ flex: 1, backgroundColor: saving ? '#93c5fd' : '#1e40af', color: '#fff', border: 'none', padding: '10px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? t('common_saving') : t('admin_save')}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #d1d5db', padding: '10px', borderRadius: '7px', fontSize: '14px', cursor: 'pointer' }}>{t('admin_cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '32px', width: '380px' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: '700' }}>{t('admin_reset_pwd')}</h2>
            <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '14px' }}>{resetModal.name} ({resetModal.email})</p>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password (min 6 chars)" style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px' }} />
            {resetMsg && <p style={{ margin: '0 0 12px', fontSize: '13px', color: resetMsg.includes('success') ? '#059669' : '#dc2626' }}>{resetMsg}</p>}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleReset} style={{ flex: 1, backgroundColor: '#d97706', color: '#fff', border: 'none', padding: '10px', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>{t('admin_reset_pwd')}</button>
              <button onClick={() => setResetModal(null)} style={{ flex: 1, border: '1px solid #d1d5db', padding: '10px', borderRadius: '7px', fontSize: '14px', cursor: 'pointer', backgroundColor: '#fff' }}>{t('admin_cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
