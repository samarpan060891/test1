import axios from 'axios'

const baseURL = '/api'
const client = axios.create({ baseURL })

client.interceptors.request.use(config => {
  const token = sessionStorage.getItem(`token_${window.name}`)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default client
