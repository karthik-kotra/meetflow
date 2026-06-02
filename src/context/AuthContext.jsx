import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('meetflow_user')
    return stored ? JSON.parse(stored) : null
  })

  const register = async (name, email, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Registration failed')
    
    const u = { id: data._id, name: data.name, email: data.email, role: data.role, token: data.token }
    localStorage.setItem('meetflow_user', JSON.stringify(u))
    setUser(u)
  }

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Login failed')
    
    const u = { id: data._id, name: data.name, email: data.email, role: data.role, token: data.token }
    localStorage.setItem('meetflow_user', JSON.stringify(u))
    setUser(u)
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error(err)
    }
    localStorage.removeItem('meetflow_user')
    setUser(null)
  }

  const updateProfile = async (data) => {
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const resData = await res.json()
    if (!res.ok) throw new Error(resData.message || 'Failed to update profile')
    
    const updated = { ...user, name: resData.name, email: resData.email }
    localStorage.setItem('meetflow_user', JSON.stringify(updated))
    setUser(updated)
    return resData
  }

  const updatePassword = async (currentPassword, newPassword) => {
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const resData = await res.json()
    if (!res.ok) throw new Error(resData.message || 'Failed to update password')
    return resData
  }

  const deleteAccount = async () => {
    const res = await fetch('/api/auth/profile', {
      method: 'DELETE',
    })
    const resData = await res.json()
    if (!res.ok) throw new Error(resData.message || 'Failed to delete account')
    
    localStorage.removeItem('meetflow_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, register, login, logout, updateProfile, updatePassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
