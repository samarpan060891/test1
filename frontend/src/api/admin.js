import client from './client.js'

// Users
export const getUsers = () => client.get('/admin/users')
export const createUser = (data) => client.post('/admin/users', data)
export const updateUser = (id, data) => client.put(`/admin/users/${id}`, data)
export const deleteUser = (id) => client.delete(`/admin/users/${id}`)
export const resetPassword = (id, new_password) => client.put(`/admin/users/${id}/reset-password`, { new_password })

// Masters
export const getSuppliers = () => client.get('/admin/masters/suppliers')
export const saveSingleSupplier = (data) => client.post('/admin/masters/suppliers/single', data)
export const bulkSuppliers = (rows) => client.post('/admin/masters/suppliers/bulk', { rows: Array.isArray(rows) ? rows : [] })

export const getAgencies = () => client.get('/admin/masters/agencies')
export const saveSingleAgency = (data) => client.post('/admin/masters/agencies/single', data)
export const bulkAgencies = (rows) => client.post('/admin/masters/agencies/bulk', { rows })

export const getItems = () => client.get('/admin/masters/items')
export const saveSingleItem = (data) => client.post('/admin/masters/items/single', data)
export const bulkItems = (rows) => client.post('/admin/masters/items/bulk', { rows })

export const getPOs = () => client.get('/admin/masters/po')
export const saveSinglePO = (data) => client.post('/admin/masters/po/single', data)
export const bulkPOs = (rows) => client.post('/admin/masters/po/bulk', { rows })

export const getBuyers = () => client.get('/masters/buyers')
