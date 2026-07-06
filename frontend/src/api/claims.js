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

export const updateClaimDetails = (id, data) => client.patch(`/claims/${id}/details`, data)

export const reviseReplacementDate = (id, expected_replacement_date) =>
  client.patch(`/claims/${id}/replacement-date`, { expected_replacement_date })
export const markReplacementReceived = (id) => client.post(`/claims/${id}/replacement-received`)

export const getClaimAttachments = (id) => client.get(`/claims/${id}/attachments`)
export const getClaimAttachmentFile = (id, aid) =>
  client.get(`/claims/${id}/attachments/${aid}/file`, { responseType: 'blob' })
export const uploadClaimAttachment = (id, file, kind) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', kind || 'defect_image')
  return client.post(`/claims/${id}/attachments`, fd)
}
export const deleteClaimAttachment = (id, aid) => client.delete(`/claims/${id}/attachments/${aid}`)
