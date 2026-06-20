import client from './client.js'

export const getAdvices = () => client.get('/inspection-costs')
export const getAdvice = (id) => client.get(`/inspection-costs/${id}`)
export const createAdvice = (data) => client.post('/inspection-costs', data)
export const approveAdvice = (id, notes) => client.put(`/inspection-costs/${id}/approve`, { notes })
export const rejectAdvice = (id, reason) => client.put(`/inspection-costs/${id}/reject`, { reason })

export const getContracts = () => client.get('/inspection-costs/contracts')
export const createContract = (data) => client.post('/inspection-costs/contracts', data)
