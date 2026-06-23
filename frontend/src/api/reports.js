import client from './client.js'

export const getChecklistReport = (params = {}) => client.get('/reports/checklist', { params })
