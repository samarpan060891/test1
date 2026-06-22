import client from './client.js'

export const getAdvices = () => client.get('/inspection-costs')
export const getAdvice = (id) => client.get(`/inspection-costs/${id}`)
export const createAdvice = (data) => client.post('/inspection-costs', data)
export const approveAdvice = (id, notes) => client.put(`/inspection-costs/${id}/approve`, { notes })
export const rejectAdvice = (id, reason) => client.put(`/inspection-costs/${id}/reject`, { reason })

export const getContracts = () => client.get('/inspection-costs/contracts')
export const createContract = (data) => client.post('/inspection-costs/contracts', data)

export const uploadInvoice = (id, file) => {
  const fd = new FormData()
  fd.append('invoice', file)
  return client.post(`/inspection-costs/${id}/invoice`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const getInvoiceUrl = (id) => `/api/inspection-costs/${id}/invoice`
