import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  getProductos, upsertProducto, toggleProducto, deleteProducto,
  getOfertas, upsertOferta, deleteOferta,
  getPerfiles, updatePerfil,
  getStatsAdmin, getTicketsAdmin,
  setStock, getStockCaseta,
  crearUsuario,
} from '../lib/api.js'
import { fmt } from '../lib/precios.js'

const TABS = [
  ['dashboard',  '📊 Dashboard'],
  ['productos',  '📦 Productos'],
  ['ofertas',    '🏷 Ofertas'],
  ['usuarios',   '👥 Usuarios'],
]

function Toast({ msg, type }) {
  return <div className="twrap"><div className={`toast ${type === 'error' ? 'te2' : 'tok'}`}>{msg}</div></div>
}

// ─── DASHBOARD ───────────────────────────────────────────────
function Dashboard({ casetas }) {
  const [stats,   setStats]   = useState(null)
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getStatsAdmin(), getTicketsAdmin()])
      .then(([s, t]) => { setStats(s); setTickets(t) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-row"><div className="spin-sm" /> Cargando estadísticas...</div>

  const totalHoy    = stats.tickets.reduce((s, t) => s + t.total, 0)
  const efectivoHoy = stats.tickets.filter(t => t.metodo_pago === 'efectivo').reduce((s, t) => s + t.total, 0)
  const tarjetaHoy  = stats.tickets.filter(t => t.metodo_pago === 'tarjeta').reduce((s, t) => s + t.total, 0)

  return (
    <>
      <div className="ag">
        <div className="sc"><div className="sv">{fmt(totalHoy)}</div><div className="sl2">Ventas hoy</div></div>
        <div className="sc"><div className="sv">{stats.tickets.length}</div><div className="sl2">Tickets hoy</div></div>
        <div className="sc"><div className="sv">{fmt(efectivoHoy)}</div><div className="sl2">Efectivo hoy</div></div>
        <div className="sc"><div className="sv">{fmt(tarjetaHoy)}</div><div className="sl2">Tarjeta hoy</div></div>
        <div className="sc"><div className="sv" style={{ color: stats.stockBajo.length > 5 ? 'var(--red)' : 'var(--ac)' }}>{stats.stockBajo.length}</div><div className="sl2">Stock bajo</div></div>
        <div className="sc"><div className="sv">{casetas.length}</div><div className="sl2">Casetas</div></div>
      </div>

      <div className="stit">Últimas ventas de hoy</div>
      <div className="tw">
        <table>
          <thead><tr><th>Hora</th><th>Caseta</th><th>Empleado</th><th>Método</th><th>Total</th></tr></thead>
          <tbody>
            {tickets.length === 0
              ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 20 }}>Sin ventas hoy</td></tr>
              : tickets.slice(0, 20).map(t => (
                <tr key={t.id}>
                  <td style={{ color: 'var(--tx2)' }}>{new Date(t.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ color: 'var(--tx2)' }}>{t.casetas?.nombre}</td>
                  <td>{t.perfiles?.nombre}</td>
                  <td>{t.metodo_pago === 'efectivo' ? '💵 Efectivo' : '💳 Tarjeta'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmt(t.total)}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      <div className="stit">Stock crítico (menos de 10 unidades)</div>
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th>Caseta</th><th>Stock</th></tr></thead>
          <tbody>
            {stats.stockBajo.length === 0
              ? <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 20 }}>Todo el stock está bien ✓</td></tr>
              : stats.stockBajo.map((s, i) => (
                <tr key={i}>
                  <td>{s.productos?.nombre}</td>
                  <td style={{ color: 'var(--tx2)' }}>{s.casetas?.nombre}</td>
                  <td style={{ color: s.cantidad === 0 ? 'var(--red)' : 'var(--gold)', fontWeight: 700 }}>{s.cantidad}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── GESTIÓN PRODUCTOS ────────────────────────────────────────
function GestionProductos({ casetas }) {
  const [productos, setProductos] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [toast,     setToast]     = useState(null)
  const [editId,    setEditId]    = useState(null)
  const [busq,      setBusq]      = useState('')
  const F0 = { nombre: '', precio: '', categoria: 'Petardos', edad_minima: '16', codigo_ean: '' }
  const [form, setForm] = useState(F0)

  const CATS = ['Petardos','Truenos','Bengalas','Cracker','Terrestres','Fuentes','Efectos','Packs','Accesorios']

  const showToast = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    getProductos().then(setProductos).finally(() => setLoading(false))
  }, [])

  const guardar = async () => {
    if (!form.nombre.trim() || !form.precio || !form.codigo_ean.trim()) {
      showToast('Nombre, precio y código EAN son obligatorios', 'error'); return
    }
    try {
      const data = await upsertProducto({
        ...(editId ? { id: editId } : {}),
        nombre: form.nombre.trim(),
        precio: parseFloat(form.precio),
        categoria: form.categoria,
        edad_minima: parseInt(form.edad_minima),
        codigo_ean: form.codigo_ean.trim(),
        activo: true,
      })
      if (editId) {
        setProductos(prev => prev.map(p => p.id === editId ? data : p))
        showToast('Producto actualizado ✓')
      } else {
        setProductos(prev => [...prev, data])
        showToast('Producto añadido ✓')
      }
      setForm(F0); setEditId(null)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const editar = p => {
    setForm({ nombre: p.nombre, precio: String(p.precio), categoria: p.categoria, edad_minima: String(p.edad_minima), codigo_ean: p.codigo_ean })
    setEditId(p.id)
  }

  const toggle = async (id, activo) => {
    await toggleProducto(id, !activo)
    setProductos(prev => prev.map(p => p.id === id ? { ...p, activo: !activo } : p))
  }

  const eliminar = async id => {
    if (!window.confirm('¿Eliminar producto? Esta acción no se puede deshacer.')) return
    try {
      await deleteProducto(id)
      setProductos(prev => prev.filter(p => p.id !== id))
      showToast('Producto eliminado')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const eaCl = m => m === 0 ? 'cp' : m === 12 ? 'cg' : m === 16 ? 'cb2' : 'cr'
  const eaLbl = m => m === 0 ? 'T1' : m + '+'
  const prods = productos.filter(p => !busq || p.nombre.toLowerCase().includes(busq.toLowerCase()) || p.codigo_ean?.includes(busq))

  if (loading) return <div className="loading-row"><div className="spin-sm" />Cargando...</div>

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="stit">{editId ? '✏️ Editar Producto' : '➕ Nuevo Producto'}</div>
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Piratas 50u." /></div>
          <div className="fg"><label>Precio (€)</label><input type="number" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} placeholder="1.00" min="0" step=".01" /></div>
          <div className="fg"><label>Código EAN</label><input value={form.codigo_ean} onChange={e => setForm({ ...form, codigo_ean: e.target.value })} placeholder="8410278004" inputMode="numeric" /></div>
          <div className="fg"><label>Categoría</label>
            <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="fg"><label>Edad mínima</label>
            <select value={form.edad_minima} onChange={e => setForm({ ...form, edad_minima: e.target.value })}>
              <option value="0">T1 (requiere DNI)</option>
              <option value="12">12+</option>
              <option value="16">16+</option>
              <option value="18">18+</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn-add" onClick={guardar}>{editId ? 'Guardar cambios' : 'Añadir producto'}</button>
          {editId && <button className="btn-s" style={{ width: 'auto', marginTop: 0 }} onClick={() => { setEditId(null); setForm(F0) }}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Catálogo ({productos.length} productos)</div>
      <div style={{ marginBottom: 11 }}>
        <input className="si" style={{ maxWidth: 340 }} placeholder="Buscar producto o EAN..." value={busq} onChange={e => setBusq(e.target.value)} />
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>Nombre</th><th>EAN</th><th>Categoría</th><th>Precio</th><th>Edad</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {prods.map(p => (
              <tr key={p.id} style={{ opacity: p.activo ? 1 : .5 }}>
                <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                <td style={{ color: 'var(--tx2)', fontSize: '.76rem', fontFamily: 'monospace' }}>{p.codigo_ean}</td>
                <td style={{ color: 'var(--tx2)' }}>{p.categoria}</td>
                <td style={{ color: 'var(--ac)', fontWeight: 700 }}>{fmt(p.precio)}</td>
                <td><span className={`chip ${eaCl(p.edad_minima)}`}>{eaLbl(p.edad_minima)}</span></td>
                <td><span className={`chip ${p.activo ? 'cg' : 'cr'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div className="acell">
                    <button className="btn-edit" onClick={() => editar(p)}>Editar</button>
                    <button className="btn-tog" style={{ color: p.activo ? 'var(--gold)' : 'var(--green)' }} onClick={() => toggle(p.id, p.activo)}>{p.activo ? 'Desact.' : 'Activar'}</button>
                    <button className="btn-del" onClick={() => eliminar(p.id)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── GESTIÓN OFERTAS ──────────────────────────────────────────
function GestionOfertas() {
  const [ofertas,   setOfertas]   = useState([])
  const [productos, setProductos] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [toast,     setToast]     = useState(null)
  const [editId,    setEditId]    = useState(null)
  const F0 = { producto_id: '', etiqueta: '', cantidad_pack: '', precio_pack: '' }
  const [form, setForm] = useState(F0)

  const showToast = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    Promise.all([getOfertas(), getProductos()]).then(([o, p]) => { setOfertas(o); setProductos(p) }).finally(() => setLoading(false))
  }, [])

  const precioU = () => (form.cantidad_pack && form.precio_pack) ? parseFloat(form.precio_pack) / parseInt(form.cantidad_pack) : 0
  const prodSel = productos.find(p => p.id === form.producto_id)

  const guardar = async () => {
    if (!form.producto_id || !form.etiqueta || !form.cantidad_pack || !form.precio_pack) {
      showToast('Todos los campos son obligatorios', 'error'); return
    }
    try {
      const data = await upsertOferta({
        ...(editId ? { id: editId } : {}),
        producto_id:  form.producto_id,
        etiqueta:     form.etiqueta,
        cantidad_pack: parseInt(form.cantidad_pack),
        precio_pack:  parseFloat(form.precio_pack),
        activa:       true,
      })
      if (editId) {
        setOfertas(prev => prev.map(o => o.id === editId ? data : o))
        showToast('Oferta actualizada ✓')
      } else {
        setOfertas(prev => [...prev, data])
        showToast('Oferta añadida ✓')
      }
      setForm(F0); setEditId(null)
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const editar = o => {
    setForm({ producto_id: o.producto_id, etiqueta: o.etiqueta, cantidad_pack: String(o.cantidad_pack), precio_pack: String(o.precio_pack) })
    setEditId(o.id)
  }

  const eliminar = async id => {
    if (!window.confirm('¿Eliminar esta oferta?')) return
    await deleteOferta(id)
    setOfertas(prev => prev.filter(o => o.id !== id))
    showToast('Oferta eliminada')
  }

  if (loading) return <div className="loading-row"><div className="spin-sm" />Cargando...</div>

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="stit">{editId ? '✏️ Editar Oferta' : '➕ Nueva Oferta'}</div>
      <div className="info-box">
        <strong style={{ color: 'var(--gold)' }}>Cómo funcionan los packs:</strong><br />
        Cada oferta es un pack de <em>N unidades por X€</em>. Si el cliente compra una cantidad no múltiplo exacta, el resto va a precio normal.<br />
        Ejemplo — oferta <strong>4×5€</strong>: 9 unidades = 2 packs de 4 (8u, 10€) + 1u a precio normal.
      </div>
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Producto</label>
            <select value={form.producto_id} onChange={e => setForm({ ...form, producto_id: e.target.value })}>
              <option value="">-- Seleccionar --</option>
              {productos.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre} ({fmt(p.precio)})</option>)}
            </select>
          </div>
          <div className="fg"><label>Etiqueta visible</label><input value={form.etiqueta} onChange={e => setForm({ ...form, etiqueta: e.target.value })} placeholder="Ej: 4 x 5€" /></div>
          <div className="fg"><label>Unidades del pack</label><input type="number" value={form.cantidad_pack} onChange={e => setForm({ ...form, cantidad_pack: e.target.value })} placeholder="4" min="2" /></div>
          <div className="fg"><label>Precio total del pack (€)</label><input type="number" value={form.precio_pack} onChange={e => setForm({ ...form, precio_pack: e.target.value })} placeholder="5.00" min="0" step=".01" /></div>
        </div>
        {form.cantidad_pack && form.precio_pack && (
          <div style={{ fontSize: '.8rem', marginBottom: 11, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--gold)' }}>Precio/u. con oferta: <strong>{fmt(precioU())}</strong></span>
            {prodSel && <span style={{ color: 'var(--green)' }}>Ahorro vs. normal: <strong>{fmt(prodSel.precio - precioU())}/u.</strong></span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn-add" onClick={guardar}>{editId ? 'Guardar cambios' : 'Añadir oferta'}</button>
          {editId && <button className="btn-s" style={{ width: 'auto', marginTop: 0 }} onClick={() => { setEditId(null); setForm(F0) }}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Ofertas activas ({ofertas.length})</div>
      <div className="tw">
        <table>
          <thead><tr><th>Producto</th><th>Pack</th><th>Precio pack</th><th>€/unidad</th><th>Normal</th><th>Ahorro/u.</th><th>Acciones</th></tr></thead>
          <tbody>
            {ofertas.length === 0
              ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--tx2)', padding: 24 }}>Sin ofertas configuradas</td></tr>
              : ofertas.map(o => {
                const p = productos.find(x => x.id === o.producto_id)
                const pu = o.precio_pack / o.cantidad_pack
                const ahorro = p ? p.precio - pu : 0
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{p ? p.nombre : <span style={{ color: 'var(--red)' }}>Eliminado</span>}</td>
                    <td><span className="chip cy">{o.etiqueta}</span></td>
                    <td style={{ color: 'var(--ac)', fontWeight: 700 }}>{fmt(o.precio_pack)}</td>
                    <td style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(pu)}</td>
                    <td style={{ color: 'var(--tx2)' }}>{p ? fmt(p.precio) : '—'}</td>
                    <td style={{ color: ahorro > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{ahorro > 0 ? `-${fmt(ahorro)}` : '—'}</td>
                    <td>
                      <div className="acell">
                        <button className="btn-edit" onClick={() => editar(o)}>Editar</button>
                        <button className="btn-del" onClick={() => eliminar(o.id)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── GESTIÓN USUARIOS ─────────────────────────────────────────
function GestionUsuarios({ casetas }) {
  const [perfiles, setPerfiles] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState(null)
  const [editId,   setEditId]   = useState(null)
  const F0 = { nombre: '', email: '', password: '', rol: 'EMPLEADO', caseta_id: '' }
  const [form, setForm] = useState(F0)
  const [msg,  setMsg]  = useState(null)

  const showToast = (txt, type = 'ok') => { setToast({ msg: txt, type }); setTimeout(() => setToast(null), 3000) }
  const showMsg   = (txt, ok = true)   => { setMsg({ txt, ok }); setTimeout(() => setMsg(null), 4000) }

  useEffect(() => {
    getPerfiles().then(setPerfiles).finally(() => setLoading(false))
  }, [])

  const guardar = async () => {
    if (!form.nombre.trim() || !form.email.trim()) { showMsg('Nombre y email son obligatorios', false); return }
    if (!editId && !form.password.trim()) { showMsg('La contraseña es obligatoria', false); return }
    if (form.rol === 'EMPLEADO' && !form.caseta_id) { showMsg('El empleado necesita una caseta asignada', false); return }
    setSaving(true)
    try {
      if (editId) {
        const cambios = { nombre: form.nombre, rol: form.rol, caseta_id: form.caseta_id || null }
        await updatePerfil(editId, cambios)
        setPerfiles(prev => prev.map(p => p.id === editId
          ? { ...p, ...cambios, casetas: casetas.find(c => c.id === form.caseta_id) }
          : p
        ))
        showMsg('Usuario actualizado correctamente ✓')
      } else {
        const nuevo = await crearUsuario(form)
        setPerfiles(prev => [...prev, {
          ...nuevo,
          activo: true,
          casetas: casetas.find(c => c.id === nuevo.caseta_id),
        }])
        showMsg('Usuario creado correctamente ✓')
      }
      setForm(F0); setEditId(null)
    } catch (e) {
      showMsg(e.message, false)
    } finally {
      setSaving(false)
    }
  }

  const toggleActivo = async (id, activo) => {
    await updatePerfil(id, { activo: !activo })
    setPerfiles(prev => prev.map(p => p.id === id ? { ...p, activo: !activo } : p))
    showToast(activo ? 'Usuario desactivado' : 'Usuario activado')
  }

  const editar = p => {
    setForm({ nombre: p.nombre, email: p.email || '', password: '', rol: p.rol, caseta_id: p.caseta_id || '' })
    setEditId(p.id)
  }

  const cancelar = () => { setEditId(null); setForm(F0); setMsg(null) }

  if (loading) return <div className="loading-row"><div className="spin-sm" />Cargando...</div>

  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="stit">{editId ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}</div>

      {msg && <div className={msg.ok ? 'ok-box' : 'err-box'}>{msg.txt}</div>}

      <div className="iform">
        <div className="frow">
          <div className="fg">
            <label>Nombre completo</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="María García" />
          </div>
          {!editId && (
            <div className="fg">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="maria@lapetarderia.es" />
            </div>
          )}
          {!editId && (
            <div className="fg">
              <label>Contraseña</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
            </div>
          )}
          <div className="fg">
            <label>Rol</label>
            <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value, caseta_id: e.target.value === 'ADMIN' ? '' : form.caseta_id })}>
              <option value="EMPLEADO">Empleado — acceso solo al TPV</option>
              <option value="ADMIN">Administrador — acceso completo</option>
            </select>
          </div>
          {form.rol === 'EMPLEADO' && (
            <div className="fg">
              <label>Caseta asignada</label>
              <select value={form.caseta_id} onChange={e => setForm({ ...form, caseta_id: e.target.value })}>
                <option value="">-- Seleccionar caseta --</option>
                {casetas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <button className="btn-add" onClick={guardar} disabled={saving}>
            {saving ? 'Guardando...' : editId ? 'Guardar cambios' : 'Crear usuario'}
          </button>
          {editId && <button className="btn-s" style={{ width: 'auto', marginTop: 0 }} onClick={cancelar}>Cancelar</button>}
        </div>
      </div>

      <div className="stit">Usuarios del sistema ({perfiles.length})</div>
      <div className="tw">
        <table>
          <thead><tr><th>Nombre</th><th>Rol</th><th>Caseta</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {perfiles.map(p => (
              <tr key={p.id} style={{ opacity: p.activo ? 1 : .5 }}>
                <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                <td><span className={`chip ${p.rol === 'ADMIN' ? 'cy' : 'cb2'}`}>{p.rol}</span></td>
                <td style={{ color: 'var(--tx2)' }}>{p.casetas?.nombre || '— Global —'}</td>
                <td><span className={`chip ${p.activo ? 'cg' : 'cr'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div className="acell">
                    <button className="btn-edit" onClick={() => editar(p)}>Editar</button>
                    <button className="btn-tog" style={{ color: p.activo ? 'var(--gold)' : 'var(--green)' }}
                      onClick={() => toggleActivo(p.id, p.activo)}>
                      {p.activo ? 'Desact.' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── ADMIN PANEL ─────────────────────────────────────────────
export default function AdminPanel({ perfil, casetas }) {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">💥 La Petardería TPV</div>
        <div className="ti">
          <span style={{ fontSize: '.8rem', color: 'var(--tx2)' }}>{perfil.nombre}</span>
          <span className="badge ba">Admin</span>
          <button className="btn-o" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="navtabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={`ntab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="cnt">
        {tab === 'dashboard' && <Dashboard casetas={casetas} />}
        {tab === 'productos' && <GestionProductos casetas={casetas} />}
        {tab === 'ofertas'   && <GestionOfertas />}
        {tab === 'usuarios'  && <GestionUsuarios casetas={casetas} />}
      </div>
    </div>
  )
}
