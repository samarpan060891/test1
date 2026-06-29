import client from './client.js'

export const getPastInspections = (item_code) =>
  client.get('/item-history/inspections', { params: { item_code } })

export const getComplaints = (item_code) =>
  client.get('/item-history/complaints', { params: { item_code } })

export const getAllComplaints = () =>
  client.get('/item-history/complaints/all')

export const createComplaint = (data) =>
  client.post('/item-history/complaints', data)

export const bulkComplaints = (rows) =>
  client.post('/item-history/complaints/bulk', { rows })

export const deleteComplaint = (id) =>
  client.delete(`/item-history/complaints/${id}`)

export const getClaims = (item_code) =>
  client.get('/item-history/claims', { params: { item_code } })

export const getAllClaims = () =>
  client.get('/item-history/claims/all')

export const createClaim = (data) =>
  client.post('/item-history/claims', data)

export const bulkClaims = (rows) =>
  client.post('/item-history/claims/bulk', { rows })

export const deleteClaim = (id) =>
  client.delete(`/item-history/claims/${id}`)
