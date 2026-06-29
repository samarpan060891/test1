import client from './client.js'

export const getDocuments = () => client.get('/documents')
export const uploadDocument = (formData) =>
  client.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const reviewDocument = (id, data) => client.put(`/documents/${id}/review`, data)
export const getDocumentFile = (id) => client.get(`/documents/${id}/file`, { responseType: 'blob' })
export const getDocumentSummary = () => client.get('/documents/summary')
export const markNotApplicable = (data) => client.post('/documents/mark-na', data)
export const internalUploadDocument = (formData) =>
  client.post('/documents/internal-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
