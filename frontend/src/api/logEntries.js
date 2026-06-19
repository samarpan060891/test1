import client from './client.js'

export const getLogs = (params) => client.get('/log-entries', { params })

export const createLog = (data) => client.post('/log-entries', data)
