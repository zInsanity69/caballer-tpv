import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  getProductos, getStockCaseta, getOfertas,
  getCajaAbierta, abrirCaja, cerrarCaja,
  getResumenCaja, crearTicket, getTicketsTurno, deleteTicket, updateTicket,
  getFavoritos, toggleFavorito,
  getPedidos, crearPedido, confirmarRecepcionPedido,
  crearInventario, getInventarios, confirmarInventario,
  getKgPolvora, getLimitePolvora,
  getUltimoFichaje, fichar, getFichajesEmpleado, calcularTurnos, calcularEstado, fmtDuracion,
  getEmpleadosActivosCaseta, obtenerUbicacion, verificarUbicacion,
} from '../lib/api.js'
import { calcularPrecio, calcularTotalTicket, detectarOfertasCombinadas, fmt } from '../lib/precios.js'
import Scanner from './Scanner.jsx'

// ─── HOOK SCROLL HORIZONTAL CON RUEDA ────────────────────────
// Permite desplazar contenedores con overflow-x con la rueda del ratón
function useWheelScroll() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])
  return ref
}

// Componente wrapper que habilita scroll horizontal con rueda del ratón
function WheelScrollDiv({ children, className, style }) {
  const ref = useWheelScroll()
  return <div ref={ref} className={className} style={style}>{children}</div>
}

function Toast({ msg, type }) {
  return <div className="twrap"><div className={`toast ${type === 'error' ? 'te2' : 'tok'}`}>{msg}</div></div>
}

// ─── LONG PRESS ──────────────────────────────────────────────
// Bug fixes:
//  1. onTouchMove cancela si hubo scroll
//  2. En móvil un tap dispara touch Y mouse → ignoramos mouse si vino touch
function useLongPress(onTap, onLong, ms = 500) {
  const timer     = useRef(null)
  const fired     = useRef(false)
  const moved     = useRef(false)
  const wasTouch  = useRef(false)   // ← si el gesto fue touch, ignoramos mouse

  const startTouch = (e) => {
    if (e.target.closest('button[data-nobubble]')) return
    wasTouch.current = true
    fired.current = false
    moved.current = false
    timer.current = setTimeout(() => {
      if (moved.current) return
      fired.current = true
      onLong()
    }, ms)
  }

  const startMouse = (e) => {
    if (wasTouch.current) return   // ya gestionado por touch
    if (e.target.closest('button[data-nobubble]')) return
    fired.current = false
    moved.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      onLong()
    }, ms)
  }

  const onMove = () => {
    moved.current = true
    clearTimeout(timer.current)
  }

  const cancel = () => { clearTimeout(timer.current) }

  const endTouch = (e) => {
    if (e.target.closest('button[data-nobubble]')) return
    clearTimeout(timer.current)
    if (!fired.current && !moved.current) onTap()
    // Resetear wasTouch después de un pequeño delay
    // (los eventos mouse sintéticos llegan ~300ms después del touch)
    setTimeout(() => { wasTouch.current = false }, 500)
  }

  const endMouse = (e) => {
    if (wasTouch.current) return   // ignorar, ya procesado por touch
    if (e.target.closest('button[data-nobubble]')) return
    clearTimeout(timer.current)
    if (!fired.current && !moved.current) onTap()
  }

  return {
    onMouseDown:   startMouse,
    onMouseUp:     endMouse,
    onMouseLeave:  cancel,
    onTouchStart:  startTouch,
    onTouchMove:   onMove,
    onTouchEnd:    endTouch,
    onContextMenu: (e) => e.preventDefault(),
  }
}

// ─── BADGE EDAD ──────────────────────────────────────────────
function EaBadge({ edad }) {
  if (edad === 0)  return <span className="pea et1">T1</span>
  if (edad === 12) return <span className="pea e12">12+</span>
  if (edad === 16) return <span className="pea e16">16+</span>
  return <span className="pea e18">18+</span>
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
      <button data-nobubble="1" onClick={() => onDel(item.id)} style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
        color: 'var(--red)', fontSize: '.95rem', cursor: 'pointer', alignSelf: 'center',
      }}>✕</button>
    </div>
  )
}

// ─── TARJETA PRODUCTO ────────────────────────────────────────
function TarjetaProducto({ p, stockDisp, enT, tieneOferta, esFav, onTap, onLong, onFav }) {
  const lp = useLongPress(onTap, onLong)
  return (
    <div
      className="pc"
      {...lp}
      style={{ opacity: stockDisp === 0 ? .4 : 1, outline: enT ? '2px solid var(--ac)' : 'none', userSelect: 'none', touchAction: 'pan-y' }}
    >
      <EaBadge edad={p.edad_minima} />
      <button data-nobubble="1" onClick={(e) => { e.stopPropagation(); onFav(p.id) }} style={{
        position: 'absolute', top: 5, left: 5, background: 'transparent', border: 'none',
        cursor: 'pointer', fontSize: '.72rem', opacity: esFav ? 1 : .25, padding: 0, lineHeight: 1,
      }}>⭐</button>
      <div className="pn">{p.nombre}</div>
      <div className="pp2">{fmt(p.precio)}</div>
      <div className="pst">
        {stockDisp === 0 ? 'Agotado' : `Stock: ${stockDisp}`}
        {enT && <span style={{ color: 'var(--green)' }}> · {enT.cantidad}</span>}
      </div>
      {tieneOferta && <span className="ocbadge">OFERTA</span>}
    </div>
  )
}

