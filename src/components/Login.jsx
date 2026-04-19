import { useState } from 'react'
import { login } from '../lib/api.js'
import logoColor from '../assets/logo_caballer_color.svg'

export default function Login() {
  const [showPass, setShowPass] = useState(false)
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [err, setErr]       = useState('')
  const [loading, setLoading] = useState(false)

  const go = async () => {
    if (!email || !pass) { setErr('Introduce email y contraseña'); return }
    setLoading(true); setErr('')
    try {
      await login(email.trim(), pass)
      // App.jsx detecta el cambio de sesión automáticamente
    } catch (e) {
      setErr(e.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos'
        : e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="splash" style={{ background: 'radial-gradient(ellipse at 50% 0%,#ff4d1c22 0%,transparent 60%),var(--bg)' }}>
      <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400 }}>
        <img src={logoColor} alt="Caballer" style={{ width: 250, display: 'block', margin: '0 auto 4px' }} />
        <div style={{ textAlign: 'center', color: 'var(--tx2)', fontSize: '.82rem', marginBottom: 28 }}>
          Sistema TPV Profesional
        </div>

        {err && <div className="err-box">{err}</div>}

        <div className="fg">
          <label>Email</label>
          <input
            type="email" value={email} autoComplete="email"
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && go()}
            placeholder="usuario@caballer.es"
          />
        </div>
        <div className="fg">
          <label>Contraseña</label>
          <div style={{position:'relative'}}>
            <input
              type={showPass?'text':'password'} value={pass} autoComplete="current-password"
              onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && go()}
              placeholder="••••••••"
              style={{paddingRight:38}}
            />
            <button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--tx2)',fontSize:'1rem'}}>{showPass?'🙈':'👁️'}</button>
          </div>
        </div>

        <button className="btn-p" onClick={go} disabled={loading}>
          {loading ? 'Entrando...' : 'Acceder al sistema'}
        </button>
      </div>
    </div>
  )
}
