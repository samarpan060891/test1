import axios from 'axios'

const baseURL = (import.meta.env.VITE_API_URL || 'https://test1-production-6593.up.railway.app') + '/api'
const client = axios.create({ baseURL })

client.interceptors.request.use(config => {
  const token = sessionStorage.getItem(`token_${window.name}`)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default client
