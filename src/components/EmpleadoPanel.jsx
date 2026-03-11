import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  getProductos, getStockCaseta, getOfertas,
  getCajaAbierta, abrirCaja, cerrarCaja,
  getResumenCaja, crearTicket, getTicketsTurno, deleteTicket,
  getFavoritos, toggleFavorito,
} from '../lib/api.js'
import { calcularPrecio, calcularTotalTicket, detectarOfertasCombinadas, fmt } from '../lib/precios.js'
import Scanner from './Scanner.jsx'

function Toast({ msg, type }) {
  return <div className="twrap"><div className={`toast ${type === 'error' ? 'te2' : 'tok'}`}>{msg}</div></div>
}

// Hook long press — funciona en móvil (touch) y escritorio (mouse)
// tap rápido → onTap / pulsación larga → onLong
function useLongPress(onTap, onLong, ms = 500) {
  const timer = useRef(null)
  const fired = useRef(false)

  const start = (e) => {
    // Ignorar si el click es sobre un botón hijo (ej. estrella favorito)
    if (e.target.tagName === 'BUTTON') return
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      onLong()
    }, ms)
  }

  const cancel = () => {
    clearTimeout(timer.current)
  }

  const end = (e) => {
    if (e.target.tagName === 'BUTTON') return
    clearTimeout(timer.current)
    if (!fired.current) onTap()
  }

  return {
    onMouseDown:  start,
    onMouseUp:    end,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd:   end,
    onContextMenu: (e) => e.preventDefault(), // evitar menú nativo en móvil al pulsar largo
  }
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
      <button onClick={() => onDel(item.id)} style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
        color: 'var(--red)', fontSize: '.95rem', cursor: 'pointer', transition: 'all .2s', alignSelf: 'center',
      }}>✕</button>
    </div>
  )
}

