import client from './client.js'

export const login = (email, password) => client.post('/auth/login', { email, password })