// ─── MODAL CANTIDAD ──────────────────────────────────────────
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
          {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map(n => (
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
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
            <span style={{ color: 'var(--tx2)' }}>{qty} × {fmt(producto.precio)}</span>
            {hayOferta
              ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>Con oferta: {fmt(total)}</span>
              : <span style={{ fontWeight: 700 }}>{fmt(total)}</span>}
          </div>
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
function ModalPago({ total, onConfirm, onClose, modoRapido, onToggleModoRapido, ticketActivo, onToggleTicket }) {
  const [metodo, setMetodo]     = useState('')
  const [recibido, setRecibido] = useState('')
  const [loading, setLoading]   = useState(false)
  const cambio = metodo === 'efectivo' ? Math.max(0, (parseFloat(recibido) || 0) - total) : 0
  const puedeConfirmar = metodo && (metodo === 'tarjeta' || (parseFloat(recibido) || 0) >= total)

  return (
    <div className="mo">
      <div className="mc">
        <div className="mt-modal">Finalizar Venta</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.8rem', color: 'var(--ac)', marginBottom: 16 }}>{fmt(total)}</div>
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
              <div className="clbl">Cambio</div>
              <div className="camt">{fmt(cambio)}</div>
            </div>
          </>
        )}
        {/* Toggle modo rápido */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <div onClick={onToggleModoRapido} style={{
            width: 40, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'all .2s',
            background: modoRapido ? 'var(--green)' : 'var(--s3)', position: 'relative', flexShrink: 0,
          }}>
            <div style={{ position: 'absolute', top: 3, left: modoRapido ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
          </div>
          <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>⚡ Venta rápida — nuevo ticket automático</span>
        </div>
        {/* Toggle impresión de ticket */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', marginBottom: 4 }}>
          <div onClick={onToggleTicket} style={{
            width: 40, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'all .2s',
            background: ticketActivo ? 'var(--green)' : 'var(--s3)', position: 'relative', flexShrink: 0,
          }}>
            <div style={{ position: 'absolute', top: 3, left: ticketActivo ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
          </div>
          <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>🖨️ Mostrar opción de imprimir ticket</span>
        </div>
        <button className="btn-p" disabled={!puedeConfirmar || loading} onClick={async () => {
          setLoading(true)
          await onConfirm({ metodo, dineroDado: parseFloat(recibido) || total, cambio })
          setLoading(false)
        }}>
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
  return (
    <div className="mo">
      <div className="mc wide">
        <div className="mt-modal">🏦 Cierre de Caja</div>
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
        <button className="btn-p" disabled={loading}
          onClick={async () => { setLoading(true); await onCerrar(parseFloat(contado) || 0); setLoading(false) }}>
          {loading ? 'Cerrando...' : 'Confirmar cierre'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL HISTORIAL + EDICIÓN TICKETS ───────────────────────
function ModalHistorial({ cajaId, perfil, caseta, productos, ofertas, onStockChange, onClose }) {
  const [tickets, setTickets]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState(null)
  const [editando, setEditando]     = useState(null)
  const [editItems, setEditItems]   = useState([])
  const [editBusq, setEditBusq]     = useState('')   // buscador añadir producto
  const [busq, setBusq]             = useState('')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    getTicketsTurno(cajaId).then(setTickets).finally(() => setLoading(false))
  }, [cajaId])

  const ticketsFiltrados = tickets.filter(t => {
    if (!busq) return true
    const b = busq.toLowerCase()
    return (
      t.perfiles?.nombre?.toLowerCase().includes(b) ||
      fmt(t.total).includes(b) ||
      t.ticket_items?.some(i => i.nombre_producto?.toLowerCase().includes(b)) ||
      new Date(t.creado_en).toLocaleTimeString('es-ES').includes(b)
    )
  })

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este ticket? El stock NO se restaura automáticamente.')) return
    await deleteTicket(id)
    setTickets(prev => prev.filter(t => t.id !== id))
  }

  const abrirEdicion = (t) => {
    setEditando(t)
    setEditItems(t.ticket_items.map(i => ({
      producto_id:    i.producto_id,
      nombre:         i.nombre_producto,
      precio:         i.precio_unitario,
      cantidad:       i.cantidad,
      total_linea:    i.total_linea,
      con_oferta:     i.con_oferta || false,
    })))
  }

  const guardarEdicion = async () => {
    setSaving(true)
    try {
      const nuevoTotal = editItems.reduce((s, i) => s + i.total_linea, 0)
      await updateTicket(editando.id, nuevoTotal, editItems)

      // Ajustar stock: calcular diferencia entre items originales y nuevos
      const itemsOriginales = editando.ticket_items || []
      const stockDelta = {}
      // Devolver stock de lo que había antes
      itemsOriginales.forEach(i => {
        stockDelta[i.producto_id] = (stockDelta[i.producto_id] || 0) + i.cantidad
      })
      // Restar stock de lo que queda ahora
      editItems.forEach(i => {
        stockDelta[i.producto_id] = (stockDelta[i.producto_id] || 0) - i.cantidad
      })
      // Aplicar delta al stock local (positivo = devuelto, negativo = añadido)
      onStockChange && onStockChange(stockDelta)

      setTickets(prev => prev.map(t => t.id === editando.id
        ? { ...t, total: nuevoTotal, ticket_items: editItems.map(i => ({ ...i, nombre_producto: i.nombre, precio_unitario: i.precio })) }
        : t))
      setEditando(null)
    } catch (e) { alert('Error guardando: ' + e.message) }
    setSaving(false)
  }

  const editQty = (idx, delta) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const nq = Math.max(1, item.cantidad + delta)
      return { ...item, cantidad: nq, total_linea: +(nq * item.precio).toFixed(2) }
    }))
  }

  const editDel = (idx) => setEditItems(prev => prev.filter((_, i) => i !== idx))

  // Añadir un producto existente al ticket en edición
  const editAddProd = (prod) => {
    setEditItems(prev => {
      const idx = prev.findIndex(i => i.producto_id === prod.id)
      if (idx >= 0) {
        return prev.map((it, i) => i !== idx ? it : {
          ...it, cantidad: it.cantidad + 1,
          total_linea: +((it.cantidad + 1) * it.precio).toFixed(2),
        })
      }
      return [...prev, {
        producto_id: prod.id, nombre: prod.nombre,
        precio: prod.precio, cantidad: 1,
        total_linea: +prod.precio.toFixed(2), con_oferta: false,
      }]
    })
    setEditBusq('')
  }

  const totalTurno = tickets.reduce((s, t) => s + t.total, 0)

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc wide" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mt-modal">🧾 Tickets del turno</div>

        {/* Buscador */}
        <input className="si" placeholder="Buscar por empleado, producto, importe..."
          value={busq} onChange={e => setBusq(e.target.value)}
          style={{ marginBottom: 10 }} />

        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 10 }}>
          {ticketsFiltrados.length} tickets · Total: <strong style={{ color: 'var(--ac)' }}>{fmt(totalTurno)}</strong>
        </div>

        {loading
          ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
          : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {ticketsFiltrados.length === 0
                ? <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 30 }}>Sin resultados</div>
                : ticketsFiltrados.map(t => (
                  <div key={t.id} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                          {t.numero_ticket && <span style={{ color: 'var(--ac)', fontWeight: 700, marginRight: 4 }}>{t.numero_ticket}</span>}
                          {new Date(t.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{t.perfiles?.nombre}
                          {' · '}{t.metodo_pago === 'efectivo' ? '💵' : '💳'}
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--ac)', fontSize: '1rem' }}>{fmt(t.total)}</div>
                      </div>
                      <button className="btn-o" style={{ fontSize: '.7rem' }} onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                        {expanded === t.id ? 'Ocultar' : 'Ver'}
                      </button>
                      <button className="btn-o" style={{ fontSize: '.7rem' }}
                        onClick={() => imprimirTicket({
                          items: (t.ticket_items||[]).map(i=>({nombre:i.nombre_producto,cantidad:i.cantidad,precio:i.precio_unitario,total_linea:i.total_linea,gramos_polvora:0})),
                          total: t.total, metodo: t.metodo_pago, cambio: 0,
                          caseta, perfil: t.perfiles,
                          fecha: new Date(t.creado_en),
                          ticketNum: t.numero_ticket || `TVN-${t.id.slice(-6).toUpperCase()}`,
                        })}>🖨️</button>
                      <button className="btn-o" style={{ fontSize: '.7rem', borderColor: 'var(--blue)', color: 'var(--blue)' }}
                        onClick={() => abrirEdicion(t)}>Editar</button>
                      <button className="btn-del" onClick={() => eliminar(t.id)}>✕</button>
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

      {/* Modal edición ticket */}
      {editando && (
        <div className="mo" style={{ zIndex: 999 }} onClick={e => e.target === e.currentTarget && setEditando(null)}>
          <div className="mc wide" style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="mt-modal">✏️ Editar Ticket</div>
            <div style={{ fontSize: '.78rem', color: 'var(--tx2)', marginBottom: 12 }}>
              {new Date(editando.creado_en).toLocaleString('es-ES')} · {editando.perfiles?.nombre}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {editItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--bd)' }}>
                  <div style={{ flex: 1, fontSize: '.85rem' }}>{item.nombre}</div>
                  <button className="qb" onClick={() => editQty(idx, -1)}>−</button>
                  <span style={{ minWidth: 26, textAlign: 'center', fontWeight: 700 }}>{item.cantidad}</span>
                  <button className="qb" onClick={() => editQty(idx, +1)}>+</button>
                  <span style={{ minWidth: 52, textAlign: 'right', fontSize: '.85rem', color: 'var(--ac)' }}>{fmt(item.total_linea)}</span>
                  <button onClick={() => editDel(idx)} style={{
                    width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(239,68,68,.3)',
                    background: 'rgba(239,68,68,.1)', color: 'var(--red)', cursor: 'pointer', fontSize: '.8rem',
                  }}>✕</button>
                </div>
              ))}
              {/* Buscador para añadir productos al ticket */}
              <div style={{ position: 'relative', marginBottom: 10, marginTop: 16 }}>
                <input
                  className="si"
                  placeholder="+ Añadir producto al ticket..."
                  value={editBusq}
                  onChange={e => setEditBusq(e.target.value)}
                />
                {editBusq.length > 1 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', maxHeight: 180, overflowY: 'auto' }}>
                    {productos
                      .filter(p => p.nombre.toLowerCase().includes(editBusq.toLowerCase()))
                      .slice(0, 15)
                      .map(p => (
                        <div key={p.id} onClick={() => editAddProd(p)}
                          style={{ padding: '9px 13px', cursor: 'pointer', fontSize: '.83rem', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span>{p.nombre}</span>
                          <span style={{ color: 'var(--ac)', fontWeight: 700 }}>{fmt(p.precio)}</span>
                        </div>
                      ))
                    }
                    {productos.filter(p => p.nombre.toLowerCase().includes(editBusq.toLowerCase())).length === 0 && (
                      <div style={{ padding: 12, color: 'var(--tx2)', fontSize: '.82rem', textAlign: 'center' }}>Sin resultados</div>
                    )}
                  </div>
                )}
              </div>
              {editItems.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 20, fontSize: '.85rem' }}>
                  Sin artículos — el ticket quedará vacío
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, padding: '10px 0', fontSize: '1rem' }}>
              <span>Nuevo total</span>
              <span style={{ color: 'var(--ac)' }}>{fmt(editItems.reduce((s, i) => s + i.total_linea, 0))}</span>
            </div>
            <button className="btn-p" disabled={saving} onClick={guardarEdicion}>
              {saving ? 'Guardando...' : '✓ Guardar cambios'}
            </button>
            <button className="btn-s" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MODAL PEDIDO ─────────────────────────────────────────────
function ModalPedido({ caseta, perfil, productos, stock, onClose, onCreado, showToast }) {
  // Vista doble: catálogo con stock actual + lista del pedido
  const [items, setItems]       = useState([])
  const [notas, setNotas]       = useState('')
  const [busq, setBusq]         = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [vista, setVista]       = useState('catalogo') // 'catalogo' | 'pedido'
  const [loading, setLoading]   = useState(false)

  const cats = ['Todos', ...new Set(productos.map(p => p.categoria))]

  const prodsFiltrados = productos.filter(p => {
    const bOk = !busq || p.nombre.toLowerCase().includes(busq.toLowerCase())
    const cOk = catFiltro === 'Todos' || p.categoria === catFiltro
    return bOk && cOk
  })

  const cantidadPedida = (productoId) => items.find(i => i.producto_id === productoId)?.cantidad || 0

  const addItem = (p, delta = 1) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.producto_id === p.id)
      if (idx >= 0) {
        const nuevaCant = prev[idx].cantidad + delta
        if (nuevaCant <= 0) return prev.filter(i => i.producto_id !== p.id)
        const n = [...prev]; n[idx] = { ...n[idx], cantidad: nuevaCant }; return n
      }
      if (delta <= 0) return prev
      return [...prev, { producto_id: p.id, nombre: p.nombre, cantidad: delta }]
    })
  }

  const setQty = (id, val) => {
    const q = Math.max(0, parseInt(val) || 0)
    if (q === 0) setItems(prev => prev.filter(i => i.producto_id !== id))
    else setItems(prev => prev.map(i => i.producto_id === id ? { ...i, cantidad: q } : i))
  }

  const del = (id) => setItems(prev => prev.filter(i => i.producto_id !== id))

  const enviar = async () => {
    if (items.length === 0) { showToast('Añade al menos un producto', 'error'); return }
    setLoading(true)
    try {
      await crearPedido(caseta.id, perfil.id, items, notas)
      showToast('✓ Pedido enviado al administrador')
      onCreado()
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setLoading(false)
  }

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc wide" style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mt-modal">📦 Nuevo Pedido</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 10 }}>
          {caseta.nombre} · {perfil.nombre}
        </div>

        {/* Tabs catálogo / resumen pedido */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bd)', marginBottom: 10 }}>
          <button onClick={() => setVista('catalogo')} style={{
            flex: 1, padding: '9px 4px', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer',
            background: 'transparent', border: 'none', fontFamily: "'DM Sans',sans-serif",
            borderBottom: `2px solid ${vista === 'catalogo' ? 'var(--ac)' : 'transparent'}`,
            color: vista === 'catalogo' ? 'var(--ac)' : 'var(--tx2)',
          }}>📋 Ver productos y stock</button>
          <button onClick={() => setVista('pedido')} style={{
            flex: 1, padding: '9px 4px', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer',
            background: 'transparent', border: 'none', fontFamily: "'DM Sans',sans-serif",
            borderBottom: `2px solid ${vista === 'pedido' ? 'var(--ac)' : 'transparent'}`,
            color: vista === 'pedido' ? 'var(--ac)' : 'var(--tx2)',
          }}>
            📤 Mi pedido {items.length > 0 && <span style={{ background: 'var(--ac)', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: '.7rem', marginLeft: 4 }}>{items.reduce((s, i) => s + i.cantidad, 0)}</span>}
          </button>
        </div>

        {/* ── VISTA CATÁLOGO ── */}
        {vista === 'catalogo' && (
          <>
            {/* Buscador */}
            <input className="si" placeholder="Buscar producto..."
              value={busq} onChange={e => setBusq(e.target.value)} style={{ marginBottom: 8 }} />

            {/* Filtro categorías — scroll horizontal con rueda del ratón */}
            <WheelScrollDiv style={{ overflowX: 'auto', display: 'flex', gap: 6, paddingBottom: 8, marginBottom: 6, flexShrink: 0 }}>
              {cats.map(c => (
                <button key={c} onClick={() => setCatFiltro(c)} style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 20, fontSize: '.75rem',
                  fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  background: catFiltro === c ? 'var(--ac)' : 'var(--s2)',
                  border: `1px solid ${catFiltro === c ? 'var(--ac)' : 'var(--bd)'}`,
                  color: catFiltro === c ? 'white' : 'var(--tx2)',
                  whiteSpace: 'nowrap',
                }}>{c}</button>
              ))}
            </WheelScrollDiv>

            {/* Lista productos con stock */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {prodsFiltrados.map(p => {
                const stockDisp = stock[p.id] ?? 0
                const enPedido  = cantidadPedida(p.id)
                return (
                  <div key={p.id} style={{
                    padding: '9px 0', borderBottom: '1px solid var(--bd)',
                    opacity: stockDisp === 0 ? .6 : 1,
                  }}>
                    {/* Fila 1: nombre + botón/controles */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                      </div>
                      {/* Controles — siempre a la derecha */}
                      {enPedido > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <button className="qb" style={{ width: 30, height: 30 }} onClick={() => addItem(p, -1)}>−</button>
                          <input
                            type="number" min="1" defaultValue={enPedido} key={enPedido}
                            onBlur={e => {
                              const q = parseInt(e.target.value) || 0
                              if (q <= 0) { addItem(p, -enPedido) }
                              else setItems(prev => prev.map(i => i.producto_id === p.id ? { ...i, cantidad: q } : i))
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                            style={{ width: 46, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--ac)', borderRadius: 'var(--rs)', color: 'var(--ac)', fontWeight: 800, fontFamily: "'DM Sans',sans-serif", padding: '4px 2px', fontSize: '.9rem' }}
                            inputMode="numeric"
                          />
                          <button className="qb" style={{ width: 30, height: 30 }} onClick={() => addItem(p, +1)}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => addItem(p, 1)} style={{
                          flexShrink: 0, padding: '5px 12px', borderRadius: 'var(--rs)',
                          background: 'rgba(255,77,28,.12)', border: '1px solid var(--ac)',
                          color: 'var(--ac)', fontWeight: 700, cursor: 'pointer',
                          fontSize: '.75rem', fontFamily: "'DM Sans',sans-serif",
                        }}>+ Pedir</button>
                      )}
                    </div>
                    {/* Fila 2: stock + info */}
                    <div style={{ fontSize: '.7rem', display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                      {stockDisp === 0 ? (
                        <span style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', color: 'var(--red)', fontWeight: 800, padding: '1px 6px', borderRadius: 8 }}>❌ Agotado</span>
                      ) : stockDisp < 10 ? (
                        <span style={{ background: 'rgba(245,200,66,.15)', border: '1px solid rgba(245,200,66,.4)', color: 'var(--gold)', fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>⚠️ {stockDisp} uds</span>
                      ) : (
                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>Stock: {stockDisp}</span>
                      )}
                      <span style={{ color: 'var(--tx2)', opacity: .7 }}>{p.categoria}</span>
                      <span style={{ color: 'var(--tx2)', opacity: .6 }}>{fmt(p.precio)}</span>
                      {enPedido > 0 && <span style={{ color: 'var(--ac)', fontWeight: 700, marginLeft: 'auto' }}>En pedido: {enPedido}</span>}
                    </div>
                  </div>
                )
              })}
              {prodsFiltrados.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 30, fontSize: '.85rem' }}>Sin resultados</div>
              )}
            </div>

            {/* Botón ir al pedido */}
            {items.length > 0 && (
              <button className="btn-p" style={{ marginTop: 10 }} onClick={() => setVista('pedido')}>
                Ver mi pedido ({items.length} producto{items.length !== 1 ? 's' : ''}) →
              </button>
            )}
          </>
        )}

        {/* ── VISTA PEDIDO ── */}
        {vista === 'pedido' && (
          <>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 30, fontSize: '.85rem' }}>
                  El pedido está vacío.<br/>
                  <span style={{ fontSize: '.78rem' }}>Vuelve al catálogo y añade productos.</span>
                </div>
              ) : items.map(item => (
                <div key={item.producto_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--bd)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{item.nombre}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx2)' }}>
                      Stock actual: {stock[item.producto_id] ?? 0}
                    </div>
                  </div>
                  <button className="qb" onClick={() => setQty(item.producto_id, item.cantidad - 1)}>−</button>
                  <input type="number" value={item.cantidad} min="1"
                    onChange={e => setQty(item.producto_id, e.target.value)}
                    style={{ width: 52, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '4px', fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}
                    inputMode="numeric" />
                  <button className="qb" onClick={() => setQty(item.producto_id, item.cantidad + 1)}>+</button>
                  <button onClick={() => del(item.producto_id)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.1)', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>

            <div className="fg" style={{ marginBottom: 10, marginTop: 8 }}>
              <label>Notas / Observaciones (opcional)</label>
              <input className="bi" style={{ marginBottom: 0 }} value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Ej: urgente, revisar stock de tracas..." />
            </div>

            <button className="btn-p" disabled={loading || items.length === 0} onClick={enviar}>
              {loading ? 'Enviando...' : `📤 Enviar pedido (${items.reduce((s,i)=>s+i.cantidad,0)} uds)`}
            </button>
          </>
        )}

        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL MIS PEDIDOS ────────────────────────────────────────
function ModalMisPedidos({ caseta, perfil, productos, onClose, showToast }) {
  const [pedidos, setPedidos]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [recibiendo, setRecibiendo] = useState(null)
  const [recItems, setRecItems]     = useState([])
  const [notasRec, setNotasRec]     = useState('')
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    getPedidos({ casetaId: caseta.id }).then(setPedidos).finally(() => setLoading(false))
  }, [caseta.id])

  const abrirRecepcion = (pedido) => {
    setRecibiendo(pedido)
    setRecItems(pedido.pedido_items.map(i => ({
      id:                i.id,
      producto_id:       i.producto_id,
      nombre:            i.productos?.nombre || '?',
      cantidad:          i.cantidad,
      cantidad_recibida: i.cantidad,   // por defecto = lo pedido
      notas_item:        '',
      estado:            'pendiente',  // pendiente | ok | diferencia | no_llegado
    })))
    setNotasRec('')
  }

  const confirmarRec = async () => {
    setSaving(true)
    try {
      await confirmarRecepcionPedido(recibiendo.id, caseta.id, recItems, notasRec)
      const hayIncidencia = notasRec?.trim() ||
        recItems.some(i => i.estado === 'no_llegado' || i.estado === 'diferencia' || i.notas_item?.trim())
      showToast(hayIncidencia ? '⚠️ Recepción con incidencias — stock actualizado' : '✓ Recepción confirmada, stock actualizado')
      setPedidos(prev => prev.map(p => p.id === recibiendo.id
        ? { ...p, estado: hayIncidencia ? 'INCIDENCIA' : 'RECIBIDO' }
        : p))
      setRecibiendo(null)
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setSaving(false)
  }

  const ESTADO_COLOR = {
    PENDIENTE:  'var(--gold)',
    ACEPTADO:   'var(--blue)',
    EN_CAMINO:  'var(--ac)',
    RECIBIDO:   'var(--green)',
    INCIDENCIA: 'var(--red)',
  }
  const ESTADO_LABEL = {
    PENDIENTE:  '⏳ Pendiente',
    ACEPTADO:   '✅ Aceptado',
    EN_CAMINO:  '🚚 En camino',
    RECIBIDO:   '📦 Recibido',
    INCIDENCIA: '⚠️ Incidencia',
  }

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc wide" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mt-modal">📋 Mis Pedidos</div>
        {loading
          ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
          : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {pedidos.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 30 }}>Sin pedidos realizados</div>
              )}
              {pedidos.map(p => (
                <div key={p.id} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '.88rem' }}>
                      {new Date(p.creado_en).toLocaleDateString('es-ES')}
                      <span style={{ fontWeight: 400, color: 'var(--tx2)', fontSize: '.75rem', marginLeft: 6 }}>
                        {new Date(p.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '.82rem', color: ESTADO_COLOR[p.estado] }}>
                      {ESTADO_LABEL[p.estado]}
                    </span>
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--tx2)', marginBottom: 6 }}>
                    {p.pedido_items?.map(i => `${i.productos?.nombre} ×${i.cantidad}`).join(' · ')}
                  </div>
                  {p.notas && <div style={{ fontSize: '.75rem', color: 'var(--tx2)', fontStyle: 'italic' }}>📝 {p.notas}</div>}
                  {p.notas_admin && (
                    <div style={{ fontSize: '.75rem', marginTop: 4, color: 'var(--blue)' }}>
                      🔵 Admin: {p.notas_admin}
                    </div>
                  )}
                  {p.estado === 'EN_CAMINO' && (
                    <button className="btn-p" style={{ marginTop: 8, padding: '7px 0', fontSize: '.82rem' }}
                      onClick={() => abrirRecepcion(p)}>
                      📦 Confirmar recepción
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        }
        <button className="btn-s" style={{ marginTop: 12 }} onClick={onClose}>Cerrar</button>
      </div>

      {/* Modal confirmar recepción — rediseñado con estado por producto */}
      {recibiendo && (
        <div className="mo" style={{ zIndex: 999 }} onClick={e => e.target === e.currentTarget && setRecibiendo(null)}>
          <div className="mc wide" style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="mt-modal">📦 Confirmar Recepción</div>
            <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 4 }}>
              Revisa cada producto. Confirma lo que ha llegado o marca lo que no vino.
            </div>
            {/* Resumen rápido */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.75rem', background: 'rgba(34,197,94,.12)', color: 'var(--green)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                ✓ {recItems.filter(i => i.estado === 'ok').length} OK
              </span>
              <span style={{ fontSize: '.75rem', background: 'rgba(245,200,66,.12)', color: 'var(--gold)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                ± {recItems.filter(i => i.estado === 'diferencia').length} con diferencia
              </span>
              <span style={{ fontSize: '.75rem', background: 'rgba(239,68,68,.12)', color: 'var(--red)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                ✕ {recItems.filter(i => i.estado === 'no_llegado').length} no llegó
              </span>
              <span style={{ fontSize: '.75rem', background: 'var(--s2)', color: 'var(--tx2)', padding: '3px 10px', borderRadius: 20 }}>
                ⏳ {recItems.filter(i => i.estado === 'pendiente').length} pendiente
              </span>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {recItems.map((item, idx) => {
                const setBand = (estado) => setRecItems(prev => prev.map((r, i) => {
                  if (i !== idx) return r
                  const cantidad_recibida = estado === 'no_llegado' ? 0 : estado === 'ok' ? r.cantidad : r.cantidad_recibida
                  return { ...r, estado, cantidad_recibida }
                }))
                const setQtyRec = (val) => setRecItems(prev => prev.map((r, i) => {
                  if (i !== idx) return r
                  const cantidad_recibida = Math.max(0, parseInt(val) || 0)
                  const estado = cantidad_recibida === 0 ? 'no_llegado' : cantidad_recibida === r.cantidad ? 'ok' : 'diferencia'
                  return { ...r, cantidad_recibida, estado }
                }))
                const setNota = (val) => setRecItems(prev => prev.map((r, i) => i !== idx ? r : { ...r, notas_item: val }))

                const borderCol = item.estado === 'ok' ? 'rgba(34,197,94,.4)'
                  : item.estado === 'diferencia' ? 'rgba(245,200,66,.4)'
                  : item.estado === 'no_llegado' ? 'rgba(239,68,68,.4)'
                  : 'var(--bd)'
                const bgCol = item.estado === 'ok' ? 'rgba(34,197,94,.06)'
                  : item.estado === 'diferencia' ? 'rgba(245,200,66,.06)'
                  : item.estado === 'no_llegado' ? 'rgba(239,68,68,.06)'
                  : 'var(--s2)'

                return (
                  <div key={item.id} style={{ background: bgCol, border: `1px solid ${borderCol}`, borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 10 }}>
                    {/* Nombre + cantidad pedida */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{item.nombre}</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--tx2)' }}>Pedido: <strong style={{ color: 'var(--tx)' }}>{item.cantidad}</strong></div>
                    </div>

                    {/* Botones de estado rápido */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <button onClick={() => setBand('ok')} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 'var(--rs)', fontSize: '.75rem', fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                        background: item.estado === 'ok' ? 'var(--green)' : 'transparent',
                        border: `1px solid ${item.estado === 'ok' ? 'var(--green)' : 'rgba(34,197,94,.4)'}`,
                        color: item.estado === 'ok' ? 'white' : 'var(--green)',
                      }}>✓ Todo llegó</button>
                      <button onClick={() => { setBand('diferencia'); }} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 'var(--rs)', fontSize: '.75rem', fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                        background: item.estado === 'diferencia' ? 'var(--gold)' : 'transparent',
                        border: `1px solid ${item.estado === 'diferencia' ? 'var(--gold)' : 'rgba(245,200,66,.4)'}`,
                        color: item.estado === 'diferencia' ? '#000' : 'var(--gold)',
                      }}>± Diferencia</button>
                      <button onClick={() => setBand('no_llegado')} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 'var(--rs)', fontSize: '.75rem', fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                        background: item.estado === 'no_llegado' ? 'var(--red)' : 'transparent',
                        border: `1px solid ${item.estado === 'no_llegado' ? 'var(--red)' : 'rgba(239,68,68,.4)'}`,
                        color: item.estado === 'no_llegado' ? 'white' : 'var(--red)',
                      }}>✕ No llegó</button>
                    </div>

                    {/* Input cantidad si hay diferencia */}
                    {item.estado === 'diferencia' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>Cantidad recibida:</span>
                        <button className="qb" onClick={() => setQtyRec(item.cantidad_recibida - 1)}>−</button>
                        <input type="number" value={item.cantidad_recibida} min="0" max={item.cantidad * 2}
                          onChange={e => setQtyRec(e.target.value)}
                          style={{ width: 60, background: 'var(--s1)', border: '2px solid var(--gold)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '5px 8px', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, textAlign: 'center' }}
                          inputMode="numeric" />
                        <button className="qb" onClick={() => setQtyRec(item.cantidad_recibida + 1)}>+</button>
                        <span style={{ fontSize: '.78rem', fontWeight: 700, color: item.cantidad_recibida < item.cantidad ? 'var(--red)' : 'var(--green)' }}>
                          {item.cantidad_recibida > item.cantidad ? '+' : ''}{item.cantidad_recibida - item.cantidad}
                        </span>
                      </div>
                    )}

                    {/* Nota de incidencia — aparece si no es "ok" */}
                    {item.estado !== 'ok' && item.estado !== 'pendiente' && (
                      <input placeholder={item.estado === 'no_llegado' ? 'Ej: no venía en el pedido, pendiente de próximo envío...' : 'Ej: solo llegaron 3 de 5...'}
                        value={item.notas_item || ''}
                        onChange={e => setNota(e.target.value)}
                        style={{ width: '100%', background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '7px 10px', fontSize: '.78rem', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Notas generales */}
            <div className="fg" style={{ marginTop: 8 }}>
              <label>Notas generales (opcional)</label>
              <input className="bi" style={{ marginBottom: 0 }} value={notasRec}
                onChange={e => setNotasRec(e.target.value)} placeholder="Observaciones generales del envío..." />
            </div>

            {/* Aviso si hay pendientes */}
            {recItems.some(i => i.estado === 'pendiente') && (
              <div style={{ fontSize: '.75rem', color: 'var(--gold)', marginTop: 8, padding: '6px 10px', background: 'rgba(245,200,66,.1)', borderRadius: 'var(--rs)' }}>
                ⚠️ Quedan {recItems.filter(i => i.estado === 'pendiente').length} productos sin revisar. Márcalos antes de confirmar.
              </div>
            )}

            <button className="btn-p" style={{ marginTop: 10 }} disabled={saving || recItems.some(i => i.estado === 'pendiente')}
              onClick={confirmarRec}>
              {saving ? 'Guardando...' : recItems.some(i => i.estado === 'pendiente')
                ? `⏳ Revisa los ${recItems.filter(i=>i.estado==='pendiente').length} productos pendientes`
                : '✓ Confirmar recepción y actualizar stock'}
            </button>
            <button className="btn-s" onClick={() => setRecibiendo(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MODAL INVENTARIO ─────────────────────────────────────────
function ModalInventario({ caseta, perfil, productos, stockActual, onClose, showToast }) {
  const [items, setItems]       = useState(() =>
    productos.map(p => ({ producto_id: p.id, nombre: p.nombre, categoria: p.categoria, cantidad_real: stockActual[p.id] ?? 0 }))
  )
  const [busq, setBusq]         = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [loading, setLoading]   = useState(false)
  const [enviado, setEnviado]   = useState(false)

  const cats = ['Todos', ...new Set(productos.map(p => p.categoria))]

  const itemsFiltrados = items.filter(i => {
    const bOk = !busq || i.nombre.toLowerCase().includes(busq.toLowerCase())
    const cOk = catFiltro === 'Todos' || i.categoria === catFiltro
    return bOk && cOk
  })

  const setQty = (productoId, val) => {
    const q = Math.max(0, parseInt(val) || 0)
    setItems(prev => prev.map(i => i.producto_id === productoId ? { ...i, cantidad_real: q } : i))
  }

  const enviar = async () => {
    setLoading(true)
    try {
      await crearInventario(caseta.id, perfil.id, items)
      showToast('✓ Inventario enviado al administrador para confirmación')
      setEnviado(true)
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setLoading(false)
  }

  if (enviado) return (
    <div className="mo">
      <div className="mc" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Inventario enviado</div>
        <div style={{ color: 'var(--tx2)', fontSize: '.85rem', marginBottom: 20 }}>
          El administrador revisará el inventario y actualizará el stock.
        </div>
        <button className="btn-p" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc wide" style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mt-modal">📋 Inventario de Cierre</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 10 }}>
          {caseta.nombre} · Cuenta el stock físico restante
        </div>

        <input className="si" placeholder="Buscar producto..."
          value={busq} onChange={e => setBusq(e.target.value)} style={{ marginBottom: 8 }} />

        {/* Fix: scroll horizontal con rueda del ratón */}
        <WheelScrollDiv style={{ overflowX: 'auto', display: 'flex', gap: 6, paddingBottom: 6, marginBottom: 6, flexShrink: 0 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCatFiltro(c)} style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 20, fontSize: '.75rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              background: catFiltro === c ? 'var(--ac)' : 'var(--s2)',
              border: `1px solid ${catFiltro === c ? 'var(--ac)' : 'var(--bd)'}`,
              color: catFiltro === c ? 'white' : 'var(--tx2)',
              whiteSpace: 'nowrap',
            }}>{c}</button>
          ))}
        </WheelScrollDiv>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {itemsFiltrados.map(item => (
            <div key={item.producto_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{item.nombre}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--tx2)' }}>
                  Stock teórico: {stockActual[item.producto_id] ?? 0}
                  {item.cantidad_real !== (stockActual[item.producto_id] ?? 0) && (
                    <span style={{ marginLeft: 6, color: item.cantidad_real < (stockActual[item.producto_id] ?? 0) ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      ({item.cantidad_real - (stockActual[item.producto_id] ?? 0) >= 0 ? '+' : ''}{item.cantidad_real - (stockActual[item.producto_id] ?? 0)})
                    </span>
                  )}
                </div>
              </div>
              <button className="qb" onClick={() => setQty(item.producto_id, item.cantidad_real - 1)}>−</button>
              <input type="number" value={item.cantidad_real} min="0"
                onChange={e => setQty(item.producto_id, e.target.value)}
                style={{ width: 60, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '5px', textAlign: 'center', fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}
                inputMode="numeric" />
              <button className="qb" onClick={() => setQty(item.producto_id, item.cantidad_real + 1)}>+</button>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 0', fontSize: '.78rem', color: 'var(--tx2)' }}>
          {items.filter(i => i.cantidad_real !== (stockActual[i.producto_id] ?? 0)).length} diferencias encontradas
        </div>

        <button className="btn-p" disabled={loading} onClick={enviar}>
          {loading ? 'Enviando...' : '📤 Enviar inventario para revisión'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── BADGE KILOS PÓLVORA ──────────────────────────────────────
function BadgeKgPolvora({ kgActual, kgLimite }) {
  const pct = kgLimite > 0 ? (kgActual / kgLimite) * 100 : 0
  const color = pct >= 100 ? 'var(--red)' : pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--gold)' : 'var(--green)'
  const alerta = pct >= 80
  const icono = pct >= 100 ? '🚨' : pct >= 90 ? '⚠️' : '⚠️'
  return (
    <div title={`${kgActual.toFixed(2)} kg / ${kgLimite} kg permitidos (${pct.toFixed(0)}%)`} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px',
      background: alerta ? `rgba(${pct >= 90 ? '239,68,68' : '245,200,66'},.15)` : 'var(--s2)',
      border: `1px solid ${color}`, borderRadius: 20, fontSize: '.72rem', cursor: 'default',
    }}>
      <span style={{ color, fontWeight: 700 }}>💥 {kgActual.toFixed(2)}kg</span>
      <span style={{ color: 'var(--tx2)' }}>/ {kgLimite}kg</span>
      {pct >= 100
        ? <span style={{ color: 'var(--red)', fontWeight: 800 }}>🚨 SUPERADO</span>
        : alerta && <span style={{ color, fontWeight: 800 }}>{icono}</span>
      }
    </div>
  )
}

// ─── EMPLEADO PANEL ───────────────────────────────────────────

// ─── MODAL MIS FICHAJES ───────────────────────────────────────
function ModalFichajes({ perfil, caseta, ultimoFichaje, caja, esSoloEmpleado, onFichar, onSolicitarCierreCaja, onClose, showToast }) {
  const [semana, setSemana]     = useState(0)
  const [fichajes, setFichajes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [fichandoType, setFichandoType] = useState(null)
  const [notas, setNotas]       = useState('')
  const [showNotas, setShowNotas] = useState(false)

  const estado = calcularEstado(ultimoFichaje) // 'libre' | 'trabajando' | 'descanso'

  const getLunesSemana = (offset = 0) => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay()+6)%7) + offset*7); d.setHours(0,0,0,0); return d
  }
  const getFinSemana = (offset = 0) => {
    const d = getLunesSemana(offset); d.setDate(d.getDate()+6); d.setHours(23,59,59,999); return d
  }

  const cargar = () => {
    setLoading(true)
    getFichajesEmpleado(perfil.id, getLunesSemana(semana).toISOString(), getFinSemana(semana).toISOString())
      .then(setFichajes).finally(()=>setLoading(false))
  }
  useEffect(()=>{ cargar() },[semana])

  const turnos = calcularTurnos(fichajes)
  const totalTrabajado = turnos.filter(t=>!t.enCurso).reduce((s,t)=>s+t.minutosTrabajados,0)
  const turnoHoy = turnos.find(t=>t.enCurso)

  const [geoEstado, setGeoEstado] = useState(null) // null | 'obteniendo' | 'ok' | 'fuera' | 'error'
  const [geoMsg, setGeoMsg]       = useState('')

  const handleFichar = async (tipo) => {
    // Si va a salir y es el último empleado activo con caja abierta → debe cerrar caja primero
    if (tipo === 'SALIDA' && esSoloEmpleado && caja) {
      showToast('Debes cerrar la caja antes de salir (eres el último en la caseta)', 'error')
      setFichandoType(null)
      onSolicitarCierreCaja()
      return
    }

    setFichandoType(tipo)
    setGeoEstado(null)
    setGeoMsg('')

    // ── Geolocalización ──────────────────────────────────────
    let geoData = null
    // Solo verificar si la caseta tiene geo activado
    if (caseta.geo_activo && caseta.latitud && caseta.longitud) {
      setGeoEstado('obteniendo')
      try {
        const pos = await obtenerUbicacion()
        const verificacion = verificarUbicacion(pos.lat, pos.lng, caseta)
        geoData = { ...pos, geo_ok: verificacion.permitido }
        if (!verificacion.permitido) {
          setGeoEstado('fuera')
          setGeoMsg(verificacion.mensaje)
          setFichandoType(null)
          return  // Bloquear fichaje
        }
        setGeoEstado('ok')
        setGeoMsg(verificacion.mensaje)
      } catch(e) {
        // Si no se puede obtener ubicación → bloquear (no permitir fichar sin geo si está activo)
        setGeoEstado('error')
        setGeoMsg(e.message)
        setFichandoType(null)
        return
      }
    }
    // ────────────────────────────────────────────────────────

    try {
      const f = await fichar(perfil.id, caseta.id, tipo, notas, geoData)
      const mensajes = {
        ENTRADA:          '🟢 Entrada registrada',
        SALIDA:           '🔴 Salida registrada — ¡Hasta mañana!',
        INICIO_DESCANSO:  '☕ Descanso iniciado',
        FIN_DESCANSO:     '▶️ Volviendo al trabajo',
      }
      showToast(mensajes[tipo] || '✓ Fichaje registrado')
      onFichar({ tipo, timestamp: f.timestamp })
      setNotas('')
      setShowNotas(false)
      setGeoEstado(null)
      setGeoMsg('')
      if (tipo === 'SALIDA') { onClose(); return }
      cargar()
    } catch(e) { showToast('Error: '+e.message, 'error') }
    setFichandoType(null)
  }

  const loading2 = fichandoType !== null

  // Calcular tiempo en descanso actual si está descansando
  const minsDescansoActual = estado === 'descanso' && ultimoFichaje
    ? (Date.now() - new Date(ultimoFichaje.timestamp)) / 60000 : 0

  // Colores y textos según estado
  const estadoCfg = {
    libre:     { color: 'var(--tx2)',    bg: 'var(--s2)',                 border: 'var(--bd)',                  dot: 'var(--s3)',       label: 'Sin fichar' },
    trabajando:{ color: 'var(--green)',  bg: 'rgba(34,197,94,.08)',       border: 'rgba(34,197,94,.3)',          dot: 'var(--green)',    label: 'Trabajando' },
    descanso:  { color: 'var(--gold)',   bg: 'rgba(245,200,66,.08)',      border: 'rgba(245,200,66,.3)',         dot: 'var(--gold)',     label: 'En descanso' },
  }
  const cfg = estadoCfg[estado]

  const labelSemana = semana===0 ? 'Esta semana'
    : semana===-1 ? 'Semana pasada'
    : `${getLunesSemana(semana).toLocaleDateString('es-ES',{day:'numeric',month:'short'})} – ${getFinSemana(semana).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}`

  return (
    <div className="mo" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mc wide" style={{maxHeight:'93vh',display:'flex',flexDirection:'column'}}>
        <div className="mt-modal">⏱ Control de Presencia</div>
        <div style={{fontSize:'.8rem',color:'var(--tx2)',marginBottom:14}}>{perfil.nombre} · {caseta.nombre}</div>

        {/* ── Tarjeta de estado ── */}
        <div style={{background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:'var(--r)',padding:'14px 16px',marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:cfg.dot,flexShrink:0,
              animation:estado!=='libre'?'pulse 1.5s ease-in-out infinite':'none'}}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:'1rem',color:cfg.color}}>{cfg.label}</div>
              {ultimoFichaje&&(
                <div style={{fontSize:'.74rem',color:'var(--tx2)'}}>
                  Desde las {new Date(ultimoFichaje.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}
                  {estado==='trabajando'&&turnoHoy&&<span style={{color:'var(--green)',marginLeft:6,fontWeight:600}}>
                    · {fmtDuracion(turnoHoy.minutosTrabajados)} trabajado
                  </span>}
                  {estado==='descanso'&&<span style={{color:'var(--gold)',marginLeft:6,fontWeight:600}}>
                    · {fmtDuracion(minsDescansoActual)} de descanso
                  </span>}
                </div>
              )}
            </div>
          </div>

          {/* Nota opcional */}
          {showNotas&&(
            <input placeholder="Nota (opcional)..." value={notas} onChange={e=>setNotas(e.target.value)}
              style={{width:'100%',background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',color:'var(--tx)',padding:'7px 10px',fontSize:'.82rem',fontFamily:"'DM Sans',sans-serif",marginBottom:10,boxSizing:'border-box'}}/>
          )}

          {/* Botones de acción según estado */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {estado==='libre'&&(
              <button className="btn-p" style={{flex:1,marginTop:0,padding:'10px 0'}}
                disabled={loading2} onClick={()=>handleFichar('ENTRADA')}>
                {fichandoType==='ENTRADA'?'...':'🟢 Fichar entrada'}
              </button>
            )}
            {estado==='trabajando'&&(<>
              <button onClick={()=>handleFichar('INICIO_DESCANSO')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(245,200,66,.5)',
                background:'rgba(245,200,66,.1)',color:'var(--gold)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='INICIO_DESCANSO'?'...':'☕ Iniciar descanso'}</button>
              <button onClick={()=>handleFichar('SALIDA')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(239,68,68,.4)',
                background:'rgba(239,68,68,.1)',color:'var(--red)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='SALIDA'?'...':'🔴 Fichar salida'}</button>
            </>)}
            {estado==='descanso'&&(<>
              <button onClick={()=>handleFichar('FIN_DESCANSO')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(34,197,94,.4)',
                background:'rgba(34,197,94,.1)',color:'var(--green)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='FIN_DESCANSO'?'...':'▶️ Volver al trabajo'}</button>
              <button onClick={()=>handleFichar('SALIDA')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(239,68,68,.4)',
                background:'rgba(239,68,68,.1)',color:'var(--red)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='SALIDA'?'...':'🔴 Salida directa'}</button>
            </>)}
            {/* Feedback de geolocalización */}
          {geoEstado === 'obteniendo' && (
            <div style={{width:'100%',marginTop:6,padding:'7px 12px',background:'rgba(96,165,250,.1)',border:'1px solid rgba(96,165,250,.3)',borderRadius:'var(--rs)',fontSize:'.78rem',color:'var(--blue)',display:'flex',gap:8,alignItems:'center'}}>
              <div className="spin-sm" style={{width:14,height:14,flexShrink:0}}/>
              Verificando tu ubicación...
            </div>
          )}
          {geoEstado === 'ok' && geoMsg && (
            <div style={{width:'100%',marginTop:6,padding:'7px 12px',background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.3)',borderRadius:'var(--rs)',fontSize:'.78rem',color:'var(--green)'}}>
              📍 {geoMsg}
            </div>
          )}
          {geoEstado === 'fuera' && (
            <div style={{width:'100%',marginTop:6,padding:'9px 12px',background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.4)',borderRadius:'var(--rs)',fontSize:'.8rem',color:'var(--red)',fontWeight:600}}>
              📍 {geoMsg}
            </div>
          )}
          {geoEstado === 'error' && (
            <div style={{width:'100%',marginTop:6,padding:'9px 12px',background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.4)',borderRadius:'var(--rs)',fontSize:'.78rem',color:'var(--red)'}}>
              ⚠️ {geoMsg}
            </div>
          )}

          {/* Aviso si es el último y tiene caja abierta */}
            {(estado==='trabajando'||estado==='descanso') && esSoloEmpleado && caja && (
              <div style={{width:'100%',marginTop:4,fontSize:'.72rem',color:'var(--gold)',
                background:'rgba(245,200,66,.08)',border:'1px solid rgba(245,200,66,.2)',
                borderRadius:'var(--rs)',padding:'5px 10px',textAlign:'center'}}>
                ⚠️ Eres el único empleado — debes cerrar caja antes de salir
              </div>
            )}
            {/* Aviso si hay otros empleados activos (puede salir libremente) */}
            {(estado==='trabajando'||estado==='descanso') && !esSoloEmpleado && (
              <div style={{width:'100%',marginTop:4,fontSize:'.72rem',color:'var(--tx2)',textAlign:'center'}}>
                Hay otros compañeros trabajando — puedes salir sin cerrar caja
              </div>
            )}
            <button onClick={()=>setShowNotas(v=>!v)} title="Añadir nota" style={{
              padding:'9px 12px',borderRadius:'var(--rs)',border:'1px solid var(--bd)',
              background:showNotas?'var(--s2)':'transparent',color:'var(--tx2)',
              cursor:'pointer',fontSize:'.75rem',fontFamily:"'DM Sans',sans-serif",
            }}>📝</button>
          </div>
        </div>

        {/* ── Navegación semana ── */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <button onClick={()=>setSemana(s=>s-1)} style={{
            background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',
            padding:'6px 14px',color:'var(--tx2)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
            fontSize:'1.1rem',lineHeight:1,
          }}>‹</button>
          <span style={{flex:1,textAlign:'center',fontSize:'.85rem',fontWeight:700}}>{labelSemana}</span>
          {/* Solo se renderiza si hay semana siguiente — evita el cuadrado vacío */}
          {semana < 0
            ? <button onClick={()=>setSemana(s=>s+1)} style={{
                background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',
                padding:'6px 14px',color:'var(--tx2)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
                fontSize:'1.1rem',lineHeight:1,
              }}>›</button>
            : <div style={{width:38}} /> /* espaciador para mantener centrado el texto */
          }
          {!loading&&<span style={{fontSize:'.78rem',color:'var(--ac)',fontWeight:700,whiteSpace:'nowrap'}}>{fmtDuracion(totalTrabajado)} trabajado</span>}
        </div>

        {/* ── Lista de turnos ── */}
        <div style={{overflowY:'auto',flex:1}}>
          {loading
            ?<div className="loading-row"><div className="spin-sm"/>Cargando...</div>
            :turnos.length===0
              ?<div style={{textAlign:'center',color:'var(--tx2)',padding:30,fontSize:'.85rem'}}>Sin fichajes esta semana</div>
              :[...turnos].reverse().map((t,i)=>(
              <div key={i} style={{
                background:t.enCurso?'rgba(34,197,94,.06)':t.enDescanso?'rgba(245,200,66,.06)':'var(--s2)',
                border:`1px solid ${t.enCurso?'rgba(34,197,94,.25)':t.enDescanso?'rgba(245,200,66,.25)':'var(--bd)'}`,
                borderRadius:'var(--rs)',padding:'11px 14px',marginBottom:8,
              }}>
                {/* Fecha */}
                <div style={{fontSize:'.72rem',color:'var(--tx2)',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:'.5px'}}>
                  {new Date(t.entrada.timestamp).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'short'})}
                  {t.enCurso&&<span style={{marginLeft:8,color:t.enDescanso?'var(--gold)':'var(--green)',fontSize:'.7rem'}}>{t.enDescanso?'● En descanso':'● En curso'}</span>}
                </div>

                {/* Entrada / Salida / Duración */}
                <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:t.descansos.length>0||t.descansoEnCurso?8:0}}>
                  <div style={{textAlign:'center',minWidth:56}}>
                    <div style={{fontSize:'.62rem',color:'var(--green)',fontWeight:700,marginBottom:2}}>ENTRADA</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.4rem',lineHeight:1}}>
                      {new Date(t.entrada.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </div>
                  <div style={{flex:1,textAlign:'center'}}>
                    <div style={{fontSize:'.7rem',color:'var(--tx2)',marginBottom:2}}>trabajado</div>
                    <div style={{fontWeight:800,fontSize:'1.05rem',color:t.enCurso?'var(--green)':'var(--ac)'}}>
                      {fmtDuracion(t.minutosTrabajados)}
                    </div>
                    {t.minutosDescanso>0&&(
                      <div style={{fontSize:'.67rem',color:'var(--gold)'}}>☕ {fmtDuracion(t.minutosDescanso)} descanso</div>
                    )}
                  </div>
                  <div style={{textAlign:'center',minWidth:56}}>
                    <div style={{fontSize:'.62rem',color:'var(--red)',fontWeight:700,marginBottom:2}}>SALIDA</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.4rem',lineHeight:1,color:t.salida?'var(--tx)':'var(--tx2)'}}>
                      {t.salida?new Date(t.salida.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'—:——'}
                    </div>
                  </div>
                </div>

                {/* Descansos del turno */}
                {(t.descansos.length>0||t.descansoEnCurso)&&(
                  <div style={{borderTop:'1px dashed rgba(245,200,66,.3)',paddingTop:6,marginTop:4}}>
                    {t.descansos.map((d,j)=>(
                      <div key={j} style={{display:'flex',gap:8,fontSize:'.73rem',color:'var(--gold)',marginBottom:2}}>
                        <span>☕</span>
                        <span>{new Date(d.inicio.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                        <span style={{color:'var(--tx2)'}}>→</span>
                        <span>{new Date(d.fin.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                        <span style={{color:'var(--tx2)'}}>({fmtDuracion(d.minutos)})</span>
                      </div>
                    ))}
                    {t.descansoEnCurso&&(
                      <div style={{display:'flex',gap:8,fontSize:'.73rem',color:'var(--gold)'}}>
                        <span>☕</span>
                        <span>{new Date(t.descansoEnCurso.inicio.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                        <span style={{color:'var(--tx2)'}}>→ en curso ({fmtDuracion(t.descansoEnCurso.minutos)})</span>
                      </div>
                    )}
                  </div>
                )}

                {t.entrada.notas&&<div style={{fontSize:'.72rem',color:'var(--tx2)',marginTop:5,fontStyle:'italic'}}>📝 {t.entrada.notas}</div>}
              </div>
            ))
          }
        </div>

        <button className="btn-s" style={{marginTop:12}} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}



// ─── GENERADOR DE TICKET IMPRIMIBLE ───────────────────────────
// Configuración fiscal de la empresa — editar aquí o mover a BD
const CONFIG_EMPRESA = {
  nombre:    'Caballer',
  razonSocial: 'Caballer Pirotecnia, S.L.',
  direccion: 'C/ Ejemplo 12, 46000 Valencia',
  cif:       'B00000000',   // ← Cambiar por el CIF real
  telefono:  '',
  web:       '',
  textoLegal: 'Es imprescindible presentar el ticket para cualquier reclamación. Solo se aceptan devoluciones de artículos defectuosos, en cuyo caso será por otro igual o similar.',
  iva:       21,
}

function generarTicketHTML(datos) {
  const { items, total, metodo, cambio, caseta, perfil, fecha, ticketNum } = datos
  const iva = CONFIG_EMPRESA.iva / 100
  const baseImponible = total / (1 + iva)
  const cuotaIva = total - baseImponible
  const totalNEC = items.reduce((s, i) => s + (i.gramos_polvora || 0) * i.cantidad, 0)
  const fmtE = n => n.toFixed(2) + '€'
  const fmtFecha = d => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=80mm">
<title>Ticket ${ticketNum}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    width: 80mm;
    max-width: 80mm;
    color: #000;
    background: #fff;
    padding: 4mm;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .logo {
    text-align: center;
    font-family: Arial Black, sans-serif;
    font-size: 26px;
    font-weight: 900;
    letter-spacing: 3px;
    color: #000;
    margin: 4px 0 2px;
    text-transform: uppercase;
  }
  .logo-sub {
    text-align: center;
    font-size: 9px;
    letter-spacing: 2px;
    color: #444;
    margin-bottom: 6px;
    text-transform: uppercase;
  }
  .separator { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  .separator-solid { border: none; border-top: 1px solid #000; margin: 5px 0; }
  .empresa { text-align: center; font-size: 10px; line-height: 1.5; margin-bottom: 4px; }
  .num-fecha {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    margin: 3px 0;
  }
  .col-header {
    display: flex;
    justify-content: space-between;
    font-weight: bold;
    font-size: 10px;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
    margin-bottom: 3px;
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2px;
    font-size: 10px;
    gap: 4px;
  }
  .item-nombre { flex: 1; }
  .item-uds { width: 20px; text-align: right; flex-shrink: 0; }
  .item-precio { width: 38px; text-align: right; flex-shrink: 0; }
  .item-total { width: 38px; text-align: right; flex-shrink: 0; }
  .desglose { font-size: 10px; margin: 3px 0; }
  .desglose div { display: flex; justify-content: space-between; padding: 1px 0; }
  .total-line {
    display: flex;
    justify-content: space-between;
    font-size: 15px;
    font-weight: bold;
    margin: 4px 0;
  }
  .pago { font-size: 10px; text-align: center; margin: 3px 0; }
  .cambio { font-size: 11px; text-align: center; font-weight: bold; margin: 2px 0; }
  .legal { font-size: 9px; text-align: center; color: #444; margin-top: 5px; line-height: 1.4; }
  .glosario { font-size: 8.5px; color: #666; margin-top: 5px; border-top: 1px dashed #999; padding-top: 3px; }
  @media print {
    body { width: 80mm; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>

  <!-- LOGO CABALLER -->
  <div class="logo">★ CABALLER ★</div>
  <div class="logo-sub">Pirotecnia</div>
  <hr class="separator-solid">

  <!-- DATOS EMPRESA -->
  <div class="empresa">
    <div class="bold">${CONFIG_EMPRESA.razonSocial}</div>
    <div>${caseta?.nombre || ''}</div>
    <div>${CONFIG_EMPRESA.direccion}</div>
    <div>CIF: ${CONFIG_EMPRESA.cif}</div>
  </div>
  <hr class="separator">

  <!-- NÚMERO Y FECHA -->
  <div class="num-fecha">
    <span class="bold">${ticketNum}</span>
    <span>${fmtFecha(fecha)}</span>
  </div>
  <hr class="separator">

  <!-- CABECERA PRODUCTOS -->
  <div class="col-header">
    <span style="width:20px">Uds</span>
    <span style="flex:1;margin-left:4px">Producto</span>
    <span style="width:38px;text-align:right">Precio</span>
    <span style="width:38px;text-align:right">Subt</span>
  </div>

  <!-- LÍNEAS DE PRODUCTO -->
  ${items.map(i => `
  <div class="item">
    <span class="item-uds">${i.cantidad}</span>
    <span class="item-nombre" style="margin-left:4px">${i.nombre}</span>
    <span class="item-precio">${fmtE(i.precio)}</span>
    <span class="item-total">${fmtE(i.total_linea)}</span>
  </div>`).join('')}

  <hr class="separator">

  <!-- DESGLOSE FISCAL -->
  <div class="desglose">
    <div style="font-weight:bold;margin-bottom:2px">Desglose TOTAL:</div>
    <div><span>B.I.:</span><span>${fmtE(baseImponible)}</span></div>
    <div><span>I.V.A.(${CONFIG_EMPRESA.iva}%):</span><span>${fmtE(cuotaIva)}</span></div>
    ${totalNEC > 0 ? `<div><span>N.E.C.:</span><span>${totalNEC.toFixed(2)} g</span></div>` : ''}
  </div>
  <hr class="separator-solid">

  <!-- TOTAL -->
  <div class="total-line">
    <span>TOTAL:</span>
    <span>${fmtE(total)}</span>
  </div>
  <hr class="separator">

  <!-- PAGO -->
  <div class="pago">
    Forma de pago: <strong>${metodo === 'efectivo' ? 'Efectivo' : 'Tarjeta'}</strong>
  </div>
  ${metodo === 'efectivo' && cambio > 0 ? `<div class="cambio">Cambio: ${fmtE(cambio)}</div>` : ''}
  <div class="pago"><strong>I.V.A. incluido</strong></div>
  <hr class="separator">

  <!-- TEXTO LEGAL -->
  <div class="legal">${CONFIG_EMPRESA.textoLegal}</div>

  <!-- GLOSARIO -->
  <div class="glosario">
    Subt.*: Subtotal &nbsp;|&nbsp; B.I.*: Base Imponible<br>
    ${totalNEC > 0 ? 'N.E.C.*: Net Explosive Content (Contenido neto en explosivos)' : ''}
  </div>

</body>
</html>`
}

function imprimirTicket(datos) {
  const html = generarTicketHTML(datos)
  const ventana = window.open('', '_blank', 'width=400,height=700,scrollbars=yes')
  if (!ventana) {
    alert('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para esta página.')
    return
  }
  ventana.document.write(html)
  ventana.document.close()
  // Imprimir automáticamente tras cargar
  ventana.onload = () => {
    ventana.focus()
    ventana.print()
    // Cerrar tras imprimir (en algunos navegadores)
    ventana.onafterprint = () => ventana.close()
  }
}

export default function EmpleadoPanel({ perfil, casetas }) {
  // Fallback: si RLS impide leer casetas[], usar el join embebido en el perfil
  const caseta = casetas.find(c => c.id === perfil.caseta_id)
    ?? (perfil.casetas ? { ...perfil.casetas } : null)

  const [productos,      setProductos]      = useState([])
  const [stock,          setStock]          = useState({})
  const [ofertas,        setOfertas]        = useState([])
  const [caja,           setCaja]           = useState(null)
  const [ventas,         setVentas]         = useState([])
  const [loading,        setLoading]        = useState(true)
  const [ticket,         setTicket]         = useState([])
  const [busq,           setBusq]           = useState('')
  const [cat,            setCat]            = useState('Todos')
  const [showScan,       setShowScan]       = useState(false)
  const [showPago,       setShowPago]       = useState(false)
  const [showCierre,       setShowCierre]       = useState(false)
  const [showAperturaCaja, setShowAperturaCaja] = useState(false)
  const [showHistorial,  setShowHistorial]  = useState(false)
  const [showOk,         setShowOk]         = useState(null)
  const [toast,          setToast]          = useState(null)
  const [apertura,       setApertura]       = useState('')
  // ── Persistidos en sessionStorage para sobrevivir a cambios de página ──
  const [modoRapido,     setModoRapido]     = useState(() => sessionStorage.getItem('tpv_rapido') === '1')
  const [ticketActivo,   setTicketActivo]   = useState(() => sessionStorage.getItem('tpv_ticket') !== '0') // true por defecto
  const [tabTPV,         setTabTPV]         = useState(() => sessionStorage.getItem('tpv_tab') || 'todos')
  const [cat2,           setCat2]           = useState(() => sessionStorage.getItem('tpv_cat') || 'Todos')

  const [favoritos,      setFavoritos]      = useState(() => getFavoritos())
  const [prodModal,      setProdModal]      = useState(null)
  // Persistir panel abierto (pedidos/inventario) para que al volver no pierdan su posición
  const [showPedido,     setShowPedido]     = useState(false)
  const [showMisPedidos, setShowMisPedidos] = useState(()=>sessionStorage.getItem('tpv_panel')==='pedidos')
  const [showInventario, setShowInventario] = useState(()=>sessionStorage.getItem('tpv_panel')==='inventario')
  const [showFichajes,   setShowFichajes]   = useState(false)
  const [ultimoFichaje,  setUltimoFichaje]  = useState(null)
  const [fichajeLoading, setFichajeLoading] = useState(true)  // true mientras carga el estado del fichaje
  const [otrosActivos,   setOtrosActivos]   = useState([]) // otros empleados activos en la caseta
  const [kgPolvora,      setKgPolvora]      = useState(0)
  const [kgLimite,       setKgLimite]       = useState(10)
  const [pedidosPend,    setPedidosPend]    = useState(0)

  const showToast = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800) }

  // Persistir estado simple en sessionStorage
  useEffect(() => { sessionStorage.setItem('tpv_rapido', modoRapido ? '1' : '0') }, [modoRapido])
  useEffect(() => { sessionStorage.setItem('tpv_ticket', ticketActivo ? '1' : '0') }, [ticketActivo])
  useEffect(() => { sessionStorage.setItem('tpv_tab', tabTPV) }, [tabTPV])
  useEffect(() => { sessionStorage.setItem('tpv_cat', cat2) }, [cat2])

  const CATS = ['Todos', ...new Set(productos.map(p => p.categoria))].filter(Boolean)

  useEffect(() => {
    if (!caseta) return
    Promise.all([
      getProductos(), getStockCaseta(caseta.id),
      getOfertas(), getCajaAbierta(caseta.id),
      getKgPolvora(caseta.id), getLimitePolvora(caseta.id),
      getPedidos({ casetaId: caseta.id, activos: true }),
    ]).then(([prods, stk, ofs, cajaAbierta, kg, limite, peds]) => {
      setProductos(prods); setStock(stk); setOfertas(ofs)
      setKgPolvora(kg); setKgLimite(limite)
      setPedidosPend(peds.filter(p => p.estado === 'EN_CAMINO').length)
      if (cajaAbierta) { setCaja(cajaAbierta); getResumenCaja(cajaAbierta.id).then(setVentas) }
    }).finally(() => setLoading(false))
    // Cargar último fichaje y otros empleados activos en caseta
    getUltimoFichaje(perfil.id).then(f => { setUltimoFichaje(f); setFichajeLoading(false) }).catch(() => setFichajeLoading(false))
    getEmpleadosActivosCaseta(caseta.id, perfil.id).then(setOtrosActivos)
  }, [caseta?.id])

  // Realtime stock
  useEffect(() => {
    if (!caseta) return
    const ch = supabase.channel(`stock-${caseta.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock', filter: `caseta_id=eq.${caseta.id}` },
        payload => {
          setStock(prev => ({ ...prev, [payload.new.producto_id]: payload.new.cantidad }))
          // Recalcular kg pólvora en background
          getKgPolvora(caseta.id).then(setKgPolvora)
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [caseta?.id])

  const handleAbrirCaja = async () => {
    try {
      const c = await abrirCaja(caseta.id, perfil.id, parseFloat(apertura) || 0)
      setCaja(c); setVentas([])
    } catch (e) { showToast('Error: ' + e.message, 'error') }
  }

  const agregar = useCallback((prod, cantidad = 1) => {
    if (!puedeOperar) {
      showToast(enDescanso ? '☕ Estás en descanso — termina el descanso para vender' : '⏱ Ficha tu entrada antes de vender', 'error')
      setShowFichajes(true)
      return
    }
    if (!caja) {
      showToast('Abre la caja antes de vender', 'error')
      setShowAperturaCaja(true)
      return
    }
    const stockDisp = stock[prod.id] ?? 0
    if (stockDisp <= 0) { showToast('Sin stock disponible', 'error'); return }
    setTicket(prev => {
      const idx = prev.findIndex(i => i.id === prod.id)
      if (idx >= 0) {
        const nuevaCant = prev[idx].cantidad + cantidad
        if (nuevaCant > stockDisp) { showToast('Stock insuficiente', 'error'); return prev }
        const n = [...prev]; n[idx] = { ...n[idx], cantidad: nuevaCant }; return n
      }
      return [...prev, { ...prod, cantidad, gramos_polvora: prod.gramos_polvora || 0 }]
    })
    setShowScan(false)
  }, [stock, caja, puedeOperar, enDescanso])

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
    // Doble check en el momento de ejecutar (no en el render)
    if (!caja) { showToast('La caja está cerrada — no se puede registrar la venta', 'error'); return }
    try {
      const items = ticket.map(item => {
        const { total: totalLinea, desglose } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas)
        return {
          producto_id: item.id, nombre: item.nombre, precio_unitario: item.precio,
          cantidad: item.cantidad, total_linea: totalLinea, con_oferta: !!desglose,
          detalle_oferta: desglose ? desglose.map(d => d.tipo === 'pack' ? `${d.packs}x ${d.etiqueta}` : `${d.unidades}u normal`).join(' + ') : null,
        }
      })
      const ticketResult = await crearTicket({ cajaId: caja.id, casetaId: caseta.id, empleadoId: perfil.id, metodoPago: metodo, total, dineroDado, cambio, items })
      setStock(prev => {
        const next = { ...prev }
        ticket.forEach(i => { if (next[i.id] !== undefined) next[i.id] -= i.cantidad })
        return next
      })
      setVentas(prev => [...prev, { metodo_pago: metodo, total, perfiles: { nombre: perfil.nombre } }])
      if (modoRapido) {
        setTicket([]); setShowPago(false)
        showToast(`✓ Venta ${fmt(total)} · ${metodo === 'efectivo' ? `Cambio: ${fmt(cambio)}` : 'Tarjeta'}`)
      } else {
        const ticketData = {
          metodo, total, cambio,
          items: ticket.map(i => {
            const { total: tl } = calcularPrecio(i.id, i.cantidad, i.precio, ofertas)
            return { nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, total_linea: tl, gramos_polvora: i.gramos_polvora || 0 }
          }),
          caseta, perfil,
          fecha: new Date(),
          ticketNum: ticketResult?.numero_ticket || `TVN-${Date.now().toString().slice(-6)}`,
        }
        if (ticketActivo) setShowOk(ticketData)
        setTicket([]); setShowPago(false)
      }
    } catch (e) { showToast('Error al guardar venta: ' + e.message, 'error') }
  }

  const confirmarCierre = async (contado) => {
    try {
      await cerrarCaja(caja.id, perfil.id, contado)
      // Cerrar modales y resetear caja inmediatamente
      setShowCierre(false)
      setShowFichajes(false)
      setShowHistorial(false)
      setShowMisPedidos(false)
      setShowInventario(false)
      setShowPedido(false)
      setShowOk(null)
      sessionStorage.removeItem('tpv_panel')
      setCaja(null)
      setVentas([])
      setTicket([])
      showToast('✓ Caja cerrada correctamente')
    } catch (e) { showToast('Error cerrando caja: ' + e.message, 'error') }
  }

  if (loading) return <div className="splash"><div className="spinner" /></div>

  if (!caseta) return (
    <div className="splash" style={{ flexDirection: 'column', gap: 16, textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <div style={{ fontWeight: 700, color: 'var(--tx)' }}>Sin caseta asignada</div>
      <div style={{ fontSize: '.85rem', color: 'var(--tx2)', maxWidth: 280 }}>
        Tu usuario no tiene ninguna caseta asignada. Contacta con el administrador.
      </div>
      <button className="btn-s" style={{ marginTop: 8 }} onClick={() => supabase.auth.signOut()}>
        Cerrar sesión
      </button>
    </div>
  )

  // ── TPV ────────────────────────────────────────────────────
  const totalCajaTurno = ventas.reduce((s, v) => s + v.total, 0)

  let prodsFiltrados = productos
  if (tabTPV === 'favoritos') {
    prodsFiltrados = favoritos.map(id => productos.find(p => p.id === id)).filter(Boolean)
  } else if (tabTPV === 'todos') {
    if (cat2 !== 'Todos') prodsFiltrados = prodsFiltrados.filter(p => p.categoria === cat2)
  }
  if (busq) prodsFiltrados = prodsFiltrados.filter(p =>
    p.nombre.toLowerCase().includes(busq.toLowerCase()) || p.codigo_ean?.includes(busq)
  )

  const botonesRapidos = productos.filter(p =>
    ['mecha', 'bolsa', 'cebador'].some(kw => p.nombre.toLowerCase().includes(kw))
  ).slice(0, 4)

  const pctPolvora = kgLimite > 0 ? (kgPolvora / kgLimite) * 100 : 0

  // ── Restricciones basadas en fichaje ──────────────────────
  const estadoFichaje = calcularEstado(ultimoFichaje)
  const estaFichado   = estadoFichaje !== 'libre'
  const enDescanso    = estadoFichaje === 'descanso'
  // Mientras carga el fichaje no bloqueamos (evita falso negativo al arrancar)
  const puedeOperar   = fichajeLoading || (estaFichado && !enDescanso)
  // Para salir: si hay otros activos puede salir sin cerrar caja; si es el último, no
  const esSoloEmpleado = otrosActivos.length === 0

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">CABALLER</div>
        <div className="ti">
          <BadgeKgPolvora kgActual={kgPolvora} kgLimite={kgLimite} />
          {/* Botón fichaje compacto */}
          {(() => {
            const est = calcularEstado(ultimoFichaje)
            const dot = { libre:'var(--s3)', trabajando:'var(--green)', descanso:'var(--gold)' }[est]
            const col = { libre:'var(--tx2)', trabajando:'var(--green)', descanso:'var(--gold)' }[est]
            const anim = est !== 'libre'
            return (
              <button onClick={() => setShowFichajes(true)} title={caseta?.nombre} style={{
                display:'flex',alignItems:'center',gap:5,padding:'5px 10px',
                borderRadius:20,border:`1px solid ${anim?(est==='descanso'?'rgba(245,200,66,.4)':'rgba(34,197,94,.4)'):'var(--bd)'}`,
                background:anim?(est==='descanso'?'rgba(245,200,66,.12)':'rgba(34,197,94,.12)'):'var(--s2)',
                color:col,cursor:'pointer',fontSize:'.73rem',fontWeight:700,fontFamily:"'DM Sans',sans-serif",
              }}>
                <span style={{width:7,height:7,borderRadius:'50%',background:dot,display:'inline-block',flexShrink:0,
                  animation:anim?'pulse 1.5s ease-in-out infinite':'none'}}/>
                {caseta?.nombre?.replace('Caballer ','').replace('La Petardería ','') || 'Fichar'}
              </button>
            )
          })()}
          <button className="btn-o" style={{padding:'5px 10px',fontSize:'.75rem'}} onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>

      {/* Banner de estado — fichaje o caja */}
      {!fichajeLoading && !puedeOperar && (
        <div onClick={() => setShowFichajes(true)} style={{
          padding: '9px 14px', cursor: 'pointer',
          background: enDescanso ? 'rgba(245,200,66,.15)' : 'rgba(255,77,28,.12)',
          borderBottom: `2px solid ${enDescanso ? 'var(--gold)' : 'var(--ac)'}`,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: '.82rem', fontWeight: 700,
          color: enDescanso ? 'var(--gold)' : 'var(--ac)',
        }}>
          <span style={{ fontSize: '1.1rem' }}>{enDescanso ? '☕' : '⏱'}</span>
          <span>
            {enDescanso ? 'Estás en descanso — toca aquí para volver al trabajo'
              : 'No has fichado — toca aquí para registrar tu entrada'}
          </span>
          <span style={{ marginLeft: 'auto', opacity: .7, fontSize: '.75rem' }}>→ Fichar</span>
        </div>
      )}
      {!fichajeLoading && puedeOperar && !caja && (
        <div onClick={() => setShowAperturaCaja(true)} style={{
          padding: '9px 14px', cursor: 'pointer',
          background: 'rgba(245,200,66,.12)',
          borderBottom: '2px solid var(--gold)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: '.82rem', fontWeight: 700,
          color: 'var(--gold)',
        }}>
          <span style={{ fontSize: '1.1rem' }}>🟡</span>
          <span>Caja no abierta — toca aquí para abrir caja y poder vender</span>
          <span style={{ marginLeft: 'auto', opacity: .7, fontSize: '.75rem' }}>→ Abrir caja</span>
        </div>
      )}

      {/* Alerta pólvora prominente */}
      {pctPolvora >= 80 && (
        <div style={{
          background: pctPolvora >= 100 ? 'rgba(239,68,68,.2)' : pctPolvora >= 90 ? 'rgba(239,68,68,.15)' : 'rgba(245,200,66,.12)',
          borderBottom: `2px solid ${pctPolvora >= 90 ? 'var(--red)' : 'var(--gold)'}`,
          padding: '7px 20px', fontSize: '.8rem', fontWeight: 700,
          color: pctPolvora >= 90 ? 'var(--red)' : 'var(--gold)',
        }}>
          {pctPolvora >= 100
            ? `🚨 LÍMITE SUPERADO: ${kgPolvora.toFixed(2)} kg de ${kgLimite} kg permitidos (${pctPolvora.toFixed(0)}%) — Obligatorio reducir stock`
            : pctPolvora >= 90
            ? `⚠️ ALERTA: Pólvora al ${pctPolvora.toFixed(0)}% (${kgPolvora.toFixed(2)} kg de ${kgLimite} kg) — NO recibir más stock`
            : `⚠️ Pólvora al ${pctPolvora.toFixed(0)}% — Cerca del límite (${kgPolvora.toFixed(2)} kg de ${kgLimite} kg)`
          }
        </div>
      )}

      {/* Subbar caja — diseño compacto para móvil */}
      <div style={{ padding: '6px 12px', background: 'var(--s1)', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '.78rem', overflowX: 'auto' }}>
        {/* Info empleado + caja */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ color: 'var(--tx)', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '.8rem' }}>
            {perfil.nombre}
          </span>
          {caja ? (<>
            <span style={{ color: 'var(--tx2)', fontSize: '.75rem', whiteSpace: 'nowrap' }}>
              · <strong style={{ color: 'var(--ac)' }}>{fmt(totalCajaTurno)}</strong>
            </span>
          </>) : (
            <span style={{ color: 'var(--gold)', fontSize: '.72rem', fontWeight: 600, background: 'rgba(245,200,66,.1)', padding: '2px 7px', borderRadius: 10 }}>
              sin caja
            </span>
          )}
          {modoRapido && <span style={{ background: 'rgba(34,197,94,.15)', color: 'var(--green)', padding: '2px 6px', borderRadius: 20, fontSize: '.65rem', fontWeight: 700, flexShrink: 0 }}>⚡</span>}
        </div>
        {/* Separador */}
        <div style={{ flex: 1 }} />
        {/* Botones — con texto en escritorio, solo icono en móvil */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button className="btn-o subbar-btn" onClick={() => setShowHistorial(true)}>
            <span className="btn-icon">🧾</span><span className="btn-label"> Tickets</span>
          </button>
          <button className="btn-o subbar-btn" style={{ position: 'relative' }}
            onClick={() => { setShowMisPedidos(true); sessionStorage.setItem('tpv_panel','pedidos') }}>
            <span className="btn-icon">📋</span><span className="btn-label"> Pedidos</span>
            {pedidosPend > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--ac)', color: 'white', borderRadius: '50%', width: 14, height: 14, fontSize: '.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {pedidosPend}
              </span>
            )}
          </button>
          <button className="btn-o subbar-btn" onClick={() => setShowPedido(true)}>
            <span className="btn-icon">📤</span><span className="btn-label"> Pedir</span>
          </button>
          <button className="btn-o subbar-btn" onClick={() => { setShowInventario(true); sessionStorage.setItem('tpv_panel','inventario') }}>
            <span className="btn-icon">📊</span><span className="btn-label"> Inventario</span>
          </button>
          {caja ? (
            <button className="btn-o subbar-btn" style={{ borderColor: 'rgba(239,68,68,.3)', color: 'var(--red)' }} onClick={() => setShowCierre(true)}>
              <span className="btn-icon">🔒</span><span className="btn-label"> Cerrar caja</span>
            </button>
          ) : (
            <button className="btn-o subbar-btn" style={{ borderColor: 'rgba(34,197,94,.4)', color: 'var(--green)' }}
              onClick={() => estaFichado ? setShowAperturaCaja(true) : (showToast('Ficha tu entrada primero', 'error'), setShowFichajes(true))}>
              <span className="btn-icon">🟢</span><span className="btn-label"> Abrir caja</span>
            </button>
          )}
        </div>
      </div>

      <div className="cnt">
        <div className="tpvg">
          {/* Panel productos */}
          <div className="pp">
            <div className="srch">
              <input className="si" placeholder="Buscar producto o EAN..."
                value={busq} onChange={e => { setBusq(e.target.value); if (e.target.value) setTabTPV('todos') }} />
              <button className="bsc" onClick={() => setShowScan(true)}>📷</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bd)' }}>
              {[
                ['todos',     'Todos',                        'var(--ac)'],
                ['favoritos', `⭐ Favs (${favoritos.length})`, 'var(--gold)'],
                ['ofertas',   `🏷 Ofertas (${ofertas.length})`, 'var(--green)'],
              ].map(([k, l, color]) => (
                <button key={k} onClick={() => setTabTPV(k)} style={{
                  flex: 1, padding: '9px 4px', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${tabTPV === k ? color : 'transparent'}`,
                  color: tabTPV === k ? color : 'var(--tx2)', fontFamily: "'DM Sans',sans-serif",
                }}>{l}</button>
              ))}
            </div>

            {/* Categorías — scroll con rueda */}
            {tabTPV === 'todos' && (
              <WheelScrollDiv className="catbar">
                {CATS.map(c => (
                  <button key={c} className={`ct ${cat2 === c ? 'on' : ''}`} onClick={() => setCat2(c)}>{c}</button>
                ))}
              </WheelScrollDiv>
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
                  }}>{p.nombre}</button>
                ))}
              </div>
            )}

            {/* Grid productos */}
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
                    onFav={(id) => {
                      const nuevos = toggleFavorito(id)
                      setFavoritos([...nuevos])
                    }}
                  />
                )
              })}
              {tabTPV === 'favoritos' && favoritos.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--tx2)', padding: 30, fontSize: '.85rem' }}>
                  Pulsa ⭐ en cualquier producto para añadirlo a favoritos
                </div>
              )}
            </div>

            {/* Tab ofertas */}
            {tabTPV === 'ofertas' && (
              <div style={{ padding: 12, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                        <span style={{ fontWeight: 700, color: sinStock ? 'var(--tx2)' : 'var(--blue)', fontSize: '.95rem' }}>🎁 {o.etiqueta || o.nombre}</span>
                        <span style={{ fontWeight: 800, color: 'var(--ac)', fontSize: '1.1rem' }}>{fmt(o.precio_pack)}</span>
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--tx2)' }}>
                        {(o.productos_requeridos || []).map(r => `${r.cantidad}× ${r.nombre || productos.find(p => p.id === r.producto_id)?.nombre || '?'}`).join(' + ')}
                      </div>
                    </button>
                  )
                })}
                {[...new Map(ofertas.filter(o => !o.tipo || o.tipo === 'pack').map(o => [o.producto_id, o])).values()].map(o => {
                  const prod = productos.find(p => p.id === o.producto_id)
                  if (!prod) return null
                  const stockDisp = stock[prod.id] ?? 0
                  const sinStock = stockDisp < o.cantidad_pack
                  return (
                    <button key={o.producto_id} disabled={sinStock} onClick={() => {
                      if (sinStock) { showToast('Stock insuficiente', 'error'); return }
                      agregar(prod, o.cantidad_pack)
                      showToast(`✓ ${o.etiqueta || o.nombre} añadido`)
                    }} style={{
                      background: sinStock ? 'var(--s2)' : 'rgba(245,200,66,.08)',
                      border: `1px solid ${sinStock ? 'var(--bd)' : 'rgba(245,200,66,.35)'}`,
                      borderRadius: 'var(--rs)', padding: '13px 14px', cursor: sinStock ? 'not-allowed' : 'pointer',
                      opacity: sinStock ? .5 : 1, textAlign: 'left', fontFamily: "'DM Sans',sans-serif",
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: sinStock ? 'var(--tx2)' : 'var(--gold)', fontSize: '.95rem' }}>📦 {o.etiqueta || o.nombre}</span>
                        <span style={{ fontWeight: 800, color: 'var(--ac)', fontSize: '1.1rem' }}>{fmt(o.precio_pack)}</span>
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--tx2)' }}>
                        {prod.nombre} · {o.cantidad_pack} uds · Stock: {stockDisp}
                      </div>
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
              {detectarOfertasCombinadas(ticket, ofertas).map(o => {
                const sinOferta = (o.productos_requeridos || []).reduce((s, req) => {
                  const item = ticket.find(i => i.id === req.producto_id)
                  if (!item) return s
                  const { total: t } = calcularPrecio(item.id, req.cantidad, item.precio, ofertas)
                  return s + t
                }, 0)
                const ahorro = sinOferta - o.precio_pack
                return ahorro > 0 ? (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderTop: '1px dashed rgba(34,197,94,.3)', margin: '2px 0' }}>
                    <span style={{ fontSize: '.72rem', color: 'var(--green)', fontWeight: 600 }}>🏷 {o.etiqueta || o.nombre}</span>
                    <span style={{ fontSize: '.72rem', color: 'var(--green)', fontWeight: 700 }}>-{fmt(ahorro)}</span>
                  </div>
                ) : null
              })}
              <div className="ttr">
                <span className="ttl">TOTAL</span>
                <span className="tta">{fmt(total)}</span>
              </div>
              <button className="bfin"
                disabled={ticket.length === 0 || !puedeOperar || !caja}
                onClick={() => {
                  if (!puedeOperar) {
                    showToast(enDescanso ? '☕ Termina el descanso para cobrar' : '⏱ Ficha tu entrada para cobrar', 'error')
                    setShowFichajes(true)
                    return
                  }
                  if (!caja) { showToast('Abre la caja antes de cobrar', 'error'); setShowAperturaCaja(true); return }
                  setShowPago(true)
                }}>
                {!puedeOperar
                  ? (enDescanso ? '☕ En descanso' : '⏱ Ficha para vender')
                  : !caja ? '🟡 Abre la caja'
                  : 'Finalizar Venta →'}
              </button>
              {ticket.length > 0 && (
                <button className="bclr" onClick={() => setTicket([])}>✕ Limpiar ticket</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '.68rem', color: 'var(--tx2)', textAlign: 'center', marginTop: 8, opacity: .6 }}>
          Pulsa = +1 unidad · Mantén pulsado = selector de cantidad · ⭐ = favorito
        </div>
      </div>

      {/* ─── Modales ─── */}
      {prodModal && (
        <ModalCantidad producto={prodModal} stockDisp={stock[prodModal.id] ?? 0}
          ofertas={ofertas}
          onConfirm={qty => { agregar(prodModal, qty); setProdModal(null) }}
          onClose={() => setProdModal(null)} />
      )}
      {showScan && (
        <Scanner
          onDetect={(p, qty) => { agregar(p, qty || 1); setShowScan(false) }}
          onClose={() => setShowScan(false)}
          stock={stock} ofertas={ofertas} />
      )}
      {showPago && (
        <ModalPago total={total} onConfirm={confirmarVenta} onClose={() => setShowPago(false)}
          modoRapido={modoRapido} onToggleModoRapido={() => setModoRapido(m => !m)}
          ticketActivo={ticketActivo} onToggleTicket={() => setTicketActivo(t => !t)} />
      )}
      {showCierre && (
        <ModalCierreCaja caja={caja} caseta={caseta?.nombre} ventas={ventas}
          onClose={() => setShowCierre(false)} onCerrar={confirmarCierre} />
      )}

      {/* Modal apertura de caja */}
      {showAperturaCaja && (
        <div className="mo" onClick={e => e.target === e.currentTarget && setShowAperturaCaja(false)}>
          <div className="mc">
            <div className="mt-modal">🟢 Abrir Caja</div>
            <div style={{ fontSize: '.85rem', color: 'var(--tx2)', marginBottom: 16 }}>
              Hola <strong style={{ color: 'var(--tx)' }}>{perfil.nombre}</strong> · {caseta?.nombre}
            </div>
            <div className="fg">
              <label>Dinero inicial en caja</label>
              <input className="bi" type="number" placeholder="0,00" value={apertura}
                onChange={e => setApertura(e.target.value)} min="0" step="0.01" inputMode="decimal"
                style={{ fontSize: '1.4rem', marginBottom: 0 }} />
            </div>
            <button className="btn-p" style={{ marginTop: 16 }} onClick={async () => {
              try {
                const c = await abrirCaja(caseta.id, perfil.id, parseFloat(apertura) || 0)
                setCaja(c)
                setVentas([])
                setApertura('')
                setShowAperturaCaja(false)
                showToast('✓ Caja abierta — ya puedes vender')
              } catch (e) { showToast('Error: ' + e.message, 'error') }
            }}>Abrir caja y comenzar</button>
            <button className="btn-s" onClick={() => setShowAperturaCaja(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {showHistorial && (
        <ModalHistorial cajaId={caja.id} perfil={perfil} caseta={caseta} productos={productos} ofertas={ofertas}
          onStockChange={(delta) => setStock(prev => {
            const next = { ...prev }
            Object.entries(delta).forEach(([id, diff]) => {
              if (next[id] !== undefined) next[id] = Math.max(0, (next[id] || 0) + diff)
            })
            return next
          })}
          onClose={() => setShowHistorial(false)} />
      )}
      {showPedido && (
        <ModalPedido caseta={caseta} perfil={perfil} productos={productos} stock={stock}
          showToast={showToast}
          onClose={() => setShowPedido(false)}
          onCreado={() => { setShowPedido(false) }} />
      )}
      {showMisPedidos && (
        <ModalMisPedidos caseta={caseta} perfil={perfil} productos={productos}
          showToast={showToast}
          onClose={() => { setShowMisPedidos(false); sessionStorage.removeItem('tpv_panel'); getKgPolvora(caseta.id).then(setKgPolvora) }} />
      )}
      {showInventario && (
        <ModalInventario caseta={caseta} perfil={perfil} productos={productos} stockActual={stock}
          showToast={showToast} onClose={() => { setShowInventario(false); sessionStorage.removeItem('tpv_panel') }} />
      )}
      {showOk && (
        <div className="mo">
          <div className="mc" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎉</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.8rem', color: 'var(--green)', marginBottom: 6 }}>¡Venta Confirmada!</div>
            <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--ac)', marginBottom: 4 }}>{fmt(showOk.total)}</div>
            <div style={{ fontSize: '.83rem', color: 'var(--tx2)', marginBottom: 16 }}>
              {showOk.metodo === 'efectivo' ? `Efectivo · Cambio: ${fmt(showOk.cambio)}` : '💳 Tarjeta'}
            </div>
            {/* Botón imprimir ticket */}
            <button onClick={() => imprimirTicket(showOk)} style={{
              width: '100%', padding: '11px 0', borderRadius: 'var(--rs)', marginBottom: 10,
              background: 'var(--s2)', border: '1px solid var(--bd)',
              color: 'var(--tx)', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans',sans-serif", fontSize: '.9rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              🖨️ Imprimir ticket
            </button>
            <button className="btn-p" onClick={() => setShowOk(null)}>Nueva Venta</button>
          </div>
        </div>
      )}
      {showFichajes && (
        <ModalFichajes
          perfil={perfil} caseta={caseta}
          ultimoFichaje={ultimoFichaje}
          caja={caja}
          esSoloEmpleado={esSoloEmpleado}
          showToast={showToast}
          onFichar={(f) => {
            setUltimoFichaje(f)
            setFichajeLoading(false) // asegurar que no queda en estado "cargando"
            getEmpleadosActivosCaseta(caseta.id, perfil.id).then(setOtrosActivos)
          }}
          onSolicitarCierreCaja={() => {
            setShowFichajes(false)
            // Pequeño delay para que el modal de fichajes se desmonte antes de abrir cierre
            setTimeout(() => setShowCierre(true), 100)
          }}
          onClose={() => setShowFichajes(false)}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
