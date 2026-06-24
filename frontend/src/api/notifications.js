import client from './client.js'

export const getNotifications = () => client.get('/notifications')
export const deleteNotification = (id) => client.delete(`/notifications/${id}`)
