import React, { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import {
  getTemplates,
  createTemplate,
  activateTemplate,
  addItem,
  deleteItem
} from '../api/checklistTemplates.js'

const statusColors = {
  active: { backgroundColor: '#d1fae5', color: '#065f46' },
  draft: { backgroundColor: '#fef3c7', color: '#92400e' },
  archived: { backgroundColor: '#f3f4f6', color: '#6b7280' }
}

const criticalityOptions = ['critical', 'major', 'minor']

function TemplateCard({ template, onActivate, onAddItem, onDeleteItem }) {
  const [expanded, setExpanded] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [activating, setActivating] = useState(false)

  const [newItem, setNewItem] = useState({
    section: '',
    checkpoint_text: '',
    criticality: 'minor',
    sort_order: ''
  })
  const [addingItem, setAddingItem] = useState(false)
  const [addItemError, setAddItemError] = useState('')

  const templateId = template.checklist_template_id || template.id
  const items = template.items || template.checklist_items || []

  const handleActivate = async () => {
    setActivating(true)
    try {
      await onActivate(templateId)
    } finally {
      setActivating(false)
    }
  }

  const handleAddItem = async (e) => {
    e.preventDefault()
    if (!newItem.section.trim() || !newItem.checkpoint_text.trim()) {
      setAddItemError('Section and checkpoint text are required.')
      return
    }
    setAddingItem(true)
    setAddItemError('')
    try {
      await onAddItem(templateId, {
        section: newItem.section.trim(),
        checkpoint_text: newItem.checkpoint_text.trim(),
        criticality: newItem.criticality,
        sort_order: newItem.sort_order ? parseInt(newItem.sort_order) : undefined
      })
      setNewItem({ section: '', checkpoint_text: '', criticality: 'minor', sort_order: '' })
      setShowAddItem(false)
    } catch (err) {
      setAddItemError(err?.response?.data?.message || 'Failed to add item.')
    } finally {
      setAddingItem(false)
    }
  }

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '5px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '10px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      marginBottom: '16px',
      overflow: 'hidden',
      border: '1px solid #e5e7eb'
    }}>
      {/* Template header */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: '#f9fafb',
        borderBottom: expanded ? '1px solid #e5e7eb' : 'none'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#111827' }}>
              {template.category}
            </h3>
            {template.sub_category && (
              <span style={{ fontSize: '13px', color: '#6b7280' }}>— {template.sub_category}</span>
            )}
            <span style={{
              ...(statusColors[template.status] || {}),
              padding: '2px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: '700',
              textTransform: 'uppercase'
            }}>
              {template.status}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            Version {template.version || 1} · {items.length} item{items.length !== 1 ? 's' : ''}
            · ID: <code style={{ fontFamily: 'monospace' }}>{String(templateId).slice(0, 8)}...</code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {template.status === 'draft' && (
            <button
              onClick={handleActivate}
              disabled={activating}
              style={{
                backgroundColor: activating ? '#86efac' : '#059669',
                color: '#fff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: activating ? 'not-allowed' : 'pointer'
              }}
            >
              {activating ? 'Activating...' : 'Activate'}
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              backgroundColor: '#fff',
              color: '#374151',
              border: '1px solid #d1d5db',
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            {expanded ? 'Collapse ▲' : 'Expand ▼'}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '16px 20px' }}>
          {/* Items list */}
          {items.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '12px' }}>No items yet. Add one below.</p>
          ) : (
            <div style={{ marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    {['Section', 'Checkpoint', 'Criticality', 'Sort', ''].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid #e5e7eb'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((item, idx) => {
                    const itemId = item.checklist_item_id || item.id
                    return (
                      <tr key={itemId || idx} style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
                      >
                        <td style={{ padding: '10px 12px', color: '#374151', fontWeight: '500' }}>
                          {item.section || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#374151', maxWidth: '300px' }}>
                          {item.checkpoint_text || item.text}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            backgroundColor: item.criticality === 'critical' ? '#fee2e2' : item.criticality === 'major' ? '#fef3c7' : '#dbeafe',
                            color: item.criticality === 'critical' ? '#dc2626' : item.criticality === 'major' ? '#d97706' : '#1d4ed8',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: '700',
                            textTransform: 'uppercase'
                          }}>
                            {item.criticality}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                          {item.sort_order ?? '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => onDeleteItem(templateId, itemId)}
                            style={{
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fca5a5',
                              padding: '4px 10px',
                              borderRadius: '5px',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add item form toggle */}
          {!showAddItem ? (
            <button
              onClick={() => setShowAddItem(true)}
              style={{
                backgroundColor: '#eff6ff',
                color: '#1e40af',
                border: '1px dashed #bfdbfe',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              + Add Checklist Item
            </button>
          ) : (
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: '700', color: '#374151' }}>
                Add New Checklist Item
              </h4>

              {addItemError && (
                <div style={{ color: '#dc2626', fontSize: '12px', marginBottom: '10px', padding: '8px 12px', backgroundColor: '#fef2f2', borderRadius: '5px', border: '1px solid #fca5a5' }}>
                  {addItemError}
                </div>
              )}

              <form onSubmit={handleAddItem}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                      Section *
                    </label>
                    <input
                      type="text"
                      value={newItem.section}
                      onChange={e => setNewItem(prev => ({ ...prev, section: e.target.value }))}
                      placeholder="e.g. Packaging"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                      Criticality *
                    </label>
                    <select
                      value={newItem.criticality}
                      onChange={e => setNewItem(prev => ({ ...prev, criticality: e.target.value }))}
                      style={{ ...inputStyle, backgroundColor: '#fff' }}
                    >
                      {criticalityOptions.map(opt => (
                        <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                    Checkpoint Text *
                  </label>
                  <textarea
                    value={newItem.checkpoint_text}
                    onChange={e => setNewItem(prev => ({ ...prev, checkpoint_text: e.target.value }))}
                    placeholder="Describe what to inspect..."
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#374151' }}>
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={newItem.sort_order}
                    onChange={e => setNewItem(prev => ({ ...prev, sort_order: e.target.value }))}
                    placeholder="e.g. 10"
                    style={{ ...inputStyle, width: '120px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="submit"
                    disabled={addingItem}
                    style={{
                      backgroundColor: addingItem ? '#86efac' : '#059669',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 18px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: addingItem ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {addingItem ? 'Adding...' : 'Add Item'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddItem(false); setAddItemError(''); }}
                    style={{
                      backgroundColor: '#fff',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ChecklistTemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddTemplate, setShowAddTemplate] = useState(false)

  const [newTemplate, setNewTemplate] = useState({ category: '', sub_category: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await getTemplates()
      setTemplates(Array.isArray(res.data) ? res.data : res.data?.templates || [])
    } catch {
      setError('Failed to load checklist templates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleCreateTemplate = async (e) => {
    e.preventDefault()
    if (!newTemplate.category.trim()) {
      setCreateError('Category is required.')
      return
    }
    setCreating(true)
    setCreateError('')
    setCreateSuccess('')
    try {
      await createTemplate({
        category: newTemplate.category.trim(),
        sub_category: newTemplate.sub_category.trim() || undefined
      })
      setNewTemplate({ category: '', sub_category: '' })
      setShowAddTemplate(false)
      setCreateSuccess('Template created successfully.')
      fetchTemplates()
    } catch (err) {
      setCreateError(err?.response?.data?.message || 'Failed to create template.')
    } finally {
      setCreating(false)
    }
  }

  const handleActivate = async (templateId) => {
    try {
      await activateTemplate(templateId)
      fetchTemplates()
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to activate template.')
    }
  }

  const handleAddItem = async (templateId, itemData) => {
    await addItem(templateId, itemData)
    fetchTemplates()
  }

  const handleDeleteItem = async (templateId, itemId) => {
    if (!window.confirm('Delete this checklist item?')) return
    try {
      await deleteItem(templateId, itemId)
      fetchTemplates()
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to delete item.')
    }
  }

  const inputStyle = {
    padding: '9px 13px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%'
  }

  const activeTemplates = templates.filter(t => t.status === 'active')
  const draftTemplates = templates.filter(t => t.status === 'draft')
  const otherTemplates = templates.filter(t => t.status !== 'active' && t.status !== 'draft')

  const renderSection = (title, list, color) => {
    if (list.length === 0) return null
    return (
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          {title} ({list.length})
        </h2>
        {list.map(t => (
          <TemplateCard
            key={t.checklist_template_id || t.id}
            template={t}
            onActivate={handleActivate}
            onAddItem={handleAddItem}
            onDeleteItem={handleDeleteItem}
          />
        ))}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Navbar />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '700', color: '#111827' }}>
              Checklist Templates
            </h1>
            <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
              Manage inspection checklist templates and their items.
            </p>
          </div>
          <button
            onClick={() => setShowAddTemplate(!showAddTemplate)}
            style={{
              backgroundColor: '#1e40af',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showAddTemplate ? 'Cancel' : '+ Add Template'}
          </button>
        </div>

        {/* Success message */}
        {createSuccess && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#15803d',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {createSuccess}
          </div>
        )}

        {/* Add Template form */}
        {showAddTemplate && (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            padding: '24px',
            marginBottom: '28px',
            border: '2px solid #bfdbfe'
          }}>
            <h2 style={{ margin: '0 0 18px', fontSize: '16px', fontWeight: '600', color: '#111827' }}>
              New Checklist Template
            </h2>

            {createError && (
              <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px', padding: '10px 14px', backgroundColor: '#fef2f2', borderRadius: '6px', border: '1px solid #fca5a5' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTemplate}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                    Category <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={newTemplate.category}
                    onChange={e => setNewTemplate(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g. Apparel"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                    Sub-Category
                  </label>
                  <input
                    type="text"
                    value={newTemplate.sub_category}
                    onChange={e => setNewTemplate(prev => ({ ...prev, sub_category: e.target.value }))}
                    placeholder="e.g. Knitwear"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    backgroundColor: creating ? '#93c5fd' : '#1e40af',
                    color: '#fff',
                    border: 'none',
                    padding: '9px 22px',
                    borderRadius: '7px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: creating ? 'not-allowed' : 'pointer'
                  }}
                >
                  {creating ? 'Creating...' : 'Create Template'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddTemplate(false); setCreateError(''); }}
                  style={{
                    backgroundColor: '#fff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    padding: '9px 16px',
                    borderRadius: '7px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Templates list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>Loading templates...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#dc2626' }}>{error}</div>
        ) : templates.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px',
            backgroundColor: '#fff',
            borderRadius: '10px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            color: '#9ca3af'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
            <p style={{ fontSize: '15px', margin: 0 }}>No checklist templates found.</p>
            <p style={{ fontSize: '13px', margin: '8px 0 0' }}>Click "Add Template" to create your first one.</p>
          </div>
        ) : (
          <>
            {renderSection('Active Templates', activeTemplates, '#059669')}
            {renderSection('Draft Templates', draftTemplates, '#d97706')}
            {renderSection('Other Templates', otherTemplates, '#6b7280')}
          </>
        )}
      </div>
    </div>
  )
}
