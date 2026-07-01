import client from './client.js'

export const listWarehouseInspections = (params = {}) =>
  client.get('/warehouse-inspections', { params })

export const getWarehouseInspection = (id) =>
  client.get(`/warehouse-inspections/${id}`)

export const getWarehouseResponses = (id) =>
  client.get(`/warehouse-inspections/${id}/responses`)

export const getWarehousePriorQC = (id) =>
  client.get(`/warehouse-inspections/${id}/prior-qc`)

export const getChecklistTemplates = (stage, item_code) =>
  client.get('/warehouse-inspections/checklist-templates', { params: { stage, item_code } })

export const addCheckpointTemplate = (data) =>
  client.post('/warehouse-inspections/checkpoint-templates', data)

export const deleteCheckpointTemplate = (checkpointId) =>
  client.delete(`/warehouse-inspections/checkpoint-templates/${checkpointId}`)

export const syncInspectionResponses = (id) =>
  client.post(`/warehouse-inspections/${id}/sync-responses`)

export const createWarehouseInspection = (data) =>
  client.post('/warehouse-inspections', data)

export const saveWarehouseResponses = (id, responses) =>
  client.put(`/warehouse-inspections/${id}/responses`, { responses })

export const completeWarehouseInspection = (id, remarks) =>
  client.patch(`/warehouse-inspections/${id}/complete`, { remarks })

export const getWarehouseImages = (id) =>
  client.get(`/warehouse-inspections/${id}/images`)

export const getWarehouseImageFile = (id, imageId) =>
  client.get(`/warehouse-inspections/${id}/images/${imageId}/file`, { responseType: 'blob' })

export const uploadWarehouseImage = (id, file, sectionKey) => {
  const fd = new FormData()
  fd.append('image', file)
  if (sectionKey) fd.append('section_key', sectionKey)
  return client.post(`/warehouse-inspections/${id}/images`, fd)
}

export const deleteWarehouseImage = (id, imageId) =>
  client.delete(`/warehouse-inspections/${id}/images/${imageId}`)
