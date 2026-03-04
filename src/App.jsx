import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { getPerfil, getCasetas } from './lib/api.js'
import Login from './components/Login.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import EmpleadoPanel from './components/EmpleadoPanel.jsx'
import './styles.css'

export default function App() {
  const [session, setSession]   = useState(null)
  const [perfil, setPerfil]     = useState(null)
  const [casetas, setCasetas]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Escuchar cambios de sesión
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Cargar perfil y casetas cuando hay sesión
  useEffect(() => {
    if (!session) { setPerfil(null); setLoading(false); return }
    setLoading(true)
    Promise.all([
      getPerfil(session.user.id),
      getCasetas(),
    ])
      .then(([p, c]) => { setPerfil(p); setCasetas(c) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return (
    <div className="splash">
      <div className="splash-logo">💥</div>
      <div className="splash-text">La Petardería TPV</div>
      <div className="spinner" />
    </div>
  )

  if (error) return (
    <div className="splash">
      <div style={{ color: 'var(--red)', marginBottom: 12 }}>⚠️ Error de conexión</div>
      <div style={{ fontSize: '.85rem', color: 'var(--tx2)', textAlign: 'center', maxWidth: 320 }}>{error}</div>
      <button className="btn-p" style={{ marginTop: 20, width: 'auto', padding: '10px 24px' }}
        onClick={() => window.location.reload()}>Reintentar</button>
    </div>
  )

  if (!session || !perfil) return <Login />

  if (!perfil.activo) return (
    <div className="splash">
      <div style={{ color: 'var(--red)' }}>🚫 Usuario desactivado</div>
      <div style={{ fontSize: '.85rem', color: 'var(--tx2)', marginTop: 8 }}>Contacta con el administrador.</div>
      <button className="btn-p" style={{ marginTop: 20, width: 'auto', padding: '10px 24px' }}
        onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </div>
  )

  if (perfil.rol === 'ADMIN') {
    return <AdminPanel perfil={perfil} casetas={casetas} />
  }

  return <EmpleadoPanel perfil={perfil} casetas={casetas} />
}
