import client from './client.js'

export const getJobs = (params) => client.get('/inspection-jobs', { params })

export const getJob = (id) => client.get(`/inspection-jobs/${id}`)

export const mapJob = (data) => client.post('/inspection-jobs', data)

export const submitJob = (id) => client.put(`/inspection-jobs/${id}/submit`)

export const makeDecision = (id, data) => client.put(`/inspection-jobs/${id}/decision`, data)
