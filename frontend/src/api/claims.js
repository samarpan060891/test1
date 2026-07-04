import client from './client.js'

export const listClaims = (params = {}) => client.get('/claims', { params })
export const getClaim = (id) => client.get(`/claims/${id}`)
export const createClaim = (data) => client.post('/claims', data)
export const qaSubmitClaim = (id, data) => client.post(`/claims/${id}/qa-submit`, data)
export const returnClaim = (id, remarks) => client.post(`/claims/${id}/return`, { remarks })
export const buyingSubmitClaim = (id, data) => client.post(`/claims/${id}/buying-submit`, data)
export const settleClaim = (id, data) => client.post(`/claims/${id}/settle`, data)
export const withdrawClaim = (id) => client.post(`/claims/${id}/withdraw`)
