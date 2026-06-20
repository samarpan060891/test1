import client from './client'

export const searchPOs = (search = '') =>
  client.get('/masters/pos', { params: { search } }).then(r => r.data)

export const searchAgencies = (search = '') =>
  client.get('/masters/agencies', { params: { search } }).then(r => r.data)

export const searchItems = (search = '') =>
  client.get('/masters/items', { params: { search } }).then(r => r.data)

export const searchSuppliers = (search = '') =>
  client.get('/masters/suppliers', { params: { search } }).then(r => r.data)