// ─── MODAL CANTIDAD AL AÑADIR ─────────────────────────────────
function ModalCantidad({ producto, stockDisp, ofertas, onConfirm, onClose }) {
  const [qty, setQty] = useState(1)
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.select(), 50) }, [])
  const { total, desglose } = calcularPrecio(producto.id, qty, producto.precio, ofertas)
  const hayOferta = !!desglose

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc">
        <div className="mt-modal">Añadir al ticket</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>{producto.nombre}</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 16 }}>
          {fmt(producto.precio)}/u. · Stock: {stockDisp}
        </div>

        {/* Teclado rápido */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
          {[1,2,3,4,5,6,8,10,15,20].map(n => (
            <button key={n} onClick={() => setQty(n)} style={{
              padding: '8px 4px', borderRadius: 'var(--rs)',
              background: qty === n ? 'var(--ac)' : 'var(--s2)',
              border: '1px solid', borderColor: qty === n ? 'var(--ac)' : 'var(--bd)',
              color: qty === n ? 'white' : 'var(--tx)', fontWeight: 700,
              cursor: 'pointer', fontSize: '.9rem', fontFamily: "'DM Sans',sans-serif",
            }}>{n}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button className="qb" style={{ width: 38, height: 38 }} onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
          <input ref={inputRef} type="number" min="1" max={stockDisp} value={qty}
            onChange={e => setQty(Math.max(1, Math.min(stockDisp, parseInt(e.target.value) || 1)))}
            onKeyDown={e => e.key === 'Enter' && onConfirm(qty)}
            style={{ flex: 1, background: 'var(--s2)', border: '2px solid var(--ac)', borderRadius: 'var(--rs)', padding: '10px', color: 'var(--tx)', fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: "'DM Sans',sans-serif" }}
            inputMode="numeric" />
          <button className="qb" style={{ width: 38, height: 38 }} onClick={() => setQty(q => Math.min(stockDisp, q + 1))}>+</button>
        </div>

        {/* Preview precio */}
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
            <span style={{ color: 'var(--tx2)' }}>{qty} × {fmt(producto.precio)}</span>
            {hayOferta
              ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>Con oferta: {fmt(total)}</span>
              : <span style={{ fontWeight: 700 }}>{fmt(total)}</span>}
          </div>
          {hayOferta && desglose.map((d, i) => (
            <div key={i} style={{ fontSize: '.72rem', color: d.tipo === 'pack' ? 'var(--green)' : 'var(--tx2)', marginTop: 3 }}>
              {d.tipo === 'pack' ? `✓ Pack ${d.etiqueta}` : `+ ${d.unidades}u. normal`}
            </div>
          ))}
        </div>

        <button className="btn-p" onClick={() => onConfirm(qty)}>
          Añadir {qty} unidad{qty !== 1 ? 'es' : ''} · {fmt(total)}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL PAGO ──────────────────────────────────────────────
function ModalPago({ total, onConfirm, onClose, modoRapido, onToggleModoRapido }) {
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

        {/* Toggle modo rápido */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', marginBottom: 4 }}>
          <div onClick={onToggleModoRapido} style={{
            width: 40, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'all .2s',
            background: modoRapido ? 'var(--green)' : 'var(--s3)', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 3, left: modoRapido ? 21 : 3,
              width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .2s',
            }} />
          </div>
          <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
            Venta rápida — nuevo ticket automático tras cobrar
          </span>
        </div>

        <button className="btn-p" disabled={!puedeConfirmar || loading} onClick={confirmar}>
          {loading ? 'Procesando...' : '✓ Confirmar Venta'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL CIERRE CAJA ────────────────────────────────────────
function ModalCierreCaja({ caja, caseta, ventas, onClose, onCerrar }) {
  const [contado, setContado] = useState('')
  const [loading, setLoading] = useState(false)

  const totalEfectivo = ventas.filter(v => v.metodo_pago === 'efectivo').reduce((s, v) => s + v.total, 0)
  const totalTarjeta  = ventas.filter(v => v.metodo_pago === 'tarjeta').reduce((s, v) => s + v.total, 0)
  const esperado      = (caja.apertura_dinero || 0) + totalEfectivo
  const diferencia    = (parseFloat(contado) || 0) - esperado

  const porEmpleado = {}
  ventas.forEach(v => {
    const nombre = v.perfiles?.nombre || 'Desconocido'
    if (!porEmpleado[nombre]) porEmpleado[nombre] = { efectivo: 0, tarjeta: 0, tickets: 0 }
    porEmpleado[nombre].tickets++
    if (v.metodo_pago === 'efectivo') porEmpleado[nombre].efectivo += v.total
    else porEmpleado[nombre].tarjeta += v.total
  })

  return (
    <div className="mo">
      <div className="mc wide">
        <div className="mt-modal">🏦 Cierre de Caja</div>
        <div style={{ background: 'rgba(245,200,66,.06)', border: '1px solid rgba(245,200,66,.2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14, fontSize: '.8rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--gold)', marginBottom: 3 }}>{caseta}</div>
          <div style={{ color: 'var(--tx2)' }}>Abierta por <strong style={{ color: 'var(--tx)' }}>{caja.perfiles?.nombre}</strong></div>
        </div>

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

        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: 13, marginBottom: 16, fontSize: '.83rem' }}>
          {[
            ['Apertura', fmt(caja.apertura_dinero || 0), 'var(--tx)'],
            ['Ventas efectivo', `+${fmt(totalEfectivo)}`, 'var(--green)'],
            ['Ventas tarjeta', fmt(totalTarjeta), 'var(--blue)'],
            ['Total tickets', String(ventas.length), 'var(--tx)'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bd)' }}>
              <span style={{ color: 'var(--tx2)' }}>{l}</span>
              <span style={{ color: c, fontWeight: 600 }}>{v}</span>
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

        <button className="btn-p" onClick={async () => { setLoading(true); await onCerrar(parseFloat(contado)||0); setLoading(false) }} disabled={loading}>
          {loading ? 'Cerrando...' : 'Confirmar cierre de caja'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL HISTORIAL TICKETS ─────────────────────────────────
function ModalHistorial({ cajaId, perfil, onClose }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    getTicketsTurno(cajaId).then(setTickets).finally(() => setLoading(false))
  }, [cajaId])

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este ticket? El stock NO se restaura automáticamente.')) return
    await deleteTicket(id)
    setTickets(prev => prev.filter(t => t.id !== id))
  }

  const totalTurno = tickets.reduce((s, t) => s + t.total, 0)

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc wide" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mt-modal">🧾 Tickets del turno</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 12 }}>
          {tickets.length} tickets · Total: <strong style={{ color: 'var(--ac)' }}>{fmt(totalTurno)}</strong>
        </div>
        {loading
          ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
          : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {tickets.length === 0
                ? <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 30 }}>Sin tickets en este turno</div>
                : tickets.map(t => (
                  <div key={t.id} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                          {new Date(t.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{t.perfiles?.nombre}
                          {' · '}{t.metodo_pago === 'efectivo' ? '💵' : '💳'}
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--ac)', fontSize: '1rem' }}>{fmt(t.total)}</div>
                      </div>
                      <button className="btn-o" style={{ fontSize: '.73rem' }} onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                        {expanded === t.id ? 'Ocultar' : 'Ver'}
                      </button>
                      <button className="btn-del" onClick={() => eliminar(t.id)}>Eliminar</button>
                    </div>
                    {expanded === t.id && t.ticket_items && (
                      <div style={{ marginTop: 8, borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
                        {t.ticket_items.map((li, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', padding: '2px 0', color: 'var(--tx2)' }}>
                            <span>{li.nombre_producto} × {li.cantidad}</span>
                            <span>{fmt(li.total_linea)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          )
        }
        <button className="btn-s" style={{ marginTop: 12 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

// ─── TARJETA PRODUCTO ────────────────────────────────────────
function TarjetaProducto({ p, stockDisp, enT, tieneOferta, esFav, onTap, onLong, onFav, eaBadge }) {
  const lp = useLongPress(onTap, onLong)
  return (
    <div
      className="pc"
      {...lp}
      style={{ opacity: stockDisp === 0 ? .4 : 1, outline: enT ? '2px solid var(--ac)' : 'none', userSelect: 'none' }}
    >
      {eaBadge(p)}
      <button onClick={e => onFav(e, p.id)} style={{
        position: 'absolute', top: 6, left: 6, background: 'transparent', border: 'none',
        cursor: 'pointer', fontSize: '.8rem', opacity: esFav ? 1 : .25, padding: 0, lineHeight: 1,
      }}>⭐</button>
      <div className="pn" style={{ paddingLeft: 14 }}>{p.nombre}</div>
      <div className="pp2">{fmt(p.precio)}</div>
      <div className="pst">
        {stockDisp === 0 ? 'Agotado' : `Stock: ${stockDisp}`}
        {enT && <span style={{ color: 'var(--green)' }}> · {enT.cantidad}</span>}
      </div>
      {tieneOferta && <span className="ocbadge">OFERTA</span>}
    </div>
  )
}
export default function EmpleadoPanel({ perfil, casetas }) {
  const caseta = casetas.find(c => c.id === perfil.caseta_id)

  const [productos,     setProductos]     = useState([])
  const [stock,         setStock]         = useState({})
  const [ofertas,       setOfertas]       = useState([])
  const [caja,          setCaja]          = useState(null)
  const [ventas,        setVentas]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [ticket,        setTicket]        = useState([])
  const [busq,          setBusq]          = useState('')
  const [cat,           setCat]           = useState('Todos')
  const [showScan,      setShowScan]      = useState(false)
  const [showPago,      setShowPago]      = useState(false)
  const [showCierre,    setShowCierre]    = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const [showOk,        setShowOk]        = useState(null)
  const [toast,         setToast]         = useState(null)
  const [apertura,      setApertura]      = useState('')
  const [modoRapido,    setModoRapido]    = useState(false)
  const [favoritos,     setFavoritos]     = useState(() => getFavoritos())
  const [tabTPV,        setTabTPV]        = useState('todos') // todos | favoritos
  const [prodModal,     setProdModal]     = useState(null)   // producto para modal cantidad

  const showToast = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800) }

  // Categorías dinámicas del catálogo
  const CATS = ['Todos', ...new Set(productos.map(p => p.categoria))].filter(Boolean)

  useEffect(() => {
    if (!caseta) return
    Promise.all([
      getProductos(), getStockCaseta(caseta.id),
      getOfertas(), getCajaAbierta(caseta.id),
    ]).then(([prods, stk, ofs, cajaAbierta]) => {
      setProductos(prods); setStock(stk); setOfertas(ofs)
      if (cajaAbierta) { setCaja(cajaAbierta); getResumenCaja(cajaAbierta.id).then(setVentas) }
    }).finally(() => setLoading(false))
  }, [caseta?.id])

  // Realtime stock
  useEffect(() => {
    if (!caseta) return
    const ch = supabase.channel(`stock-${caseta.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock', filter: `caseta_id=eq.${caseta.id}` },
        payload => setStock(prev => ({ ...prev, [payload.new.producto_id]: payload.new.cantidad })))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [caseta?.id])

  const handleAbrirCaja = async () => {
    try {
      const c = await abrirCaja(caseta.id, perfil.id, parseFloat(apertura) || 0)
      setCaja(c); setVentas([])
    } catch (e) { showToast('Error: ' + e.message, 'error') }
  }

  // Click en producto: si tiene stock y se hace click largo → modal cantidad, click normal → +1
  const agregar = useCallback((prod, cantidad = 1) => {
    const stockDisp = stock[prod.id] ?? 0
    if (stockDisp <= 0) { showToast('Sin stock disponible', 'error'); return }
    setTicket(prev => {
      const idx = prev.findIndex(i => i.id === prod.id)
      if (idx >= 0) {
        const nuevaCant = prev[idx].cantidad + cantidad
        if (nuevaCant > stockDisp) { showToast('Stock insuficiente', 'error'); return prev }
        const n = [...prev]; n[idx] = { ...n[idx], cantidad: nuevaCant }; return n
      }
      return [...prev, { ...prod, cantidad }]
    })
    setShowScan(false)
  }, [stock])

  const abrirModalCantidad = (prod) => {
    const stockDisp = stock[prod.id] ?? 0
    if (stockDisp <= 0) { showToast('Sin stock disponible', 'error'); return }
    setProdModal(prod)
  }

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
        return {
          producto_id: item.id, nombre: item.nombre, precio_unitario: item.precio,
          cantidad: item.cantidad, total_linea: totalLinea,
          con_oferta: !!desglose,
          detalle_oferta: desglose ? desglose.map(d => d.tipo === 'pack' ? `${d.packs}x ${d.etiqueta}` : `${d.unidades}u normal`).join(' + ') : null,
        }
      })
      await crearTicket({ cajaId: caja.id, casetaId: caseta.id, empleadoId: perfil.id, metodoPago: metodo, total, dineroDado, cambio, items })

      setStock(prev => {
        const next = { ...prev }
        ticket.forEach(i => { if (next[i.id] !== undefined) next[i.id] -= i.cantidad })
        return next
      })
      setVentas(prev => [...prev, { metodo_pago: metodo, total, perfiles: { nombre: perfil.nombre } }])

      if (modoRapido) {
        setTicket([])
        setShowPago(false)
        showToast(`✓ Venta ${fmt(total)} · ${metodo === 'efectivo' ? `Cambio: ${fmt(cambio)}` : 'Tarjeta'}`)
      } else {
        setShowOk({ metodo, total, cambio })
        setTicket([])
        setShowPago(false)
      }
    } catch (e) {
      showToast('Error al guardar venta: ' + e.message, 'error')
    }
  }

  const confirmarCierre = async (contado) => {
    try {
      await cerrarCaja(caja.id, perfil.id, contado)
      setCaja(null); setVentas([]); setTicket([]); setShowCierre(false)
    } catch (e) { showToast('Error cerrando caja: ' + e.message, 'error') }
  }

  const handleToggleFav = (e, prodId) => {
    e.stopPropagation()
    const nuevos = toggleFavorito(prodId)
    setFavoritos([...nuevos])
  }

  const eaBadge = p => {
    if (p.edad_minima === 0)  return <span className="pea et1">T1</span>
    if (p.edad_minima === 12) return <span className="pea e12">12+</span>
    if (p.edad_minima === 16) return <span className="pea e16">16+</span>
    return <span className="pea e18">18+</span>
  }

  if (loading) return <div className="splash"><div className="spinner" /></div>

  // ── Apertura caja ──────────────────────────────────────────
  if (!caja) return (
    <div className="app">
      <div className="topbar">
        <div className="tl">💥 Caballer</div>
        <div className="ti">
          <span style={{ fontSize: '.8rem', color: 'var(--tx2)' }}>{caseta?.nombre}</span>
          <button className="btn-o" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="apw">
        <div className="apc">
          <div className="apt">Apertura de Caja</div>
          <div className="aps">Hola <strong>{perfil.nombre}</strong> · {caseta?.nombre}</div>
          <div className="aps" style={{ marginBottom: 20, fontSize: '.77rem', color: 'var(--tx2)' }}>
            Introduce el efectivo inicial. Si un compañero ya abrió la caja, pulsa directamente.
          </div>
          <input className="bi" type="number" placeholder="0,00" value={apertura}
            onChange={e => setApertura(e.target.value)} min="0" step="0.01" inputMode="decimal" />
          <button className="btn-p" onClick={handleAbrirCaja}>Abrir caja y comenzar</button>
        </div>
      </div>
    </div>
  )

  // ── TPV ────────────────────────────────────────────────────
  const totalCajaTurno = ventas.reduce((s, v) => s + v.total, 0)

  // Productos filtrados
  let prodsFiltrados = productos
  if (tabTPV === 'favoritos') {
    prodsFiltrados = favoritos.map(id => productos.find(p => p.id === id)).filter(Boolean)
  } else {
    if (cat !== 'Todos') prodsFiltrados = prodsFiltrados.filter(p => p.categoria === cat)
  }
  if (busq) prodsFiltrados = prodsFiltrados.filter(p =>
    p.nombre.toLowerCase().includes(busq.toLowerCase()) || p.codigo_ean?.includes(busq)
  )

  // Botones rápidos siempre visibles (mechas y bolsas)
  const botonesRapidos = productos.filter(p =>
    ['mecha', 'bolsa', 'cebador'].some(kw => p.nombre.toLowerCase().includes(kw))
  ).slice(0, 4)

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">💥 Caballer</div>
        <div className="ti">
          <span style={{ fontSize: '.79rem', color: 'var(--tx2)' }}>{caseta?.nombre}</span>
          <span className="badge be">Empleado</span>
          <button className="btn-o" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>

      {/* Subbar caja */}
      <div style={{ padding: '7px 20px', background: 'var(--s1)', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: '.78rem' }}>
        <span style={{ color: 'var(--tx2)' }}>
          Turno: <strong style={{ color: 'var(--tx)' }}>{caja.perfiles?.nombre}</strong>
        </span>
        <span style={{ color: 'var(--tx2)' }}>
          {ventas.length} tickets · <strong style={{ color: 'var(--ac)' }}>{fmt(totalCajaTurno)}</strong>
        </span>
        {modoRapido && <span style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)', padding: '2px 8px', borderRadius: 20, fontSize: '.7rem', fontWeight: 700 }}>⚡ MODO RÁPIDO</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button className="btn-o" onClick={() => setShowHistorial(true)}>Ver tickets</button>
          <button className="btn-o" onClick={() => setShowCierre(true)}>Cerrar Caja</button>
        </div>
      </div>

      <div className="cnt">
        <div className="tpvg">
          {/* Panel productos */}
          <div className="pp">
            <div className="srch">
              <input className="si" placeholder="Buscar producto o EAN..."
                value={busq} onChange={e => { setBusq(e.target.value); setTabTPV('todos') }} />
              <button className="bsc" onClick={() => setShowScan(true)}>📷</button>
            </div>

            {/* Tabs todos / favoritos / ofertas */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bd)' }}>
              {[
                ['todos',     'Todos',                     'var(--ac)'],
                ['favoritos', `⭐ Favs (${favoritos.length})`, 'var(--gold)'],
                ['ofertas',   `🏷️ Ofertas (${ofertas.length})`, 'var(--green)'],
              ].map(([k, l, color]) => (
                <button key={k} onClick={() => setTabTPV(k)} style={{
                  flex: 1, padding: '9px 4px', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${tabTPV === k ? color : 'transparent'}`,
                  color: tabTPV === k ? color : 'var(--tx2)', fontFamily: "'DM Sans',sans-serif",
                }}>{l}</button>
              ))}
            </div>

            {/* Categorías (solo en tab todos) */}
            {tabTPV === 'todos' && (
              <div className="catbar">
                {CATS.map(c => (
                  <button key={c} className={`ct ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
            )}

            {/* Botones rápidos */}
            {botonesRapidos.length > 0 && !busq && tabTPV !== 'ofertas' && (
              <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--bd)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.67rem', color: 'var(--tx2)', alignSelf: 'center', marginRight: 2 }}>⚡</span>
                {botonesRapidos.map(p => (
                  <button key={p.id} onClick={() => agregar(p)} style={{
                    padding: '5px 11px', borderRadius: 20, border: '1px solid var(--bd)',
                    background: 'var(--s2)', color: 'var(--tx2)', fontSize: '.73rem',
                    fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    transition: 'all .15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ac)'; e.currentTarget.style.color = 'var(--ac)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.color = 'var(--tx2)' }}
                  >{p.nombre}</button>
                ))}
              </div>
            )}

            {/* Grid productos — oculto en tab ofertas */}
            <div className="pg" style={{ display: tabTPV === 'ofertas' ? 'none' : undefined }}>
              {prodsFiltrados.map(p => {
                const stockDisp = stock[p.id] ?? 0
                const enT = ticket.find(i => i.id === p.id)
                const tieneOferta = ofertas.some(o => o.producto_id === p.id)
                const esFav = favoritos.includes(p.id)
                return (
                  <TarjetaProducto
                    key={p.id} p={p}
                    stockDisp={stockDisp} enT={enT}
                    tieneOferta={tieneOferta} esFav={esFav}
                    onTap={() => agregar(p)}
                    onLong={() => abrirModalCantidad(p)}
                    onFav={handleToggleFav}
                    eaBadge={eaBadge}
                  />
                )
              })}
              {tabTPV === 'favoritos' && favoritos.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--tx2)', padding: 30, fontSize: '.85rem' }}>
                  Pulsa ⭐ en cualquier producto para añadirlo a favoritos
                </div>
              )}
              {tabTPV === 'ofertas' && ofertas.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--tx2)', padding: 30, fontSize: '.85rem' }}>
                  Sin ofertas activas. Créalas en el panel Admin.
                </div>
              )}
            </div>

            {/* Tab ofertas — tarjetas grandes */}
            {tabTPV === 'ofertas' && ofertas.length > 0 && (
              <div style={{ padding: 12, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Combinadas */}
                {ofertas.filter(o => o.tipo === 'combinada').map(o => {
                  const sinStock = (o.productos_requeridos || []).some(r => (stock[r.producto_id] ?? 0) < r.cantidad)
                  return (
                    <button key={o.id} disabled={sinStock} onClick={() => {
                      if (sinStock) return
                      ;(o.productos_requeridos || []).forEach(r => {
                        const prod = productos.find(p => p.id === r.producto_id)
                        if (prod) agregar(prod, r.cantidad)
                      })
                      showToast(`✓ ${o.etiqueta} añadida`)
                    }} style={{
                      background: sinStock ? 'var(--s2)' : 'rgba(96,165,250,.1)',
                      border: `1px solid ${sinStock ? 'var(--bd)' : 'rgba(96,165,250,.4)'}`,
                      borderRadius: 'var(--rs)', padding: '13px 14px', cursor: sinStock ? 'not-allowed' : 'pointer',
                      opacity: sinStock ? .5 : 1, textAlign: 'left', fontFamily: "'DM Sans',sans-serif",
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: sinStock ? 'var(--tx2)' : 'var(--blue)', fontSize: '.95rem' }}>🎁 {o.etiqueta}</span>
                        <span style={{ fontWeight: 800, color: 'var(--ac)', fontSize: '1.1rem' }}>{fmt(o.precio_pack)}</span>
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--tx2)' }}>
                        {(o.productos_requeridos || []).map(r => `${r.cantidad}× ${r.nombre}`).join(' + ')}
                      </div>
                      {sinStock && <div style={{ fontSize: '.7rem', color: 'var(--red)', marginTop: 3 }}>Sin stock suficiente</div>}
                    </button>
                  )
                })}
                {/* Packs */}
                {[...new Map(ofertas.filter(o => !o.tipo || o.tipo === 'pack').map(o => [o.producto_id, o])).values()].map(o => {
                  const prod = productos.find(p => p.id === o.producto_id)
                  if (!prod) return null
                  const stockDisp = stock[prod.id] ?? 0
                  const sinStock = stockDisp < o.cantidad_pack
                  return (
                    <button key={o.producto_id} disabled={sinStock} onClick={() => {
                      if (sinStock) { showToast('Stock insuficiente', 'error'); return }
                      agregar(prod, o.cantidad_pack)
                      showToast(`✓ ${o.etiqueta} añadido`)
                    }} style={{
                      background: sinStock ? 'var(--s2)' : 'rgba(245,200,66,.08)',
                      border: `1px solid ${sinStock ? 'var(--bd)' : 'rgba(245,200,66,.35)'}`,
                      borderRadius: 'var(--rs)', padding: '13px 14px', cursor: sinStock ? 'not-allowed' : 'pointer',
                      opacity: sinStock ? .5 : 1, textAlign: 'left', fontFamily: "'DM Sans',sans-serif",
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: sinStock ? 'var(--tx2)' : 'var(--gold)', fontSize: '.95rem' }}>📦 {o.etiqueta}</span>
                        <span style={{ fontWeight: 800, color: 'var(--ac)', fontSize: '1.1rem' }}>{fmt(o.precio_pack)}</span>
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--tx2)' }}>
                        {prod.nombre} · {o.cantidad_pack} unidades · Stock: {stockDisp}
                      </div>
                      {sinStock && <div style={{ fontSize: '.7rem', color: 'var(--red)', marginTop: 3 }}>Sin stock suficiente</div>}
                    </button>
                  )
                })}
              </div>
            )}
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
                  <TicketItem key={item.id} item={item} ofertas={ofertas} onQty={cambiarQty}
                    onDel={id => setTicket(p => p.filter(i => i.id !== id))} />
                ))
              }
            </div>

            <div className="tf">
              <div className="tsb"><span>Artículos</span><span>{ticket.reduce((s, i) => s + i.cantidad, 0)}</span></div>
              {/* Ofertas combinadas aplicadas */}
              {detectarOfertasCombinadas(ticket, ofertas).map(o => {
                const sinOferta = (o.productos_requeridos || []).reduce((s, req) => {
                  const item = ticket.find(i => i.id === req.producto_id)
                  if (!item) return s
                  const { total: t } = calcularPrecio(item.id, req.cantidad, item.precio, ofertas)
                  return s + t
                }, 0)
                const ahorro = sinOferta - o.precio_pack
                return ahorro > 0 ? (
                  <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderTop:'1px dashed rgba(34,197,94,.3)', margin:'2px 0' }}>
                    <span style={{ fontSize:'.72rem', color:'var(--green)', fontWeight:600 }}>🏷 {o.etiqueta}</span>
                    <span style={{ fontSize:'.72rem', color:'var(--green)', fontWeight:700 }}>-{fmt(ahorro)}</span>
                  </div>
                ) : null
              })}
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

        {/* Ayuda gestos */}
        <div style={{ fontSize: '.68rem', color: 'var(--tx2)', textAlign: 'center', marginTop: 8, opacity: .6 }}>
          Pulsa = +1 unidad · Mantén pulsado = selector de cantidad · ⭐ = favorito
        </div>
      </div>

      {/* Modales */}
      {prodModal && (
        <ModalCantidad
          producto={prodModal}
          stockDisp={stock[prodModal.id] ?? 0}
          ofertas={ofertas}
          onConfirm={qty => { agregar(prodModal, qty); setProdModal(null) }}
          onClose={() => setProdModal(null)}
        />
      )}
      {showScan && (
        <Scanner
          onDetect={(p, qty) => { agregar(p, qty || 1); setShowScan(false) }}
          onClose={() => setShowScan(false)}
          stock={stock}
          ofertas={ofertas}
        />
      )}
      {showPago && (
        <ModalPago total={total} onConfirm={confirmarVenta} onClose={() => setShowPago(false)}
          modoRapido={modoRapido} onToggleModoRapido={() => setModoRapido(m => !m)} />
      )}
      {showCierre && (
        <ModalCierreCaja caja={caja} caseta={caseta?.nombre} ventas={ventas}
          onClose={() => setShowCierre(false)} onCerrar={confirmarCierre} />
      )}
      {showHistorial && <ModalHistorial cajaId={caja.id} perfil={perfil} onClose={() => setShowHistorial(false)} />}

      {showOk && (
        <div className="mo">
          <div className="mc" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.8rem', color: 'var(--green)', marginBottom: 6 }}>¡Venta Confirmada!</div>
            <div style={{ fontSize: '.84rem', color: 'var(--tx2)', lineHeight: 1.65 }}>
              Total: <strong style={{ color: 'var(--tx)' }}>{fmt(showOk.total)}</strong><br />
              {showOk.metodo === 'efectivo' ? `Efectivo · Cambio: ${fmt(showOk.cambio)}` : '💳 Tarjeta'}
            </div>
            <button className="btn-p" style={{ marginTop: 22 }} onClick={() => setShowOk(null)}>Nueva Venta</button>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
