import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { getCasetas } from '../lib/api.js'
import { GestionCasetas, GestionUsuarios, PanelFichajes } from './AdminPanel.jsx'

function useWheelScroll() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const h = e => { if (e.deltaY === 0) return; e.preventDefault(); el.scrollLeft += e.deltaY }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])
  return ref
}
function WheelScrollDiv({ children, className, style }) {
  const ref = useWheelScroll()
  return <div ref={ref} className={className} style={style}>{children}</div>
}

const TABS = [
  ['fichajes',  '⏱️ Fichajes'],
  ['usuarios',  '👥 Usuarios'],
  ['casetas',   '🏪 Casetas'],
]

export default function RRHHPanel({ perfil }) {
  const [tab, setTab]         = useState('fichajes')
  const [casetas, setCasetas] = useState([])

  useEffect(() => { getCasetas().then(setCasetas).catch(() => {}) }, [])

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">CABALLER</div>
        <div className="ti">
          <span style={{ fontSize: '.8rem', color: 'var(--tx2)' }}>{perfil.nombre}</span>
          <span className="badge ba" style={{ background: 'rgba(96,165,250,.15)', color: 'var(--blue)', border: '1px solid rgba(96,165,250,.3)' }}>RRHH</span>
          <button className="btn-o" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>

      <WheelScrollDiv className="navtabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={`ntab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} style={{ flexShrink: 0 }}>{l}</button>
        ))}
      </WheelScrollDiv>

      <div className="cnt">
        {tab === 'fichajes' && <PanelFichajes casetas={casetas} adminId={perfil.id} />}
        {tab === 'usuarios' && <GestionUsuarios casetas={casetas} soloEmpleados />}
        {tab === 'casetas'  && <GestionCasetas casetas={casetas} setCasetas={setCasetas} />}
      </div>
    </div>
  )
}
