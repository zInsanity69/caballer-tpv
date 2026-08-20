import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { getPerfil, getCasetas } from './lib/api.js'
import Login from './components/Login.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import EmpleadoPanel from './components/EmpleadoPanel.jsx'
import RRHHPanel from './components/RRHHPanel.jsx'
import Logo from './components/Logo.jsx'
import './styles.css'

export default function App() {
  const [session, setSession]   = useState(null)
  const [perfil, setPerfil]     = useState(null)
  const [casetas, setCasetas]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [ventaCaseta, setVentaCaseta] = useState(() => localStorage.getItem('admin_venta_caseta') || null) // admin en modo venta → caseta elegida (se recuerda al recargar)

  // Recordar el modo venta del admin entre recargas
  useEffect(() => {
    if (ventaCaseta) localStorage.setItem('admin_venta_caseta', ventaCaseta)
    else localStorage.removeItem('admin_venta_caseta')
  }, [ventaCaseta])

  // Escuchar cambios de sesión
  useEffect(() => {
    // Carga inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // TOKEN_REFRESHED ocurre al volver de otra pestaña — NO queremos recargar
      // Solo actualizamos sesión en eventos que realmente cambian el estado
      if (event === 'TOKEN_REFRESHED') return
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Cargar perfil y casetas cuando hay sesión
  // Solo recargamos si no tenemos perfil todavía o si cambió el usuario
  useEffect(() => {
    if (!session) { setPerfil(null); setLoading(false); return }
    // Si ya tenemos el perfil del mismo usuario, no recargar
    if (perfil && perfil.id === session.user.id) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      getPerfil(session.user.id),
      getCasetas().catch(() => []),  // empleados pueden no tener permiso para leer todas las casetas
    ])
      .then(([p, c]) => { setPerfil(p); setCasetas(c) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [session])

  if (loading) return (
    <div className="splash">
      <Logo style={{ width: 260, marginBottom: 16, marginLeft: 'auto', marginRight: 'auto' }} />
      <div className="spinner" />
    </div>
  )

  if (error) return (
    <div className="splash">
      <div style={{ color: 'var(--red)', marginBottom: 12 }}><i className="fi fi-rr-triangle-warning"/> Error de conexión</div>
      <div style={{ fontSize: '.85rem', color: 'var(--tx2)', textAlign: 'center', maxWidth: 320 }}>{error}</div>
      <button className="btn-p" style={{ marginTop: 20, width: 'auto', padding: '10px 24px' }}
        onClick={() => window.location.reload()}>Reintentar</button>
    </div>
  )

  if (!session || !perfil) return <Login />

  if (!perfil.activo) return (
    <div className="splash">
      <div style={{ color: 'var(--red)' }}><i className="fi fi-rr-ban"/> Usuario desactivado</div>
      <div style={{ fontSize: '.85rem', color: 'var(--tx2)', marginTop: 8 }}>Contacta con el administrador.</div>
      <button className="btn-p" style={{ marginTop: 20, width: 'auto', padding: '10px 24px' }}
        onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </div>
  )

  if (perfil.rol === 'ADMIN') {
    const cs = ventaCaseta ? casetas.find(c => c.id === ventaCaseta) : null
    if (ventaCaseta && cs) {
      return <EmpleadoPanel
        key={ventaCaseta}
        perfil={{ ...perfil, caseta_id: ventaCaseta, casetas: cs }}
        casetas={casetas}
        onSalirVenta={() => setVentaCaseta(null)} />
    }
    return <AdminPanel perfil={perfil} casetas={casetas} onModoVenta={setVentaCaseta} />
  }
  if (perfil.rol === 'RRHH')  return <RRHHPanel perfil={perfil} />

  return <EmpleadoPanel perfil={perfil} casetas={casetas} />
}
