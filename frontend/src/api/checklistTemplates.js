import client from './client.js'

export const getTemplates = () => client.get('/checklist-templates')

export const getTemplate = (id) => client.get(`/checklist-templates/${id}`)

export const createTemplate = (data) => client.post('/checklist-templates', data)

export const activateTemplate = (id) => client.put(`/checklist-templates/${id}/activate`)

export const addItem = (templateId, itemData) =>
  client.post(`/checklist-templates/${templateId}/items`, itemData)

export const updateItem = (templateId, itemId, data) =>
  client.put(`/checklist-templates/${templateId}/items/${itemId}`, data)

export const deleteItem = (templateId, itemId) =>
  client.delete(`/checklist-templates/${templateId}/items/${itemId}`)
