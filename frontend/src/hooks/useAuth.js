// hooks/useAuth.js
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api.js'

export function useAuth() {
  const [usuario, setUsuario] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('tpv_token')
    if (!token) { setLoading(false); return }
    api.me()
      .then(u => setUsuario(u))
      .catch(() => localStorage.removeItem('tpv_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const { token, usuario } = await api.login(email, password)
    localStorage.setItem('tpv_token', token)
    setUsuario(usuario)
    return usuario
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('tpv_token')
    setUsuario(null)
  }, [])

  return { usuario, loading, login, logout }
}
