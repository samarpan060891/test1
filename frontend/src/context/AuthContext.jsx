import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = sessionStorage.getItem('token')
    const storedUser = sessionStorage.getItem('user')
    if (storedToken && storedUser) {
      try {
        // Validate token is not expired by checking its expiry
        const payload = JSON.parse(atob(storedToken.split('.')[1]))
        if (payload.exp * 1000 < Date.now()) {
          sessionStorage.removeItem('token')
          sessionStorage.removeItem('user')
        } else {
          setToken(storedToken)
          setUser(JSON.parse(storedUser))
        }
      } catch {
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const response = await axios.post('/api/auth/login', { email, password })
    const { token: newToken, user: newUser } = response.data
    sessionStorage.setItem('token', newToken)
    sessionStorage.setItem('user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    return newUser
  }

  const logout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
