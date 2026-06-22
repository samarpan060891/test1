import React, { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getUsers, createUser, updateUser, deleteUser, resetPassword } from '../api/admin.js'

const ROLES = ['qa', 'buying', 'imports', 'accounts', 'agency_user', 'supplier_user', 'admin']

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

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

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

  const roleColor = { qa: '#7c3aed', buying: '#0369a1', imports: '#0891b2', accounts: '#059669', agency_user: '#0f766e', supplier_user: '#b45309', admin: '#dc2626' }

  return (
    <div className="page">
      <Navbar />
      <div className="page-content">
        <div className="flex-between mb-6">
          <div>
            <h1 className="page-title">{t('admin_users_title')}</h1>
            <p className="page-subtitle">{users.length} users</p>
          </div>
          <button onClick={openCreate} className="btn btn-primary">{t('admin_add_user')}</button>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>{['Name', 'Email', 'Role', 'Agency/Supplier', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.user_id}>
                      <td style={{ fontWeight: '600', color: '#0f172a' }}>{u.name}</td>
                      <td style={{ color: '#64748b' }}>{u.email}</td>
                      <td>
                        <span style={{ background: roleColor[u.role] + '20', color: roleColor[u.role], padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>{u.role}</span>
                      </td>
                      <td>{u.agency_code || u.supplier_code || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => openEdit(u)} className="btn btn-ghost btn-sm">{t('admin_edit')}</button>
                          <button onClick={() => { setResetModal(u); setNewPwd(''); setResetMsg('') }} className="btn btn-sm" style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' }}>{t('admin_reset_pwd')}</button>
                          <button onClick={() => handleDelete(u)} className="btn btn-sm" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>{t('admin_delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p className="modal-title">{editUser ? t('admin_edit') : t('admin_add_user')}</p>
            {error && <div className="alert alert-error mb-4">{error}</div>}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[['Name', 'name', 'text'], ['Email', 'email', 'email']].map(([label, key, type]) => (
                <div key={key} className="field" style={{ marginBottom: 0 }}>
                  <label>{label} *</label>
                  <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} required className="input" />
                </div>
              ))}
              {!editUser && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Password *</label>
                  <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6} className="input" />
                </div>
              )}
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Role *</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value, agency_code: '', supplier_code: '' }))} className="input">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {form.role === 'agency_user' && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Agency Code *</label>
                  <input value={form.agency_code} onChange={e => setForm(p => ({ ...p, agency_code: e.target.value }))} placeholder="e.g. AGC-001" className="input" />
                </div>
              )}
              {form.role === 'supplier_user' && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Supplier Code *</label>
                  <input value={form.supplier_code} onChange={e => setForm(p => ({ ...p, supplier_code: e.target.value }))} placeholder="e.g. SUP-001" className="input" />
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>{saving ? t('common_saving') : t('admin_save')}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost" style={{ flex: 1 }}>{t('admin_cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '400px' }}>
            <p className="modal-title">{t('admin_reset_pwd')}</p>
            <p className="modal-subtitle">{resetModal.name} ({resetModal.email})</p>
            <div className="field">
              <label>New Password</label>
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 6 characters" className="input" />
            </div>
            {resetMsg && <div className={`alert mb-4 ${resetMsg.includes('success') ? 'alert-success' : 'alert-error'}`}>{resetMsg}</div>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleReset} className="btn btn-warning" style={{ flex: 1 }}>{t('admin_reset_pwd')}</button>
              <button onClick={() => setResetModal(null)} className="btn btn-ghost" style={{ flex: 1 }}>{t('admin_cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
