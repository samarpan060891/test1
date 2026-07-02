import client from './client.js'

export const getJobs = (params) => client.get('/inspection-jobs', { params })

export const getJob = (id) => client.get(`/inspection-jobs/${id}`)

export const mapJob = (data) => client.post('/inspection-jobs', data)

export const submitJob = (id, data = {}) => client.put(`/inspection-jobs/${id}/submit`, data)

export const makeDecision = (id, data) => client.put(`/inspection-jobs/${id}/decision`, data)

export const requestJobDeviation = (id, reason) => client.post(`/inspection-jobs/${id}/request-deviation`, { reason })

export const buyerReviewJobDeviation = (id, action, remarks) => client.post(`/inspection-jobs/${id}/buyer-deviation`, { action, remarks })
