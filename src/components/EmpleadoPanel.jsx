import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  getProductos, getStockCaseta, getOfertas,
  getCajaAbierta, abrirCaja, cerrarCaja,
  getResumenCaja, crearTicket,
} from '../lib/api.js'
import { calcularPrecio, calcularTotalTicket, fmt } from '../lib/precios.js'
import Scanner from './Scanner.jsx'

const CATS = ['Todos','Petardos','Truenos','Bengalas','Cracker','Terrestres','Fuentes','Efectos','Packs','Accesorios']

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880; o.type = 'sine'
    g.gain.setValueAtTime(0.3, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.18)
  } catch (e) {}
}

// ─── TOAST ───────────────────────────────────────────────────
function Toast({ msg, type }) {
  return (
    <div className="twrap">
      <div className={`toast ${type === 'error' ? 'te2' : 'tok'}`}>{msg}</div>
    </div>
  )
}

// ─── TICKET ITEM ─────────────────────────────────────────────
function TicketItem({ item, ofertas, onQty, onDel }) {
  const [open, setOpen] = useState(false)
  const { total, desglose } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas)
  const hayOferta = !!desglose

  return (
    <div className="titem">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tin">{item.nombre}</div>
        <div className="tc">
          <button className="qb" onClick={() => onQty(item.id, -1)}>−</button>
          <span className="qd">{item.cantidad}</span>
          <button className="qb" onClick={() => onQty(item.id, +1)}>+</button>
          {hayOferta && (
            <span className="ob" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
              OFERTA {open ? '▲' : '▼'}
            </span>
          )}
          <div className="tp2">
            <div className="tpu">{hayOferta ? 'con oferta' : `${fmt(item.precio)}/u.`}</div>
            <div className="tpt">{fmt(total)}</div>
          </div>
        </div>
        {hayOferta && open && (
          <div className="dsg">
            {desglose.map((d, i) => (
              <div key={i} className={`drow ${d.tipo === 'pack' ? 'pk' : 'nm'}`}>
                <span>
                  {d.tipo === 'pack'
                    ? `${d.packs}× pack ${d.etiqueta} = ${d.unidades}u. a ${fmt(d.precioU)}/u.`
                    : `${d.unidades}u. precio normal (${fmt(d.precioU)}/u.)`}
                </span>
                <span>{fmt(d.coste)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Botón eliminar */}
      <button
        onClick={() => onDel(item.id)}
        style={{
          flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
          color: 'var(--red)', fontSize: '.95rem', cursor: 'pointer',
          transition: 'all .2s', alignSelf: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.28)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,.1)' }}
      >✕</button>
    </div>
  )
}

// ─── MODAL PAGO ──────────────────────────────────────────────
function ModalPago({ total, onConfirm, onClose }) {
  const [metodo, setMetodo]     = useState('')
  const [recibido, setRecibido] = useState('')
  const [loading, setLoading]   = useState(false)
  const cambio = metodo === 'efectivo' ? Math.max(0, (parseFloat(recibido) || 0) - total) : 0
  const puedeConfirmar = metodo && (metodo === 'tarjeta' || (parseFloat(recibido) || 0) >= total)

  const confirmar = async () => {
    setLoading(true)
    await onConfirm({ metodo, dineroDado: parseFloat(recibido) || total, cambio })
    setLoading(false)
  }

  return (
    <div className="mo">
      <div className="mc">
        <div className="mt-modal">Finalizar Venta</div>
        <div style={{ fontSize: '.83rem', color: 'var(--tx2)', marginBottom: 8 }}>Total a cobrar:</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.8rem', color: 'var(--ac)', marginBottom: 16 }}>{fmt(total)}</div>

        <div style={{ fontSize: '.75rem', color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Método de pago</div>
        <div className="mg2">
          <div className={`mb ${metodo === 'efectivo' ? 'on' : ''}`} onClick={() => setMetodo('efectivo')}>
            <div className="mi2">💵</div><div className="ml">Efectivo</div>
          </div>
          <div className={`mb ${metodo === 'tarjeta' ? 'on' : ''}`} onClick={() => setMetodo('tarjeta')}>
            <div className="mi2">💳</div><div className="ml">Tarjeta</div>
          </div>
        </div>

        {metodo === 'efectivo' && (
          <>
            <div className="fg">
              <label>Dinero recibido</label>
              <input type="number" className="bi" style={{ fontSize: '1.5rem', marginBottom: 0 }}
                value={recibido} onChange={e => setRecibido(e.target.value)}
                placeholder="0,00" autoFocus min={total} step=".5" inputMode="decimal" />
            </div>
            <div className="cbox">
              <div className="clbl">Cambio a devolver</div>
              <div className="camt">{fmt(cambio)}</div>
            </div>
          </>
        )}

        <button className="btn-p" disabled={!puedeConfirmar || loading} onClick={confirmar}>
          {loading ? 'Procesando...' : '✓ Confirmar Venta'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL CIERRE CAJA ────────────────────────────────────────
function ModalCierreCaja({ caja, caseta, ventas, perfil, onClose, onCerrar }) {
  const [contado, setContado] = useState('')
  const [loading, setLoading] = useState(false)

  const totalEfectivo = ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + v.total, 0)
  const totalTarjeta  = ventas.filter(v => v.metodo_pago === 'tarjeta').reduce((s, v) => s + v.total, 0)
  const esperado      = (caja.apertura_dinero || 0) + totalEfectivo
  const diferencia    = (parseFloat(contado) || 0) - esperado

  // Agrupar por empleado
  const porEmpleado = {}
  ventas.forEach(v => {
    const nombre = v.perfiles?.nombre || 'Desconocido'
    if (!porEmpleado[nombre]) porEmpleado[nombre] = { efectivo: 0, tarjeta: 0, tickets: 0 }
    porEmpleado[nombre].tickets++
    if (v.metodo_pago === 'efectivo') porEmpleado[nombre].efectivo += v.total
    else porEmpleado[nombre].tarjeta += v.total
  })

  const confirmar = async () => {
    setLoading(true)
    await onCerrar(parseFloat(contado) || 0)
    setLoading(false)
  }

  return (
    <div className="mo">
      <div className="mc wide">
        <div className="mt-modal">🏦 Cierre de Caja</div>

        <div style={{ background: 'rgba(245,200,66,.06)', border: '1px solid rgba(245,200,66,.2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14, fontSize: '.8rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 3 }}>{caseta}</div>
          <div style={{ color: 'var(--tx2)' }}>Abierta por <strong style={{ color: 'var(--tx)' }}>{caja.perfiles?.nombre}</strong></div>
        </div>

        {/* Desglose por empleado si hay más de uno */}
        {Object.keys(porEmpleado).length > 1 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '.73rem', color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 7 }}>Desglose por empleado</div>
            <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', overflow: 'hidden' }}>
              {Object.entries(porEmpleado).map(([nombre, d], i, arr) => (
                <div key={nombre} style={{ padding: '9px 12px', borderBottom: i < arr.length - 1 ? '1px solid var(--bd)' : 'none', fontSize: '.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600 }}>{nombre}</span>
                    <span style={{ fontWeight: 700, color: 'var(--ac)' }}>{fmt(d.efectivo + d.tarjeta)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, color: 'var(--tx2)', fontSize: '.74rem' }}>
                    <span>💵 {fmt(d.efectivo)}</span>
                    <span>💳 {fmt(d.tarjeta)}</span>
                    <span>{d.tickets} tickets</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totales */}
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: 13, marginBottom: 16, fontSize: '.83rem' }}>
          {[
            ['Apertura de caja',  fmt(caja.apertura_dinero || 0), 'var(--tx)'],
            ['Ventas efectivo',   `+${fmt(totalEfectivo)}`,       'var(--green)'],
            ['Ventas tarjeta',    fmt(totalTarjeta),               'var(--blue)'],
            ['Total tickets',     String(ventas.length),           'var(--tx)'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bd)' }}>
              <span style={{ color: 'var(--tx2)' }}>{label}</span>
              <span style={{ color, fontWeight: 600 }}>{val}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontWeight: 700 }}>
            <span>Esperado en caja</span>
            <span style={{ color: 'var(--ac)' }}>{fmt(esperado)}</span>
          </div>
        </div>

        <div className="fg">
          <label>Dinero contado físicamente</label>
          <input type="number" className="bi" style={{ fontSize: '1.4rem', marginBottom: 0 }}
            value={contado} onChange={e => setContado(e.target.value)}
            placeholder="0,00" min="0" step=".01" autoFocus inputMode="decimal" />
        </div>

        {contado && (
          <div className="cbox">
            <div className="clbl">{diferencia >= 0 ? 'Sobra en caja' : 'Falta en caja'}</div>
            <div className="camt" style={{ color: diferencia < 0 ? 'var(--red)' : 'var(--green)' }}>
              {diferencia >= 0 ? '+' : ''}{fmt(Math.abs(diferencia))}
            </div>
          </div>
        )}

        <button className="btn-p" onClick={confirmar} disabled={loading}>
          {loading ? 'Cerrando...' : 'Confirmar cierre de caja'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── EMPLEADO PANEL ───────────────────────────────────────────
export default function EmpleadoPanel({ perfil, casetas }) {
  const caseta = casetas.find(c => c.id === perfil.caseta_id)

  const [productos,  setProductos]  = useState([])
  const [stock,      setStock]      = useState({})
  const [ofertas,    setOfertas]    = useState([])
  const [caja,       setCaja]       = useState(null)
  const [ventas,     setVentas]     = useState([])
  const [loading,    setLoading]    = useState(true)

  const [ticket,     setTicket]     = useState([])
  const [busq,       setBusq]       = useState('')
  const [cat,        setCat]        = useState('Todos')
  const [showScan,   setShowScan]   = useState(false)
  const [showPago,   setShowPago]   = useState(false)
  const [showCierre, setShowCierre] = useState(false)
  const [showOk,     setShowOk]     = useState(null)
  const [toast,      setToast]      = useState(null)
  const [apertura,   setApertura]   = useState('')

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  // Cargar datos iniciales
  useEffect(() => {
    if (!caseta) return
    Promise.all([
      getProductos(),
      getStockCaseta(caseta.id),
      getOfertas(),
      getCajaAbierta(caseta.id),
    ]).then(([prods, stk, ofs, cajaAbierta]) => {
      setProductos(prods)
      setStock(stk)
      setOfertas(ofs)
      if (cajaAbierta) {
        setCaja(cajaAbierta)
        // Cargar ventas del turno
        getResumenCaja(cajaAbierta.id).then(setVentas)
      }
    }).finally(() => setLoading(false))
  }, [caseta?.id])

  // Subscripción realtime al stock para actualizaciones concurrentes
  useEffect(() => {
    if (!caseta) return
    const channel = supabase
      .channel(`stock-${caseta.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'stock',
        filter: `caseta_id=eq.${caseta.id}`,
      }, payload => {
        setStock(prev => ({ ...prev, [payload.new.producto_id]: payload.new.cantidad }))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [caseta?.id])

  const handleAbrirCaja = async () => {
    try {
      const c = await abrirCaja(caseta.id, perfil.id, parseFloat(apertura) || 0)
      setCaja(c)
      setVentas([])
    } catch (e) {
      showToast('Error abriendo caja: ' + e.message, 'error')
    }
  }

  const agregar = useCallback((prod) => {
    const stockDisp = stock[prod.id] ?? 0
    if (stockDisp <= 0) { showToast('Sin stock disponible', 'error'); return }
    setTicket(prev => {
      const idx = prev.findIndex(i => i.id === prod.id)
      if (idx >= 0) {
        if (prev[idx].cantidad >= stockDisp) { showToast('Stock insuficiente', 'error'); return prev }
        const n = [...prev]; n[idx] = { ...n[idx], cantidad: n[idx].cantidad + 1 }; return n
      }
      return [...prev, { ...prod, cantidad: 1 }]
    })
    setShowScan(false)
  }, [stock])

  const cambiarQty = (id, delta) => setTicket(prev => prev.map(i => {
    if (i.id !== id) return i
    const q = i.cantidad + delta
    if (q <= 0) return null
    if (q > (stock[i.id] ?? 0)) { showToast('Stock insuficiente', 'error'); return i }
    return { ...i, cantidad: q }
  }).filter(Boolean))

  const total = calcularTotalTicket(ticket, ofertas)

  const confirmarVenta = async ({ metodo, dineroDado, cambio }) => {
    try {
      const items = ticket.map(item => {
        const { total: totalLinea, desglose } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas)
        const conOferta = !!desglose
        const detalleOferta = desglose
          ? desglose.map(d => d.tipo === 'pack'
              ? `${d.packs}x pack ${d.etiqueta}`
              : `${d.unidades}u normal`).join(' + ')
          : null
        return {
          producto_id:     item.id,
          nombre:          item.nombre,
          precio_unitario: item.precio,
          cantidad:        item.cantidad,
          total_linea:     totalLinea,
          con_oferta:      conOferta,
          detalle_oferta:  detalleOferta,
        }
      })

      await crearTicket({
        cajaId:     caja.id,
        casetaId:   caseta.id,
        empleadoId: perfil.id,
        metodoPago: metodo,
        total,
        dineroDado,
        cambio,
        items,
      })

      // Actualizar stock local optimistamente
      setStock(prev => {
        const next = { ...prev }
        ticket.forEach(i => { if (next[i.id] !== undefined) next[i.id] -= i.cantidad })
        return next
      })

      // Actualizar resumen de caja local
      setVentas(prev => [...prev, { metodo_pago: metodo, total, perfiles: { nombre: perfil.nombre } }])

      setShowOk({ metodo, total, cambio, empleado: perfil.nombre })
      setTicket([])
      setShowPago(false)
    } catch (e) {
      showToast('Error al guardar venta: ' + e.message, 'error')
    }
  }

  const confirmarCierre = async (contado) => {
    try {
      await cerrarCaja(caja.id, perfil.id, contado)
      setCaja(null)
      setVentas([])
      setTicket([])
      setShowCierre(false)
    } catch (e) {
      showToast('Error cerrando caja: ' + e.message, 'error')
    }
  }

  const prodsFiltrados = productos.filter(p => {
    if (cat !== 'Todos' && p.categoria !== cat) return false
    if (busq && !p.nombre.toLowerCase().includes(busq.toLowerCase()) && !p.codigo_ean?.includes(busq)) return false
    return true
  })

  const eaBadge = p => {
    if (p.edad_minima === 0)  return <span className="pea et1">T1</span>
    if (p.edad_minima === 12) return <span className="pea e12">12+</span>
    if (p.edad_minima === 16) return <span className="pea e16">16+</span>
    return <span className="pea e18">18+</span>
  }

  if (loading) return (
    <div className="splash">
      <div className="spinner" />
      <div style={{ color: 'var(--tx2)', fontSize: '.85rem', marginTop: 8 }}>Cargando...</div>
    </div>
  )

  // ── Pantalla apertura caja ──────────────────────────────────
  if (!caja) {
    return (
      <div className="app">
        <div className="topbar">
          <div className="tl">💥 La Petardería</div>
          <div className="ti">
            <span style={{ fontSize: '.8rem', color: 'var(--tx2)' }}>{caseta?.nombre}</span>
            <span className="badge be">Empleado</span>
            <button className="btn-o" onClick={() => supabase.auth.signOut()}>Salir</button>
          </div>
        </div>
        <div className="apw">
          <div className="apc">
            <div className="apt">Apertura de Caja</div>
            <div className="aps">Hola <strong>{perfil.nombre}</strong></div>
            <div className="aps" style={{ marginBottom: 20 }}>
              {caseta?.nombre}<br />
              <span style={{ fontSize: '.77rem', color: 'var(--tx2)' }}>
                Introduce el efectivo inicial del turno. Si un compañero ya abrió la caja, pulsa sin cambiar nada.
              </span>
            </div>
            <input className="bi" type="number" placeholder="0,00" value={apertura}
              onChange={e => setApertura(e.target.value)} min="0" step="0.01" inputMode="decimal" />
            <button className="btn-p" onClick={handleAbrirCaja}>Abrir caja y comenzar</button>
          </div>
        </div>
      </div>
    )
  }

  // ── TPV ────────────────────────────────────────────────────
  const totalCajaTurno = ventas.reduce((s, v) => s + v.total, 0)

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">💥 La Petardería</div>
        <div className="ti">
          <span style={{ fontSize: '.79rem', color: 'var(--tx2)' }}>{caseta?.nombre}</span>
          <span className="badge be">Empleado</span>
          <button className="btn-o" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>

      {/* Subbar con info de caja */}
      <div style={{ padding: '8px 20px', background: 'var(--s1)', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: '.78rem' }}>
        <span style={{ color: 'var(--tx2)' }}>Turno abierto por <strong style={{ color: 'var(--tx)' }}>{caja.perfiles?.nombre}</strong></span>
        <span style={{ color: 'var(--tx2)' }}>|</span>
        <span style={{ color: 'var(--tx2)' }}>Tickets: <strong style={{ color: 'var(--green)' }}>{ventas.length}</strong></span>
        <span style={{ color: 'var(--tx2)' }}>Total turno: <strong style={{ color: 'var(--ac)' }}>{fmt(totalCajaTurno)}</strong></span>
        <button className="btn-o" style={{ marginLeft: 'auto' }} onClick={() => setShowCierre(true)}>Cerrar Caja</button>
      </div>

      <div className="cnt">
        <div className="tpvg">
          {/* Panel productos */}
          <div className="pp">
            <div className="srch">
              <input className="si" placeholder="Buscar producto o código EAN..."
                value={busq} onChange={e => setBusq(e.target.value)} />
              <button className="bsc" onClick={() => setShowScan(true)}>📷</button>
            </div>
            <div className="catbar">
              {CATS.map(c => (
                <button key={c} className={`ct ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
            <div className="pg">
              {prodsFiltrados.map(p => {
                const stockDisp = stock[p.id] ?? 0
                const enT = ticket.find(i => i.id === p.id)
                const tieneOferta = ofertas.some(o => o.producto_id === p.id)
                return (
                  <div
                    key={p.id} className="pc"
                    onClick={() => agregar(p)}
                    style={{ opacity: stockDisp === 0 ? .4 : 1, outline: enT ? '2px solid var(--ac)' : 'none' }}
                  >
                    {eaBadge(p)}
                    <div className="pn">{p.nombre}</div>
                    <div className="pp2">{fmt(p.precio)}</div>
                    <div className="pst">
                      {stockDisp === 0 ? 'Agotado' : `Stock: ${stockDisp}`}
                      {enT && <span style={{ color: 'var(--green)' }}> · {enT.cantidad}</span>}
                    </div>
                    {tieneOferta && <span className="ocbadge">OFERTA</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Panel ticket */}
          <div className="tp">
            <div className="th">
              <div className="tt">🧾 Ticket</div>
              <div className="tm">{perfil.nombre} · {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div className="tis">
              {ticket.length === 0
                ? <div className="te"><span style={{ fontSize: '2rem', opacity: .4 }}>🛒</span><span>Ticket vacío</span></div>
                : ticket.map(item => (
                  <TicketItem key={item.id} item={item} ofertas={ofertas} onQty={cambiarQty} onDel={id => setTicket(p => p.filter(i => i.id !== id))} />
                ))
              }
            </div>
            <div className="tf">
              <div className="tsb"><span>Artículos</span><span>{ticket.reduce((s, i) => s + i.cantidad, 0)}</span></div>
              <div className="ttr">
                <span className="ttl">TOTAL</span>
                <span className="tta">{fmt(total)}</span>
              </div>
              <button className="bfin" disabled={ticket.length === 0} onClick={() => setShowPago(true)}>
                Finalizar Venta →
              </button>
              {ticket.length > 0 && (
                <button className="bclr" onClick={() => setTicket([])}>✕ Limpiar ticket</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showScan && <Scanner onDetect={agregar} onClose={() => setShowScan(false)} />}
      {showPago && <ModalPago total={total} onConfirm={confirmarVenta} onClose={() => setShowPago(false)} />}
      {showCierre && (
        <ModalCierreCaja
          caja={caja} caseta={caseta?.nombre} ventas={ventas} perfil={perfil}
          onClose={() => setShowCierre(false)} onCerrar={confirmarCierre}
        />
      )}

      {showOk && (
        <div className="mo">
          <div className="mc" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.8rem', color: 'var(--green)', marginBottom: 6 }}>
              ¡Venta Confirmada!
            </div>
            <div style={{ fontSize: '.84rem', color: 'var(--tx2)', lineHeight: 1.65 }}>
              Total: <strong style={{ color: 'var(--tx)' }}>{fmt(showOk.total)}</strong><br />
              {showOk.metodo === 'efectivo' ? `Efectivo · Cambio: ${fmt(showOk.cambio)}` : '💳 Tarjeta'}
            </div>
            <button className="btn-p" style={{ marginTop: 22 }} onClick={() => setShowOk(null)}>
              Nueva Venta
            </button>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
