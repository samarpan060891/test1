import client from './client.js'

export const listClaims = (params = {}) => client.get('/claims', { params })
export const getClaim = (id) => client.get(`/claims/${id}`)
export const createClaim = (data) => client.post('/claims', data)
export const qaSubmitClaim = (id, data) => client.post(`/claims/${id}/qa-submit`, data)
export const returnClaim = (id, remarks) => client.post(`/claims/${id}/return`, { remarks })
export const buyingSubmitClaim = (id, data) => client.post(`/claims/${id}/buying-submit`, data)
export const importsReviewClaim = (id, remarks) => client.post(`/claims/${id}/imports-review`, { remarks })
export const accountsCloseClaim = (id, deduction_remarks) => client.post(`/claims/${id}/accounts-close`, { deduction_remarks })
export const withdrawClaim = (id) => client.post(`/claims/${id}/withdraw`)
