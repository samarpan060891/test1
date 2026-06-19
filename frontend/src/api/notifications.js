import client from './client.js'

export const getNotifications = () => client.get('/notifications')
