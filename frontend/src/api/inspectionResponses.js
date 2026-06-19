import client from './client.js'

export const getResponses = (jobId) => client.get(`/inspection-responses/${jobId}`)

export const submitResponses = (jobId, responses) =>
  client.post(`/inspection-responses/${jobId}`, { responses })
