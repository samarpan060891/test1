import client from './client.js'

export const login = (email, password) => client.post('/auth/login', { email, password })

export const changePassword = (current_password, new_password) =>
  client.put('/auth/change-password', { current_password, new_password })
