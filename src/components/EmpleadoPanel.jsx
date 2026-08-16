import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { imprimirTicket, ticketRowToDatos } from '../lib/ticket.js'
import Logo from './Logo.jsx'
import {
  getProductos, getStockCaseta, getOfertas,
  getCajaAbierta, abrirCaja, cerrarCaja,
  getResumenCaja, getRetiradas, registrarRetirada, getDevolucionesEfectivoCaja, crearTicket, getTicketsTurno, deleteTicket, updateTicket, updateTicketNota,
  getFavoritos, toggleFavorito, getFavoritosOfertas, toggleFavoritoOferta,
  getPedidos, crearPedido, confirmarRecepcionPedido, recibirItemPedido, getStockMinimos,
  crearInventario, getInventarios, confirmarInventario,
  getLimitePolvora, getNECDetalle,
  getUltimoFichaje, fichar, getFichajesEmpleado, calcularTurnos, calcularEstado, fmtDuracion,
  getEmpleadosActivosCaseta, obtenerUbicacion, verificarUbicacion,
  guardarFacturaCliente,
  registrarDevolucion, getTicketPorNumero, ajustarStockAuditado,
} from '../lib/api.js'
import ModalEditTicket from './ModalEditTicket.jsx'
import ModalClose from './ModalClose.jsx'
import { calcularPrecio, calcularTotalTicket, vecesAplicables, fmt } from '../lib/precios.js'
import { evaluarNEC, MAX_NEC_COMPRADOR } from '../lib/nec.js'
import Scanner from './Scanner.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import FacturaModal from './FacturaModal.jsx'

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

// ─── BOTÓN FLOTANTE IR AL TICKET / SUBIR ─────────────────
// Solo se muestra en móvil (≤768px via CSS).
// Estado: 'ticket' → baja al ticket | 'top' → sube al inicio
function useBtnScroll() {
  const [estado, setEstado] = useState('ticket') // 'ticket' | 'top'
  useEffect(() => {
    const onScroll = () => {
      const ticket = document.getElementById('ticket-panel')
      if (!ticket) return
      const rect = ticket.getBoundingClientRect()
      // Si el ticket ya es visible en pantalla → mostrar "subir"
      // Si está por debajo del viewport → mostrar "ir al ticket"
      setEstado(rect.top < window.innerHeight * 0.8 ? 'top' : 'ticket')
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll() // evaluar posición inicial
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return estado
}

function BtnScroll() {
  const estado = useBtnScroll()
  const handleClick = () => {
    if (estado === 'ticket') {
      const el = document.getElementById('ticket-panel')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  return (
    <button
      className="btn-scroll-flotante"
      onClick={handleClick}
      title={estado === 'ticket' ? 'Ver ticket' : 'Subir arriba'}
      aria-label={estado === 'ticket' ? 'Ver ticket' : 'Subir arriba'}
    >
      {estado === 'ticket' ? <i className="fi fi-rr-receipt"/> : <i className="fi fi-rr-angle-up"/>}
    </button>
  )
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
  if (edad === 12) return <span className="pea e12">F1 · 12+</span>
  if (edad === 16) return <span className="pea e16">F2 · 16+</span>
  return <span className="pea e18">F3 · 18+</span>
}

// Clave única de línea de ticket: permite el mismo producto pagado y de regalo a la vez
const lineKey = (i) => `${i.id}${i.regalo ? '_R' : ''}`

// ─── TICKET ITEM ─────────────────────────────────────────────
function TicketItem({ item, ofertas, onQty, onDel, onSetQty, onRegalo }) {
  const [open, setOpen] = useState(false)
  const lk = lineKey(item)
  const esRegalo = !!item.regalo
  const { total: totalCalc, desglose } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas)
  const hayOferta = !esRegalo && !!desglose
  const total = esRegalo ? 0 : totalCalc
  return (
    <div className="titem">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tin">{item.nombre}{esRegalo && <span style={{ marginLeft: 6, fontSize: '.62rem', background: 'rgba(var(--green-rgb),.18)', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 6, padding: '0 5px', fontWeight: 700 }}>REGALO</span>}</div>
        <div className="tc">
          <button className="qb" onClick={() => onQty(lk, -1)}>−</button>
          <input type="number" min="1" defaultValue={item.cantidad} key={item.cantidad}
            onFocus={e => e.target.select()}
            onBlur={e => onSetQty(lk, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            style={{ width: 38, textAlign: 'center', background: 'var(--s3)', border: '1px solid var(--bd)', borderRadius: 6, color: 'var(--tx)', fontWeight: 700, fontFamily: "'DM Sans',sans-serif", padding: '3px 2px', fontSize: '.88rem' }}
            inputMode="numeric" />
          <button className="qb" onClick={() => onQty(lk, +1)}>+</button>
          <button data-nobubble="1" onClick={() => onRegalo(lk)} title="Marcar como regalo"
            style={{ width: 26, height: 26, borderRadius: '50%', border: `1px solid ${esRegalo ? 'var(--green)' : 'var(--bd)'}`, background: esRegalo ? 'rgba(var(--green-rgb),.18)' : 'transparent', color: esRegalo ? 'var(--green)' : 'var(--tx2)', cursor: 'pointer', fontSize: '.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="fi fi-rr-gift"/>
          </button>
          {hayOferta && (
            <span className="ob" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
              OFERTA {open ? '▲' : '▼'}
            </span>
          )}
          <div className="tp2">
            <div className="tpu">{esRegalo ? 'regalo' : hayOferta ? 'con oferta' : `${fmt(item.precio)}/u.`}</div>
            <div className="tpt" style={esRegalo ? { color: 'var(--green)' } : undefined}>{esRegalo ? 'REGALO' : fmt(total)}</div>
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
      <button data-nobubble="1" onClick={() => onDel(lk)} style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--red-rgb),.1)', border: '1px solid rgba(var(--red-rgb),.25)',
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
        cursor: 'pointer', fontSize: '.85rem', padding: 0, lineHeight: 1,
      color: esFav ? 'var(--gold)' : 'rgba(var(--gold-rgb),.4)',
      }}><i className={`fi ${esFav ? 'fi-sr-star' : 'fi-rr-star'}`}/></button>
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

// ─── TARJETA OFERTA PACK ─────────────────────────────────────
// Tap → toggle (añade el pack o lo retira si ya está). Mantener pulsado →
// abre el modal de cantidad para añadir varias de golpe.
function StarOferta({ esFav, onFav }) {
  if (!onFav) return null
  return (
    <button onClick={e => { e.stopPropagation(); onFav() }} onPointerDown={e => e.stopPropagation()}
      title={esFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: esFav ? 'var(--gold)' : 'rgba(var(--gold-rgb),.4)', fontSize: '1rem' }}>
      <i className={`fi ${esFav ? 'fi-sr-star' : 'fi-rr-star'}`}/>
    </button>
  )
}

function TarjetaOfertaPack({ oferta, prod, stockDisp, qtyEnTicket, onTap, onLong, esFav, onFav }) {
  const sinStock = stockDisp < oferta.cantidad_pack
  const yaAnadida = qtyEnTicket >= oferta.cantidad_pack
  const lp = useLongPress(onTap, onLong)
  return (
    <div
      {...lp}
      style={{
        background: yaAnadida ? 'rgba(var(--green-rgb),.1)' : sinStock ? 'var(--s2)' : 'rgba(var(--gold-rgb),.08)',
        border: `1px solid ${yaAnadida ? 'rgba(var(--green-rgb),.5)' : sinStock ? 'var(--bd)' : 'rgba(var(--gold-rgb),.35)'}`,
        borderRadius: 'var(--rs)', padding: '13px 14px', cursor: sinStock ? 'not-allowed' : 'pointer',
        opacity: sinStock ? .5 : 1, textAlign: 'left', userSelect: 'none', touchAction: 'pan-y',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: sinStock ? 'var(--tx2)' : 'var(--tx)', fontSize: '.95rem' }}>
          <i className="fi fi-rr-box" style={{ color: 'var(--gold)' }}/> {prod.nombre}
          {yaAnadida && <span style={{ marginLeft: 6, fontSize: '.62rem', color: 'var(--green)', fontWeight: 700 }}>✓ en ticket</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <StarOferta esFav={esFav} onFav={onFav} />
          <span style={{ fontWeight: 800, color: 'var(--ac)', fontSize: '1.1rem' }}>{fmt(oferta.precio_pack)}</span>
        </span>
      </div>
      <div style={{ fontSize: '.74rem', color: 'var(--tx2)' }}>
        {oferta.etiqueta || oferta.nombre} · {oferta.cantidad_pack} uds · Stock: {stockDisp}
      </div>
    </div>
  )
}

// Oferta combinada en la pestaña Ofertas. Tap → toggle. Mantener pulsado →
// modal para añadir varias combinaciones de golpe.
function TarjetaOfertaComb({ oferta, productos, sinStock, yaAnadida, onTap, onLong, esFav, onFav }) {
  const reqs = oferta.productos_requeridos || []
  const bloqueada = sinStock && !yaAnadida
  const lp = useLongPress(onTap, onLong)
  return (
    <div
      {...lp}
      style={{
        background: yaAnadida ? 'rgba(var(--green-rgb),.1)' : bloqueada ? 'var(--s2)' : 'rgba(var(--blue-rgb),.1)',
        border: `1px solid ${yaAnadida ? 'rgba(var(--green-rgb),.5)' : bloqueada ? 'var(--bd)' : 'rgba(var(--blue-rgb),.4)'}`,
        borderRadius: 'var(--rs)', padding: '13px 14px', cursor: bloqueada ? 'not-allowed' : 'pointer',
        opacity: bloqueada ? .5 : 1, textAlign: 'left', userSelect: 'none', touchAction: 'pan-y',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: bloqueada ? 'var(--tx2)' : 'var(--blue)', fontSize: '.95rem' }}>
          <i className="fi fi-rr-gift" style={{ color: 'var(--blue)' }}/> {oferta.etiqueta || oferta.nombre}
          {yaAnadida && <span style={{ marginLeft: 6, fontSize: '.62rem', color: 'var(--green)', fontWeight: 700 }}>✓ en ticket</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <StarOferta esFav={esFav} onFav={onFav} />
          <span style={{ fontWeight: 800, color: 'var(--ac)', fontSize: '1.1rem' }}>{fmt(oferta.precio_pack)}</span>
        </span>
      </div>
      <div style={{ fontSize: '.74rem', color: 'var(--tx2)' }}>
        {reqs.map(r => `${r.cantidad}× ${r.nombre || productos.find(p => p.id === r.producto_id)?.nombre || '?'}`).join(' + ')}
      </div>
    </div>
  )
}

// ─── MODAL CANTIDAD ──────────────────────────────────────────
// Si `packSize > 1` (abierto desde una oferta) el número elegido son PACKS:
// se añaden qty × packSize unidades y el precio aplica la oferta.
function ModalCantidad({ producto, stockDisp, ofertas, initialQty = 1, packSize = 1, etiquetaOferta, onConfirm, onClose }) {
  const esPack = packSize > 1
  const maxSel = esPack ? Math.floor(stockDisp / packSize) : stockDisp
  const [qty, setQty] = useState(Math.max(1, Math.min(initialQty, maxSel || 1)))
  const [regalo, setRegalo] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.select(), 50) }, [])
  const unidades = qty * packSize
  const { total, desglose } = calcularPrecio(producto.id, unidades, producto.precio, ofertas)
  const hayOferta = !!desglose
  const clamp = n => Math.max(1, Math.min(maxSel || 1, n))
  const presets = esPack ? [1, 2, 3, 4, 5, 6, 8, 10] : [1, 2, 3, 4, 5, 6, 8, 10, 15, 20]
  return (
    <div className="mo">
      <div className="mc">
        <ModalClose onClose={onClose} />
        <div className="mt-modal">{esPack ? 'Añadir oferta' : 'Añadir al ticket'}</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>{producto.nombre}</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 16 }}>
          {esPack
            ? <><i className="fi fi-rr-box" style={{ color: 'var(--gold)' }}/> {etiquetaOferta ? `${etiquetaOferta} · ` : ''}{packSize} uds/oferta · Stock: {stockDisp}</>
            : <>{fmt(producto.precio)}/u. · Stock: {stockDisp}</>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
          {presets.map(n => (
            <button key={n} onClick={() => setQty(n)} disabled={n > maxSel} style={{
              padding: '8px 4px', borderRadius: 'var(--rs)',
              background: qty === n ? 'var(--ac)' : 'var(--s2)',
              border: '1px solid', borderColor: qty === n ? 'var(--ac)' : 'var(--bd)',
              color: qty === n ? 'white' : 'var(--tx)', fontWeight: 700,
              cursor: n > maxSel ? 'not-allowed' : 'pointer',
              opacity: n > maxSel ? 0.3 : 1,
              fontSize: '.9rem', fontFamily: "'DM Sans',sans-serif",
            }}>{n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button className="qb" style={{ width: 38, height: 38 }} onClick={() => setQty(q => clamp(q - 1))}>−</button>
          <input ref={inputRef} type="number" min="1" max={maxSel} value={qty}
            onChange={e => setQty(clamp(parseInt(e.target.value) || 1))}
            onFocus={e => e.target.select()}
            onKeyDown={e => e.key === 'Enter' && onConfirm(unidades)}
            style={{ flex: 1, background: 'var(--s2)', border: '2px solid var(--ac)', borderRadius: 'var(--rs)', padding: '10px', color: 'var(--tx)', fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: "'DM Sans',sans-serif" }}
            inputMode="numeric" />
          <button className="qb" style={{ width: 38, height: 38 }} onClick={() => setQty(q => clamp(q + 1))}>+</button>
        </div>
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
            <span style={{ color: 'var(--tx2)' }}>{esPack ? `${qty} oferta${qty !== 1 ? 's' : ''} = ${unidades} uds` : `${qty} × ${fmt(producto.precio)}`}</span>
            {hayOferta
              ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>Con oferta: {fmt(total)}</span>
              : <span style={{ fontWeight: 700 }}>{fmt(total)}</span>}
          </div>
        </div>
        {/* Toggle regalo: añade como línea aparte gratis (el stock baja igual) */}
        <div onClick={() => setRegalo(r => !r)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', marginBottom: 6, cursor: 'pointer' }}>
          <div style={{ width: 40, height: 22, borderRadius: 11, transition: 'all .2s', background: regalo ? 'var(--green)' : 'var(--s3)', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 3, left: regalo ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
          </div>
          <span style={{ fontSize: '.82rem', color: regalo ? 'var(--green)' : 'var(--tx2)', fontWeight: 600 }}><i className="fi fi-rr-gift"/> Añadir como regalo (gratis)</span>
        </div>
        <button className="btn-p" disabled={maxSel < 1} onClick={() => onConfirm(unidades, regalo)}>
          {regalo
            ? `Regalar ${unidades} unidad${unidades !== 1 ? 'es' : ''}`
            : esPack
              ? `Añadir ${qty} oferta${qty !== 1 ? 's' : ''} (${unidades} uds) · ${fmt(total)}`
              : `Añadir ${qty} unidad${qty !== 1 ? 'es' : ''} · ${fmt(total)}`}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL CANTIDAD OFERTA COMBINADA ─────────────────────────
// Pregunta cuántas combinaciones añadir. Cada combinación añade
// r.cantidad uds de cada producto requerido y suma precio_pack al total.
function ModalCantidadComb({ oferta, productos, stock, ticket, onConfirm, onClose }) {
  const reqs = oferta.productos_requeridos || []
  const disp = id => {
    const enTicket = ticket.filter(i => i.id === id).reduce((s, i) => s + i.cantidad, 0)
    return Math.max(0, (stock[id] ?? 0) - enTicket)
  }
  const maxSel = reqs.length ? Math.min(...reqs.map(r => Math.floor(disp(r.producto_id) / r.cantidad))) : 0
  const [qty, setQty] = useState(1)
  const clamp = n => Math.max(1, Math.min(maxSel || 1, n))
  const total = oferta.precio_pack * qty
  const presets = [1, 2, 3, 4, 5, 6, 8, 10]
  return (
    <div className="mo">
      <div className="mc">
        <ModalClose onClose={onClose} />
        <div className="mt-modal">Añadir oferta</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>
          <i className="fi fi-rr-gift" style={{ color: 'var(--blue)' }}/> {oferta.etiqueta || oferta.nombre}
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 16 }}>
          {reqs.map(r => `${r.cantidad}× ${r.nombre || productos.find(p => p.id === r.producto_id)?.nombre || '?'}`).join(' + ')} · {fmt(oferta.precio_pack)}/oferta
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
          {presets.map(n => (
            <button key={n} onClick={() => setQty(n)} disabled={n > maxSel} style={{
              padding: '8px 4px', borderRadius: 'var(--rs)',
              background: qty === n ? 'var(--ac)' : 'var(--s2)',
              border: '1px solid', borderColor: qty === n ? 'var(--ac)' : 'var(--bd)',
              color: qty === n ? 'white' : 'var(--tx)', fontWeight: 700,
              cursor: n > maxSel ? 'not-allowed' : 'pointer', opacity: n > maxSel ? 0.3 : 1,
              fontSize: '.9rem', fontFamily: "'DM Sans',sans-serif",
            }}>{n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button className="qb" style={{ width: 38, height: 38 }} onClick={() => setQty(q => clamp(q - 1))}>−</button>
          <input type="number" min="1" max={maxSel} value={qty}
            onChange={e => setQty(clamp(parseInt(e.target.value) || 1))}
            onFocus={e => e.target.select()}
            onKeyDown={e => e.key === 'Enter' && maxSel >= 1 && onConfirm(qty)}
            style={{ flex: 1, background: 'var(--s2)', border: '2px solid var(--ac)', borderRadius: 'var(--rs)', padding: '10px', color: 'var(--tx)', fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: "'DM Sans',sans-serif" }}
            inputMode="numeric" />
          <button className="qb" style={{ width: 38, height: 38 }} onClick={() => setQty(q => clamp(q + 1))}>+</button>
        </div>
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14 }}>
          <div style={{ fontSize: '.78rem', color: 'var(--tx2)', marginBottom: 4 }}>
            {qty} oferta{qty !== 1 ? 's' : ''} ={' '}
            {reqs.map(r => `${r.cantidad * qty}× ${r.nombre || productos.find(p => p.id === r.producto_id)?.nombre || '?'}`).join(' + ')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem' }}>
            <span style={{ color: 'var(--tx2)' }}>Total oferta</span>
            <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmt(total)}</span>
          </div>
        </div>
        <button className="btn-p" disabled={maxSel < 1} onClick={() => onConfirm(qty)}>
          {maxSel < 1 ? 'Stock insuficiente' : `Añadir ${qty} oferta${qty !== 1 ? 's' : ''} · ${fmt(total)}`}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL PAGO ──────────────────────────────────────────────
function ModalPago({ total, onConfirm, onClose }) {
  const [metodo, setMetodo]     = useState('')
  const [recibido, setRecibido] = useState('')
  const [loading, setLoading]   = useState(false)
  const [cliente, setCliente]   = useState(null)   // datos de factura capturados antes de cobrar
  const [showFact, setShowFact] = useState(false)
  const recibidoNum  = parseFloat(recibido) || 0
  const cambio       = metodo === 'efectivo' ? Math.max(0, recibidoNum - total) : 0
  const tarjetaMixto = metodo === 'mixto' ? Math.max(0, +(total - recibidoNum).toFixed(2)) : 0
  const puedeConfirmar = !!metodo && (
    metodo === 'tarjeta' ||
    (metodo === 'efectivo' && recibidoNum >= total) ||
    (metodo === 'mixto' && recibidoNum > 0 && recibidoNum < total)
  )

  return (
    <div className="mo">
      <div className="mc">
        <ModalClose onClose={onClose} />
        <div className="mt-modal">Finalizar Venta</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.8rem', color: 'var(--ac)', marginBottom: 16 }}>{fmt(total)}</div>
        <div className="mg2">
          <div className={`mb ${metodo === 'efectivo' ? 'on' : ''}`} onClick={() => setMetodo('efectivo')}>
            <div className="mi2"><i className="fi fi-rr-coins"/></div><div className="ml">Efectivo</div>
          </div>
          <div className={`mb ${metodo === 'tarjeta' ? 'on' : ''}`} onClick={() => setMetodo('tarjeta')}>
            <div className="mi2"><i className="fi fi-rr-credit-card"/></div><div className="ml">Tarjeta</div>
          </div>
          <div className={`mb ${metodo === 'mixto' ? 'on' : ''}`} style={{ gridColumn: '1 / -1' }} onClick={() => { setMetodo('mixto'); setRecibido('') }}>
            <div className="mi2"><i className="fi fi-rr-coins"/><i className="fi fi-rr-credit-card" style={{ marginLeft: 4 }}/></div><div className="ml">Mixto (efectivo + tarjeta)</div>
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
        {metodo === 'mixto' && (
          <>
            <div className="fg">
              <label>Efectivo (el resto va a tarjeta)</label>
              <input type="number" className="bi" style={{ fontSize: '1.5rem', marginBottom: 0 }}
                value={recibido} onChange={e => setRecibido(e.target.value)}
                placeholder="0,00" autoFocus min={0} max={total} step=".5" inputMode="decimal" />
            </div>
            <div className="cbox">
              <div className="clbl"><i className="fi fi-rr-credit-card"/> A tarjeta</div>
              <div className="camt">{fmt(tarjetaMixto)}</div>
            </div>
          </>
        )}
        {/* Factura: capturar datos del cliente antes de cobrar */}
        {cliente ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 6, borderRadius: 'var(--rs)', background: 'rgba(var(--sec-rgb),.12)', border: '1px solid var(--sec)' }}>
            <i className="fi fi-rr-file-invoice" style={{ color: 'var(--sec)' }}/>
            <span style={{ fontSize: '.78rem', color: 'var(--sec)', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Factura: {cliente.razonSocial || cliente.cif}</span>
            <button onClick={() => setCliente(null)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: '.9rem' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowFact(true)} style={{ width: '100%', padding: '9px', marginBottom: 6, borderRadius: 'var(--rs)', background: 'transparent', border: '1px solid var(--sec)', color: 'var(--sec)', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: '.82rem' }}>
            <i className="fi fi-rr-file-invoice"/> Hacer factura (datos del cliente)
          </button>
        )}
        <button className="btn-p" disabled={!puedeConfirmar || loading} onClick={async () => {
          setLoading(true)
          const pagoEfectivo = metodo === 'efectivo' ? total : metodo === 'tarjeta' ? 0 : recibidoNum
          const pagoTarjeta  = metodo === 'efectivo' ? 0 : metodo === 'tarjeta' ? total : tarjetaMixto
          const dineroDado   = metodo === 'efectivo' ? (recibidoNum || total) : metodo === 'mixto' ? recibidoNum : 0
          await onConfirm({ metodo, pagoEfectivo, pagoTarjeta, dineroDado, cambio, cliente })
          setLoading(false)
        }}>
          {loading ? 'Procesando...' : cliente ? '✓ Confirmar y facturar' : '✓ Confirmar Venta'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
      {showFact && (
        <FacturaModal confirmLabel="Usar estos datos"
          onConfirm={c => { setCliente(c); setShowFact(false) }}
          onClose={() => setShowFact(false)} />
      )}
    </div>
  )
}

// ─── MODAL RETIRADA DE CAJA ──────────────────────────────────
function ModalRetirada({ caja, perfil, caseta, onClose, onDone }) {
  const [cantidad,  setCantidad]  = useState('')
  const [motivo,    setMotivo]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [retiradas, setRetiradas] = useState([])
  const [ventas,    setVentas]    = useState([])
  const [devolucionesEf, setDevolucionesEf] = useState(0)

  useEffect(() => {
    Promise.all([
      getRetiradas(caja.id).catch(() => []),
      getResumenCaja(caja.id).catch(() => []),
      getDevolucionesEfectivoCaja(caja.id).catch(() => 0),
    ]).then(([r, v, d]) => { setRetiradas(r); setVentas(v); setDevolucionesEf(d) })
  }, [caja.id])

  const MIN_RETIRADA = 100  // mínimo por retirada
  const apertura         = caja.apertura_dinero || 0
  const totalRetiradas   = retiradas.reduce((s, r) => s + (r.cantidad || 0), 0)
  const ventasEfectivo   = ventas.reduce((s, v) => s + (v.pago_efectivo ?? (v.metodo_pago === 'efectivo' ? v.total : 0)), 0)
  // Saldo real = apertura + ventas efectivo − retiradas − devoluciones en efectivo
  const saldoActual      = apertura + ventasEfectivo - totalRetiradas - devolucionesEf
  // Máximo retirable = lo que hay por encima de la apertura (la apertura siempre debe quedar)
  const maxRetirable     = saldoActual - apertura
  const imp              = parseFloat(cantidad) || 0
  const errMin           = imp > 0 && imp < MIN_RETIRADA
  const errMax           = imp > maxRetirable
  const puedeConfirmar   = imp >= MIN_RETIRADA && !errMax && !loading

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return
    setLoading(true)
    try {
      await registrarRetirada(caja.id, caseta.id, perfil.id, imp, motivo.trim() || null, {
        nombreEmpleado: perfil.nombre,
        nombreCaseta:   caseta.nombre,
      })
      onDone()
    } catch (e) {
      alert('Error al registrar retirada: ' + e.message)
      setLoading(false)
    }
  }

  return (
    <div className="mo">
      <div className="mc">
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-coins"/> Retirada de Caja</div>

        {/* Saldo disponible */}
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 14px', marginBottom: 6, fontSize: '.82rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ color: 'var(--tx2)' }}>Total en caja ahora</span>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.4rem', color: 'var(--green)', letterSpacing: 1 }}>{fmt(saldoActual)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--tx2)' }}>Mínimo a dejar (apertura)</span>
            <span style={{ color: 'var(--tx2)', fontWeight: 600 }}>{fmt(apertura)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--bd)', fontWeight: 700 }}>
            <span>Máximo retirable</span>
            <span style={{ color: maxRetirable >= MIN_RETIRADA ? 'var(--ac)' : 'var(--red)' }}>{fmt(Math.max(0, maxRetirable))}</span>
          </div>
        </div>
        {maxRetirable < MIN_RETIRADA && (
          <div style={{ fontSize: '.8rem', color: 'var(--red)', marginBottom: 12, padding: '6px 10px', background: 'rgba(var(--red-rgb),.08)', borderRadius: 'var(--rs)' }}>
            No hay suficiente efectivo para hacer una retirada — necesitas al menos {fmt(apertura + MIN_RETIRADA)} en caja
          </div>
        )}
        <div style={{ height: 10 }} />

        {retiradas.length > 0 && (
          <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 14, fontSize: '.78rem' }}>
            <div style={{ color: 'var(--tx2)', marginBottom: 6, fontWeight: 600 }}>Retiradas anteriores este turno</div>
            {retiradas.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--bd)' }}>
                <span style={{ color: 'var(--tx2)' }}>{new Date(r.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · {r.perfiles?.nombre}</span>
                <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmt(r.cantidad)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', fontWeight: 700 }}>
              <span>Total retirado</span>
              <span style={{ color: 'var(--gold)' }}>{fmt(totalRetiradas)}</span>
            </div>
          </div>
        )}
        <div className="fg">
          <label>Importe a retirar (€) — mínimo {fmt(MIN_RETIRADA)}</label>
          <input type="number" className="bi"
            style={{ fontSize: '1.4rem', marginBottom: 0, borderColor: (errMin || errMax) && imp > 0 ? 'var(--red)' : undefined }}
            value={cantidad} onChange={e => setCantidad(e.target.value)}
            placeholder="0,00" min={MIN_RETIRADA} max={Math.max(0, maxRetirable)} step="1"
            autoFocus inputMode="decimal"
            disabled={maxRetirable < MIN_RETIRADA} />
        </div>
        {errMin && (
          <div style={{ fontSize: '.8rem', color: 'var(--red)', marginTop: 4, marginBottom: 4 }}>
            El importe mínimo por retirada es {fmt(MIN_RETIRADA)}
          </div>
        )}
        {errMax && (
          <div style={{ fontSize: '.8rem', color: 'var(--red)', marginTop: 4, marginBottom: 4 }}>
            No puedes retirar {fmt(imp)} — el máximo es {fmt(maxRetirable)} (debe quedar la apertura de {fmt(apertura)})
          </div>
        )}
        <div className="fg" style={{ marginTop: 10 }}>
          <label>Motivo (opcional)</label>
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Ej: mucho efectivo, envío a caja fuerte..." />
        </div>
        <button className="btn-p" style={{ background: 'var(--gold)', color: '#000' }}
          disabled={!puedeConfirmar}
          onClick={handleConfirmar}>
          {loading ? 'Registrando...' : 'Confirmar retirada'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL CIERRE CAJA ────────────────────────────────────────
function ModalCierreCaja({ caja, caseta, ventas, onClose, onCerrar }) {
  const [contado,   setContado]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [retiradas, setRetiradas] = useState([])
  const [devolucionesEf, setDevolucionesEf] = useState(0)

  useEffect(() => {
    getRetiradas(caja.id).then(setRetiradas).catch(() => {})
    getDevolucionesEfectivoCaja(caja.id).then(setDevolucionesEf).catch(() => {})
  }, [caja.id])

  const totalEfectivo  = ventas.reduce((s, v) => s + (v.pago_efectivo ?? (v.metodo_pago === 'efectivo' ? v.total : 0)), 0)
  const totalTarjeta   = ventas.reduce((s, v) => s + (v.pago_tarjeta ?? (v.metodo_pago === 'tarjeta' ? v.total : 0)), 0)
  const totalRetiradas = retiradas.reduce((s, r) => s + (r.cantidad || 0), 0)
  const esperado       = (caja.apertura_dinero || 0) + totalEfectivo - totalRetiradas - devolucionesEf
  const diferencia     = (parseFloat(contado) || 0) - esperado

  const filas = [
    ['Apertura',        fmt(caja.apertura_dinero || 0), 'var(--tx)'],
    ['Ventas efectivo', `+${fmt(totalEfectivo)}`,        'var(--green)'],
    ['Ventas tarjeta',  fmt(totalTarjeta),               'var(--blue)'],
    ['Total tickets',   String(ventas.length),           'var(--tx)'],
    ...(totalRetiradas > 0 ? [['Retiradas de caja', `−${fmt(totalRetiradas)}`, 'var(--gold)']] : []),
    ...(devolucionesEf > 0 ? [['Devoluciones efectivo', `−${fmt(devolucionesEf)}`, 'var(--red)']] : []),
  ]

  return (
    <div className="mo">
      <div className="mc wide">
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-lock"/> Cierre de Caja</div>
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: 13, marginBottom: 16, fontSize: '.83rem' }}>
          {filas.map(([l, v, c]) => (
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
          onClick={async () => { setLoading(true); await onCerrar(parseFloat(contado) || 0, esperado); setLoading(false) }}>
          {loading ? 'Cerrando...' : 'Confirmar cierre'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL HISTORIAL + EDICIÓN TICKETS ───────────────────────
function ModalHistorial({ cajaId, perfil, caseta, productos, ofertas, onStockChange, onClose }) {
  const [tickets, setTickets]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [expanded, setExpanded]         = useState(null)
  const [editando, setEditando]         = useState(null)
  const [busq, setBusq]                 = useState('')
  const [incidenciaTicket, setIncidenciaTicket] = useState(null)
  const [notaIncidencia, setNotaIncidencia]     = useState('')
  const [guardandoNota, setGuardandoNota]       = useState(false)
  const [facturaT, setFacturaT]                 = useState(null) // ticket al que hacer factura

  useEffect(() => {
    getTicketsTurno(cajaId).then(setTickets).finally(() => setLoading(false))
  }, [cajaId])

  // Hacer/imprimir factura de un ticket ya hecho (guarda los datos del cliente)
  const onHacerFactura = (cliente) => {
    const t = facturaT
    imprimirTicket(ticketRowToDatos(t, { caseta, productos }), { esFactura: true, cliente })
    guardarFacturaCliente(t.id, cliente).catch(() => {})
    setTickets(prev => prev.map(x => x.id === t.id
      ? { ...x, factura: true, cliente_nombre: cliente.razonSocial, cliente_cif: cliente.cif, cliente_direccion: cliente.direccion }
      : x))
    setFacturaT(null)
  }

  // Normaliza a solo alfanumérico: así el nº escaneado (p.ej. ALZ'00003 por el
  // teclado del escáner) casa con el guardado (ALZ-00003).
  const normNum = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const ticketsFiltrados = tickets.filter(t => {
    if (!busq) return true
    const b = busq.toLowerCase()
    const nb = normNum(busq)
    return (
      (nb && normNum(t.numero_ticket).includes(nb)) ||
      t.perfiles?.nombre?.toLowerCase().includes(b) ||
      fmt(t.total).includes(b) ||
      t.ticket_items?.some(i => i.nombre_producto?.toLowerCase().includes(b)) ||
      new Date(t.creado_en).toLocaleTimeString('es-ES').includes(b)
    )
  })

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este ticket? El stock se restaurará automáticamente.')) return
    try {
      await deleteTicket(id)
      setTickets(prev => prev.filter(t => t.id !== id))
    } catch (e) {
      alert(e.message || 'No se pudo eliminar el ticket.')
    }
  }

  const puedeBorrar = perfil?.es_encargado === true || perfil?.rol === 'ADMIN'

  const abrirEdicion = (t) => setEditando(t)

  // Guardar la edición (reutiliza el modal del admin). Actualiza la lista local.
  const guardarEdicionTicket = async (ticketId, nuevoTotal, items) => {
    await updateTicket(ticketId, nuevoTotal, items)
    setTickets(prev => prev.map(t => t.id === ticketId
      ? { ...t, total: nuevoTotal, ticket_items: items.map(i => ({ ...i, nombre_producto: i.nombre, precio_unitario: i.precio })) }
      : t))
  }

  const guardarIncidencia = async () => {
    if (!notaIncidencia.trim()) return
    setGuardandoNota(true)
    try {
      await updateTicketNota(incidenciaTicket.id, notaIncidencia.trim(), {
        nombreCaseta: caseta.nombre,
        numeroTicket: incidenciaTicket.numero_ticket,
      })
      setTickets(prev => prev.map(t => t.id === incidenciaTicket.id ? { ...t, notas: notaIncidencia.trim() } : t))
      setIncidenciaTicket(null); setNotaIncidencia('')
    } catch { alert('No se pudo guardar la incidencia. Contacta con el administrador.') }
    setGuardandoNota(false)
  }

  const totalTurno = tickets.reduce((s, t) => s + t.total, 0)

  return (
    <div className="mo">
      <div className="mc wide" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-receipt"/> Tickets del turno</div>

        {/* Buscador — escanea el ticket o escribe nº, empleado, producto, importe */}
        <input className="si" placeholder="Escanea el ticket o busca por nº, empleado, producto..."
          value={busq} onChange={e => setBusq(e.target.value)} autoFocus
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                          {t.numero_ticket && <span style={{ color: 'var(--ac)', fontWeight: 700, marginRight: 4 }}>{t.numero_ticket}</span>}
                          {t.factura && <span style={{ fontSize: '.6rem', background: 'rgba(var(--sec-rgb),.15)', color: 'var(--sec)', border: '1px solid var(--sec)', borderRadius: 6, padding: '0 5px', fontWeight: 700, marginRight: 4 }}>FACTURA</span>}
                          {new Date(t.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{t.perfiles?.nombre}
                          {' · '}{t.metodo_pago === 'efectivo' ? <i className="fi fi-rr-coins"/> : t.metodo_pago === 'tarjeta' ? <i className="fi fi-rr-credit-card"/> : <><i className="fi fi-rr-coins"/><i className="fi fi-rr-credit-card" style={{ marginLeft: 3 }}/></>}
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--ac)', fontSize: '1rem' }}>{fmt(t.total)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button className="btn-o" style={{ fontSize: '.7rem' }} onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                        {expanded === t.id ? 'Ocultar' : 'Ver'}
                      </button>
                      <button className="btn-o" style={{ fontSize: '.7rem' }} title="Imprimir"
                        onClick={() => imprimirTicket(ticketRowToDatos(t, { caseta, productos }))}><i className="fi fi-rr-print"/></button>
                      <button className="btn-o" style={{ fontSize: '.7rem', borderColor: 'var(--sec)', color: 'var(--sec)' }}
                        title="Hacer factura" onClick={() => setFacturaT(t)}><i className="fi fi-rr-file-invoice"/></button>
                      <button className="btn-o" style={{ fontSize: '.7rem', borderColor: t.notas ? 'var(--red)' : 'var(--gold)', color: t.notas ? 'var(--red)' : 'var(--gold)' }}
                        onClick={() => { setIncidenciaTicket(t); setNotaIncidencia(t.notas || '') }}>
                        {t.notas ? <><i className="fi fi-rr-triangle-warning"/> Incidencia</> : '+ Incidencia'}
                      </button>
                      <button className="btn-o" style={{ fontSize: '.7rem', borderColor: 'var(--ac)', color: 'var(--ac)' }}
                        title="Editar ticket" onClick={() => abrirEdicion(t)}><i className="fi fi-rr-pencil"/> Editar</button>
                      {puedeBorrar && (
                        <button className="btn-o" style={{ fontSize: '.7rem', borderColor: 'var(--red)', color: 'var(--red)' }}
                          title="Eliminar ticket" onClick={() => eliminar(t.id)}><i className="fi fi-rr-trash"/> Eliminar</button>
                      )}
                    </div>
                    {t.notas && (
                      <div style={{ marginTop: 6, fontSize: '.75rem', color: 'var(--red)', background: 'rgba(var(--red-rgb),.08)', borderRadius: 'var(--rs)', padding: '4px 8px' }}>
                        <i className="fi fi-rr-triangle-warning"/> Incidencia: {t.notas}
                      </div>
                    )}
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

      {/* Modal hacer factura de un ticket */}
      {facturaT && (
        <FacturaModal onConfirm={onHacerFactura} onClose={() => setFacturaT(null)} />
      )}

      {/* Modal incidencia */}
      {incidenciaTicket && (
        <div className="mo" style={{ zIndex: 999 }}>
          <div className="mc">
            <ModalClose onClose={() => setIncidenciaTicket(null)} />
            <div className="mt-modal"><i className="fi fi-rr-triangle-warning"/> Incidencia en ticket</div>
            <div style={{ fontSize: '.78rem', color: 'var(--tx2)', marginBottom: 12 }}>
              {incidenciaTicket.numero_ticket} · {fmt(incidenciaTicket.total)}
            </div>
            <div className="fg">
              <label>Describe el problema</label>
              <textarea value={notaIncidencia} onChange={e => setNotaIncidencia(e.target.value)}
                placeholder="Ej: cliente devolvió artículo, error de precio..."
                style={{ width: '100%', minHeight: 90, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '8px 10px', color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif", fontSize: '.85rem', resize: 'vertical' }} />
            </div>
            <button className="btn-p" disabled={guardandoNota || !notaIncidencia.trim()} onClick={guardarIncidencia}>
              {guardandoNota ? 'Guardando...' : '✓ Guardar incidencia'}
            </button>
            <button className="btn-s" onClick={() => setIncidenciaTicket(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Modal edición ticket — reutiliza el del admin */}
      {editando && (
        <ModalEditTicket ticket={editando} onClose={() => setEditando(null)} onSave={guardarEdicionTicket} />
      )}
    </div>
  )
}

// ─── BUSCADOR DE PRODUCTOS (reutilizable en devoluciones/bajas) ─
function ProductoBuscador({ productos, stock = {}, onPick, placeholder = 'Buscar o escanear EAN...', autoFocus = false }) {
  const [q, setQ] = useState('')
  const term = q.trim()
  const res = term.length >= 1
    ? productos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()) || p.codigo_ean?.includes(term)).slice(0, 8)
    : []
  // Escaneo con pistola: al pulsar Enter, si el código coincide EXACTO con un
  // único producto por EAN se añade solo; si hay varios con ese mismo EAN se
  // deja la lista abierta para elegir a mano.
  const onScan = () => {
    if (!term) return
    const exactos = productos.filter(p => p.codigo_ean === term)
    if (exactos.length === 1) { onPick(exactos[0]); setQ('') }
    else if (res.length === 1) { onPick(res[0]); setQ('') }
  }
  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <input className="si" style={{ width: '100%' }} placeholder={placeholder} value={q} autoFocus={autoFocus}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onScan() } }} />
      {res.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', maxHeight: 210, overflowY: 'auto' }}>
          {res.map(p => (
            <div key={p.id} onClick={() => { onPick(p); setQ('') }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '.83rem', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--s2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span>{p.nombre}</span>
              <span style={{ color: 'var(--tx2)', flexShrink: 0 }}>stock {stock[p.id] ?? 0}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MODAL DEVOLUCIÓN / COMPENSACIÓN ──────────────────────────
function ModalDevolucion({ caseta, perfil, caja, productos, stock, onClose, onDone, showToast }) {
  const [tipo, setTipo]           = useState('DEVOLUCION') // DEVOLUCION | COMPENSACION
  const [devueltos, setDevueltos] = useState([])           // lo que trae el cliente
  const [entregados, setEntregados] = useState([])         // lo que le das (compensación)
  const [importeManual, setImporteManual] = useState('')
  const [metodo, setMetodo]       = useState('efectivo')
  const [numeroTicket, setNumeroTicket] = useState('')
  const [ticketId, setTicketId]   = useState(null)
  const [notas, setNotas]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [buscandoTicket, setBuscandoTicket] = useState(false)

  const addDevuelto = (p) => setDevueltos(prev => {
    const i = prev.findIndex(x => x.producto_id === p.id)
    if (i >= 0) return prev.map((x, j) => j === i ? { ...x, cantidad: x.cantidad + 1 } : x)
    return [...prev, { producto_id: p.id, nombre: p.nombre, empresa: p.empresa || '', precio: p.precio, cantidad: 1, destino: 'VENDIBLE', causa: 'FABRICA' }]
  })
  const addEntregado = (p) => setEntregados(prev => {
    const i = prev.findIndex(x => x.producto_id === p.id)
    if (i >= 0) return prev.map((x, j) => j === i ? { ...x, cantidad: x.cantidad + 1 } : x)
    return [...prev, { producto_id: p.id, nombre: p.nombre, empresa: p.empresa || '', precio: p.precio, cantidad: 1 }]
  })
  const chgDev = (idx, campo, val) => setDevueltos(prev => prev.map((x, i) => i === idx ? { ...x, [campo]: val } : x))
  const chgEnt = (idx, campo, val) => setEntregados(prev => prev.map((x, i) => i === idx ? { ...x, [campo]: val } : x))
  const delDev = (idx) => setDevueltos(prev => prev.filter((_, i) => i !== idx))
  const delEnt = (idx) => setEntregados(prev => prev.filter((_, i) => i !== idx))

  const importeAuto = devueltos.reduce((s, x) => s + (x.precio || 0) * x.cantidad, 0)
  const importe = tipo === 'COMPENSACION' ? 0 : (importeManual !== '' ? (parseFloat(importeManual) || 0) : importeAuto)

  const buscarTicket = async () => {
    const num = numeroTicket.trim()
    if (!num) return
    setBuscandoTicket(true)
    try {
      const t = await getTicketPorNumero(caseta.id, num)
      if (!t) { showToast('Ticket no encontrado', 'error'); setTicketId(null) }
      else {
        setTicketId(t.id)
        if (t.numero_ticket) setNumeroTicket(t.numero_ticket)
        setDevueltos((t.ticket_items || []).map(it => {
          const prod = productos.find(p => p.id === it.producto_id)
          return { producto_id: it.producto_id, nombre: it.nombre_producto, empresa: prod?.empresa || '', precio: it.precio_unitario, cantidad: it.cantidad, destino: 'VENDIBLE', causa: 'FABRICA' }
        }))
        showToast('Ticket cargado ✓')
      }
    } catch (e) { showToast(e.message, 'error') }
    setBuscandoTicket(false)
  }

  const confirmar = async () => {
    if (devueltos.length === 0 && entregados.length === 0) { showToast('Añade al menos un producto', 'error'); return }
    if (tipo === 'DEVOLUCION' && importe > 0 && metodo === 'efectivo' && !caja) {
      showToast('Abre la caja para devolver dinero en efectivo', 'error'); return
    }
    const items = [
      ...devueltos.map(x => ({
        producto_id: x.producto_id, nombre_producto: x.nombre, empresa: x.empresa, cantidad: x.cantidad,
        precio_unitario: x.precio,
        movimiento: x.destino === 'VENDIBLE' ? 'DEVUELTO_VENDIBLE' : 'DEVUELTO_DEFECTUOSO',
        causa: x.destino === 'DEFECTUOSO' ? x.causa : null,
      })),
      ...(tipo === 'COMPENSACION' ? entregados.map(x => ({
        producto_id: x.producto_id, nombre_producto: x.nombre, empresa: x.empresa, cantidad: x.cantidad,
        precio_unitario: x.precio, movimiento: 'ENTREGADO', causa: null,
      })) : []),
    ]
    const cab = {
      caseta_id: caseta.id, caja_id: caja?.id || null, tipo,
      ticket_id: ticketId, numero_ticket: numeroTicket.trim() || null,
      importe_reembolsado: importe, metodo, notas: notas.trim() || null,
    }
    setLoading(true)
    try {
      await registrarDevolucion(cab, items, { nombreEmpleado: perfil.nombre, nombreCaseta: caseta.nombre })
      // Ajuste local de stock: vendible devuelto suma, entregado resta
      const delta = {}
      devueltos.forEach(x => { if (x.destino === 'VENDIBLE') delta[x.producto_id] = (delta[x.producto_id] || 0) + x.cantidad })
      if (tipo === 'COMPENSACION') entregados.forEach(x => { delta[x.producto_id] = (delta[x.producto_id] || 0) - x.cantidad })
      onDone && onDone(delta)
      showToast(tipo === 'COMPENSACION' ? '✓ Compensación registrada' : '✓ Devolución registrada')
      onClose()
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setLoading(false)
  }

  return (
    <div className="mo">
      <div className="mc wide" style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-undo"/> Devolución / Compensación</div>

        {/* Tipo */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[['DEVOLUCION', 'Devolución (dinero)'], ['COMPENSACION', 'Compensación (0€)']].map(([k, lbl]) => (
            <button key={k} onClick={() => setTipo(k)} style={{
              flex: 1, padding: '8px 0', borderRadius: 'var(--rs)', fontWeight: 700, cursor: 'pointer', fontSize: '.8rem',
              fontFamily: "'DM Sans',sans-serif",
              background: tipo === k ? 'var(--ac)' : 'var(--s2)',
              border: `1px solid ${tipo === k ? 'var(--ac)' : 'var(--bd)'}`,
              color: tipo === k ? '#fff' : 'var(--tx2)',
            }}>{lbl}</button>
          ))}
        </div>

        {/* Nº ticket opcional */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input className="si" style={{ flex: 1, marginBottom: 0 }} placeholder="Escanea el ticket o escribe su nº — opcional"
            value={numeroTicket} onChange={e => setNumeroTicket(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') buscarTicket() }} />
          <button className="btn-o" style={{ flexShrink: 0 }} disabled={buscandoTicket} onClick={buscarTicket}>
            {buscandoTicket ? '...' : 'Buscar'}
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Productos que devuelve el cliente */}
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', margin: '4px 0 6px' }}>Producto que devuelve el cliente</div>
          <ProductoBuscador productos={productos} stock={stock} onPick={addDevuelto} placeholder="Escanea o escribe para añadir producto devuelto..." />
          {devueltos.map((x, idx) => (
            <div key={idx} style={{ padding: '7px 0', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: '.83rem', fontWeight: 600 }}>{x.nombre}</div>
                <button className="qb" onClick={() => chgDev(idx, 'cantidad', Math.max(1, x.cantidad - 1))}>−</button>
                <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{x.cantidad}</span>
                <button className="qb" onClick={() => chgDev(idx, 'cantidad', x.cantidad + 1)}>+</button>
                <button onClick={() => delDev(idx)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(var(--red-rgb),.3)', background: 'rgba(var(--red-rgb),.1)', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                {[['VENDIBLE', 'Vuelve a stock'], ['DEFECTUOSO', 'Defectuoso']].map(([k, lbl]) => (
                  <button key={k} onClick={() => chgDev(idx, 'destino', k)} style={{
                    padding: '2px 9px', borderRadius: 12, fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    background: x.destino === k ? (k === 'DEFECTUOSO' ? 'var(--red)' : 'var(--green)') : 'var(--s2)',
                    border: `1px solid ${x.destino === k ? (k === 'DEFECTUOSO' ? 'var(--red)' : 'var(--green)') : 'var(--bd)'}`,
                    color: x.destino === k ? '#fff' : 'var(--tx2)',
                  }}>{lbl}</button>
                ))}
                {x.destino === 'DEFECTUOSO' && [['FABRICA', 'Defecto fábrica'], ['PROPIA', 'Rotura nuestra']].map(([k, lbl]) => (
                  <button key={k} onClick={() => chgDev(idx, 'causa', k)} style={{
                    padding: '2px 9px', borderRadius: 12, fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    background: x.causa === k ? 'var(--gold)' : 'var(--s2)',
                    border: `1px solid ${x.causa === k ? 'var(--gold)' : 'var(--bd)'}`,
                    color: x.causa === k ? '#000' : 'var(--tx2)',
                  }}>{lbl}</button>
                ))}
              </div>
            </div>
          ))}

          {/* Productos que entregas (solo compensación) */}
          {tipo === 'COMPENSACION' && (
            <>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', margin: '12px 0 6px' }}>Producto que entregas (gratis)</div>
              <ProductoBuscador productos={productos} stock={stock} onPick={addEntregado} placeholder="+ Añadir producto entregado..." />
              {entregados.map((x, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--bd)' }}>
                  <div style={{ flex: 1, fontSize: '.83rem', fontWeight: 600 }}>{x.nombre}</div>
                  <button className="qb" onClick={() => chgEnt(idx, 'cantidad', Math.max(1, x.cantidad - 1))}>−</button>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{x.cantidad}</span>
                  <button className="qb" onClick={() => chgEnt(idx, 'cantidad', x.cantidad + 1)}>+</button>
                  <button onClick={() => delEnt(idx)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(var(--red-rgb),.3)', background: 'rgba(var(--red-rgb),.1)', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </>
          )}

          <div className="fg" style={{ marginTop: 12 }}>
            <label>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: 3 de 5 fallaron" />
          </div>
        </div>

        {/* Reembolso (solo devolución) */}
        {tipo === 'DEVOLUCION' && (
          <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 12px', margin: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <label style={{ fontSize: '.8rem', color: 'var(--tx2)', flex: 1 }}>Importe a devolver</label>
              <input type="number" inputMode="decimal" step="0.5" style={{ width: 90, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '5px', textAlign: 'right', fontWeight: 700 }}
                value={importeManual === '' ? importeAuto.toFixed(2) : importeManual}
                onChange={e => setImporteManual(e.target.value)} />
              <span style={{ fontWeight: 700 }}>€</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta']].map(([k, lbl]) => (
                <button key={k} onClick={() => setMetodo(k)} style={{
                  flex: 1, padding: '6px 0', borderRadius: 'var(--rs)', fontWeight: 700, cursor: 'pointer', fontSize: '.78rem', fontFamily: "'DM Sans',sans-serif",
                  background: metodo === k ? 'var(--ac)' : 'var(--s1)',
                  border: `1px solid ${metodo === k ? 'var(--ac)' : 'var(--bd)'}`,
                  color: metodo === k ? '#fff' : 'var(--tx2)',
                }}>{lbl}</button>
              ))}
            </div>
            {metodo === 'efectivo' && importe > 0 && <div style={{ fontSize: '.72rem', color: 'var(--tx2)', marginTop: 6 }}>Saldrá de la caja y se reflejará en el cierre.</div>}
          </div>
        )}

        <button className="btn-p" disabled={loading} onClick={confirmar}>
          {loading ? 'Guardando...' : tipo === 'COMPENSACION' ? '✓ Registrar compensación' : `✓ Registrar devolución${importe > 0 ? ` (${fmt(importe)})` : ''}`}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL BAJA / ROTURA INTERNA ──────────────────────────────
function ModalBaja({ caseta, perfil, caja, productos, stock, onClose, onDone, showToast }) {
  const [items, setItems]   = useState([])
  const [notas, setNotas]   = useState('')
  const [loading, setLoading] = useState(false)

  const add = (p) => setItems(prev => {
    const i = prev.findIndex(x => x.producto_id === p.id)
    if (i >= 0) return prev.map((x, j) => j === i ? { ...x, cantidad: x.cantidad + 1 } : x)
    return [...prev, { producto_id: p.id, nombre: p.nombre, empresa: p.empresa || '', cantidad: 1, causa: 'PROPIA' }]
  })
  const chg = (idx, campo, val) => setItems(prev => prev.map((x, i) => i === idx ? { ...x, [campo]: val } : x))
  const del = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const confirmar = async () => {
    if (items.length === 0) { showToast('Añade al menos un producto', 'error'); return }
    const payloadItems = items.map(x => ({
      producto_id: x.producto_id, nombre_producto: x.nombre, empresa: x.empresa,
      cantidad: x.cantidad, precio_unitario: null, movimiento: 'BAJA', causa: x.causa,
    }))
    const cab = {
      caseta_id: caseta.id, caja_id: caja?.id || null, tipo: 'BAJA',
      ticket_id: null, numero_ticket: null, importe_reembolsado: 0, metodo: 'efectivo', notas: notas.trim() || null,
    }
    setLoading(true)
    try {
      await registrarDevolucion(cab, payloadItems, { nombreEmpleado: perfil.nombre, nombreCaseta: caseta.nombre })
      const delta = {}
      items.forEach(x => { delta[x.producto_id] = (delta[x.producto_id] || 0) - x.cantidad })
      onDone && onDone(delta)
      showToast('✓ Baja registrada')
      onClose()
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setLoading(false)
  }

  return (
    <div className="mo">
      <div className="mc wide" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-box-open"/> Baja / rotura de producto</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 10 }}>
          Producto roto o defectuoso antes de venderlo. Sale del stock y va a defectuosos.
        </div>
        <ProductoBuscador productos={productos} stock={stock} onPick={add} autoFocus placeholder="Escanea con la pistola o escribe para añadir..." />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {items.map((x, idx) => (
            <div key={idx} style={{ padding: '7px 0', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, fontSize: '.83rem', fontWeight: 600 }}>{x.nombre}<span style={{ color: 'var(--tx2)', fontWeight: 400 }}> · stock {stock[x.producto_id] ?? 0}</span></div>
                <button className="qb" onClick={() => chg(idx, 'cantidad', Math.max(1, x.cantidad - 1))}>−</button>
                <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{x.cantidad}</span>
                <button className="qb" onClick={() => chg(idx, 'cantidad', x.cantidad + 1)}>+</button>
                <button onClick={() => del(idx)} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(var(--red-rgb),.3)', background: 'rgba(var(--red-rgb),.1)', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                {[['FABRICA', 'Defecto fábrica'], ['PROPIA', 'Rotura nuestra']].map(([k, lbl]) => (
                  <button key={k} onClick={() => chg(idx, 'causa', k)} style={{
                    padding: '2px 9px', borderRadius: 12, fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    background: x.causa === k ? 'var(--gold)' : 'var(--s2)',
                    border: `1px solid ${x.causa === k ? 'var(--gold)' : 'var(--bd)'}`,
                    color: x.causa === k ? '#000' : 'var(--tx2)',
                  }}>{lbl}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="fg" style={{ marginTop: 12 }}>
            <label>Notas (opcional)</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: se cayeron al montar la tienda" />
          </div>
        </div>
        <button className="btn-p" disabled={loading} onClick={confirmar}>{loading ? 'Guardando...' : '✓ Registrar baja'}</button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL AJUSTAR STOCK (encargados) ─────────────────────────
function ModalAjusteStock({ caseta, perfil, productos, stock, onClose, onDone, showToast }) {
  const [prod, setProd]     = useState(null)
  const [nueva, setNueva]   = useState('')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  const pick = (p) => { setProd(p); setNueva(String(stock[p.id] ?? 0)) }
  const actual   = prod ? (stock[prod.id] ?? 0) : 0
  const nuevaNum = Math.max(0, parseInt(nueva) || 0)
  const delta    = nuevaNum - actual

  const guardar = async () => {
    if (!prod || delta === 0) { showToast('No hay cambio que guardar', 'error'); return }
    setLoading(true)
    try {
      await ajustarStockAuditado(prod.id, caseta.id, delta, motivo)
      onDone && onDone({ [prod.id]: delta })
      showToast(`✓ ${prod.nombre}: stock → ${nuevaNum}`)
      setProd(null); setNueva(''); setMotivo('')
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setLoading(false)
  }

  return (
    <div className="mo">
      {/* overflow visible: el desplegable del buscador es absolute y, con el
          overflow-y:auto por defecto de .mc, generaba un scrollbar interno raro */}
      <div className="mc" style={{ overflow: 'visible' }}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-refresh"/> Ajustar stock</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 10 }}>{caseta.nombre} · corrige el stock real de un producto</div>
        {!prod ? (
          <ProductoBuscador productos={productos} stock={stock} onPick={pick} autoFocus placeholder="Escanea o busca el producto a corregir..." />
        ) : (
          <>
            <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{prod.nombre}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>Stock actual en el sistema: <strong>{actual}</strong></div>
            </div>
            <div className="fg">
              <label>Stock real (corregido)</label>
              <input type="number" className="bi" style={{ fontSize: '1.4rem', marginBottom: 0 }} value={nueva} min={0} inputMode="numeric" autoFocus onChange={e => setNueva(e.target.value)} />
            </div>
            {delta !== 0 && <div style={{ fontSize: '.8rem', color: delta > 0 ? 'var(--green)' : 'var(--red)', margin: '4px 0', fontWeight: 700 }}>{delta > 0 ? `+${delta}` : delta} respecto al sistema</div>}
            <div className="fg" style={{ marginTop: 8 }}>
              <label>Motivo (opcional)</label>
              <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: descuadre, recuento..." />
            </div>
            <button className="btn-p" disabled={loading || delta === 0} onClick={guardar}>{loading ? 'Guardando...' : '✓ Guardar ajuste'}</button>
            <button className="btn-s" onClick={() => { setProd(null); setNueva(''); setMotivo('') }}>Elegir otro producto</button>
          </>
        )}
        {!prod && <button className="btn-s" onClick={onClose}>Cerrar</button>}
      </div>
    </div>
  )
}

// ─── MODAL AJUSTES ────────────────────────────────────────────
function ModalAjustes({ modoRapido, onToggleModoRapido, noImprimir, onToggleNoImprimir, modalAlEscanear, onToggleModalEscanear, onClose }) {
  const ToggleRow = ({ on, onToggle, color, icon, label, desc }) => (
    <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 4px', cursor: 'pointer', borderBottom: '1px solid var(--bd)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '.88rem', fontWeight: 700 }}><i className={`fi ${icon}`}/> {label}</div>
        {desc && <div style={{ fontSize: '.72rem', color: 'var(--tx2)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? color : 'var(--s3)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
        <div style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
      </div>
    </div>
  )
  return (
    <div className="mo">
      <div className="mc">
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-settings"/> Ajustes</div>
        <div style={{ fontSize: '.78rem', color: 'var(--tx2)', marginBottom: 8 }}>Preferencias de este dispositivo.</div>
        <ToggleRow on={modoRapido} onToggle={onToggleModoRapido} color="var(--green)" icon="fi-rr-bolt" label="Venta rápida" desc="Al cobrar, imprime el ticket y sigue sin confirmación." />
        <ToggleRow on={noImprimir} onToggle={onToggleNoImprimir} color="var(--red)" icon="fi-rr-ban" label="No imprimir tickets" desc="No saca papel al cobrar (sin ticket)." />
        <ToggleRow on={modalAlEscanear} onToggle={onToggleModalEscanear} color="var(--ac)" icon="fi-rr-barcode" label="Modal de cantidad al escanear" desc="Si está apagado, escanear añade 1 unidad directa." />
        <div style={{ marginTop: 6 }}>
          <ThemeToggle variant="item" />
        </div>
        <button className="btn-s" style={{ marginTop: 12 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

// ─── MODAL PEDIDO ─────────────────────────────────────────────
export function ModalPedido({ caseta, perfil, productos, stock, stockMinimos = {}, pedidosActivosProdIds = new Set(), itemsIniciales = null, onClose, onCreado, showToast }) {
  const [items, setItems] = useState(() => {
    // Si hay borrador guardado, usarlo directamente
    if (itemsIniciales && itemsIniciales.length > 0) return itemsIniciales
    // Si no, calcular auto items
    const auto = Object.entries(stockMinimos)
      .filter(([prodId, min]) => min > 0 && (stock[prodId] ?? 0) < min && !pedidosActivosProdIds.has(prodId))
      .map(([prodId, min]) => {
        const p = productos.find(pr => pr.id === prodId)
        if (!p) return null
        const diff = Math.max(1, min - (stock[prodId] ?? 0))
        const fardoSize = Math.max(1, p.fardo || 1)
        const cantidad = Math.ceil(diff / fardoSize) * fardoSize
        return { producto_id: prodId, nombre: p.nombre, cantidad, fardo: fardoSize, origen: 'auto' }
      })
      .filter(Boolean)
    return auto
  })
  const [notas, setNotas]       = useState('')
  const [busq, setBusq]         = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [vista, setVista]       = useState('catalogo') // 'catalogo' | 'pedido'
  const [loading, setLoading]   = useState(false)
  const [unidadSel, setUnidadSel] = useState({}) // nivel de embalaje elegido por producto en el catálogo

  const cats = ['Todos', ...new Set(productos.map(p => p.categoria).sort())]

  const prodsFiltrados = productos.filter(p => {
    const bOk = !busq || p.nombre.toLowerCase().includes(busq.toLowerCase()) || p.codigo_ean?.includes(busq)
    const cOk = catFiltro === 'Todos' || p.categoria === catFiltro
    return bOk && cOk
  }).sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'))

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
      return [...prev, { producto_id: p.id, nombre: p.nombre, cantidad: delta, fardo: Math.max(1, p.fardo || 1), origen: 'manual' }]
    })
  }

  const setQty = (id, val) => {
    const q = Math.max(0, parseInt(val) || 0)
    if (q === 0) setItems(prev => prev.filter(i => i.producto_id !== id))
    else setItems(prev => prev.map(i => i.producto_id === id ? { ...i, cantidad: q } : i))
  }

  const del = (id) => setItems(prev => prev.filter(i => i.producto_id !== id))

  // ── Embalajes: niveles disponibles de un producto ──
  // unidad de venta → envase (= fardo uds) → caja de almacén (= envases_por_caja envases)
  const nivelesDe = (prod) => {
    const niveles = [{ key: 'unidad', label: 'Unidad', size: 1 }]
    const udsEnv = Math.max(1, prod?.fardo || 1)        // uds de venta por envase
    if (udsEnv > 1) niveles.push({ key: 'envase', label: 'Envase', size: udsEnv })
    const epc = prod?.envases_por_caja || 0             // envases por caja de almacén
    if (epc > 0) niveles.push({ key: 'caja', label: 'Caja', size: udsEnv * epc })
    return niveles
  }
  const sizeDe = (prod, unidad) => nivelesDe(prod).find(n => n.key === unidad)?.size || 1
  // Cambiar el nivel de pedido: ajusta la cantidad a un múltiplo entero del nuevo embalaje
  const setUnidadPedido = (id, prod, unidad) => {
    const size = sizeDe(prod, unidad)
    setItems(prev => prev.map(i => i.producto_id === id
      ? { ...i, unidadPedido: unidad, cantidad: Math.max(size, Math.ceil(i.cantidad / size) * size) }
      : i))
  }
  // Fijar la cantidad expresada en el nivel elegido (envases/cajas/unidades)
  const setQtyEnUnidad = (id, val, size) => {
    const n = Math.max(0, parseInt(val) || 0)
    if (n === 0) setItems(prev => prev.filter(i => i.producto_id !== id))
    else setItems(prev => prev.map(i => i.producto_id === id ? { ...i, cantidad: n * size } : i))
  }
  // Nivel de embalaje activo de un producto (item en pedido, o selección de catálogo, o 'unidad')
  const unidadActual = (p) => {
    const it = items.find(i => i.producto_id === p.id)
    const u = it?.unidadPedido || unidadSel[p.id] || 'unidad'
    return nivelesDe(p).some(n => n.key === u) ? u : 'unidad'
  }
  // Elegir nivel desde el catálogo (recuerda la selección y reajusta si ya está en el pedido)
  const elegirUnidad = (p, key) => {
    setUnidadSel(prev => ({ ...prev, [p.id]: key }))
    const size = sizeDe(p, key)
    setItems(prev => prev.map(i => i.producto_id === p.id
      ? { ...i, unidadPedido: key, cantidad: Math.max(size, Math.ceil(i.cantidad / size) * size) }
      : i))
  }
  // Añadir/quitar N en el nivel activo (envases, cajas o unidades)
  const addEnUnidad = (p, deltaUnidades) => {
    const unidad = unidadActual(p)
    const size = sizeDe(p, unidad)
    setItems(prev => {
      const idx = prev.findIndex(i => i.producto_id === p.id)
      if (idx >= 0) {
        const nueva = prev[idx].cantidad + deltaUnidades * size
        if (nueva <= 0) return prev.filter(i => i.producto_id !== p.id)
        const n = [...prev]; n[idx] = { ...n[idx], cantidad: nueva, unidadPedido: unidad }; return n
      }
      if (deltaUnidades <= 0) return prev
      return [...prev, { producto_id: p.id, nombre: p.nombre, cantidad: deltaUnidades * size, fardo: Math.max(1, p.fardo || 1), unidadPedido: unidad, origen: 'manual' }]
    })
  }

  const enviar = async () => {
    if (items.length === 0) { showToast('Añade al menos un producto', 'error'); return }
    setLoading(true)
    try {
      await crearPedido(caseta.id, perfil.id, items, notas, { nombreEmpleado: perfil.nombre, nombreCaseta: caseta.nombre })
      showToast('✓ Pedido enviado al administrador')
      onCreado()
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setLoading(false)
  }

  return (
    <div className="mo">
      <div className="mc wide" style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        <ModalClose onClose={() => onClose(items)} />
        <div className="mt-modal"><i className="fi fi-rr-truck-side"/> Nuevo Pedido</div>
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
          }}><i className="fi fi-rr-box"/> Ver productos y stock</button>
          <button onClick={() => setVista('pedido')} style={{
            flex: 1, padding: '9px 4px', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer',
            background: 'transparent', border: 'none', fontFamily: "'DM Sans',sans-serif",
            borderBottom: `2px solid ${vista === 'pedido' ? 'var(--ac)' : 'transparent'}`,
            color: vista === 'pedido' ? 'var(--ac)' : 'var(--tx2)',
          }}>
            <i className="fi fi-rr-paper-plane"/> Mi pedido {items.length > 0 && <span style={{ background: 'var(--ac)', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: '.7rem', marginLeft: 4 }}>{items.reduce((s, i) => s + i.cantidad, 0)}</span>}
          </button>
        </div>

        {/* ── VISTA CATÁLOGO ── */}
        {vista === 'catalogo' && (
          <>
            {/* Buscador */}
            <input className="si" placeholder="Buscar o escanear EAN..."
              value={busq} onChange={e => setBusq(e.target.value)} style={{ marginBottom: 8 }}
              onKeyDown={e => {
                if (e.key !== 'Enter' || prodsFiltrados.length === 0) return
                const prod = prodsFiltrados[0]
                addItem(prod, 1)
                setBusq('')
              }} />

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
                const niveles = nivelesDe(p)
                const unidad = unidadActual(p)
                const size = sizeDe(p, unidad)
                const qtyUnit = enPedido > 0 ? Math.max(1, Math.round(enPedido / size)) : 0
                return (
                  <div key={p.id} style={{
                    padding: '9px 8px', borderBottom: '1px solid var(--bd)', borderRadius: 'var(--rs)',
                    // Atenuado solo si está agotado Y NO está en el pedido. Al añadirlo se ilumina.
                    opacity: (stockDisp === 0 && enPedido === 0) ? .55 : 1,
                    background: enPedido > 0 ? 'rgba(var(--ac-rgb),.08)' : 'transparent',
                    borderLeft: enPedido > 0 ? '3px solid var(--ac)' : '3px solid transparent',
                  }}>
                    {/* Fila 1: nombre + botón/controles */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                      </div>
                      {/* Controles — siempre a la derecha (en el nivel elegido) */}
                      {enPedido > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <button className="qb" style={{ width: 30, height: 30 }} onClick={() => addEnUnidad(p, -1)}>−</button>
                          <input
                            type="number" min="1" defaultValue={qtyUnit} key={`${enPedido}-${unidad}`}
                            onFocus={e => e.target.select()}
                            onBlur={e => {
                              const q = parseInt(e.target.value) || 0
                              if (q <= 0) { addItem(p, -enPedido) }
                              else setItems(prev => prev.map(i => i.producto_id === p.id ? { ...i, cantidad: q * size, unidadPedido: unidad } : i))
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                            style={{ width: 46, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--ac)', borderRadius: 'var(--rs)', color: 'var(--ac)', fontWeight: 800, fontFamily: "'DM Sans',sans-serif", padding: '4px 2px', fontSize: '.9rem' }}
                            inputMode="numeric"
                          />
                          <button className="qb" style={{ width: 30, height: 30 }} onClick={() => addEnUnidad(p, +1)}>+</button>
                        </div>
                      ) : (
                        <button onClick={() => addEnUnidad(p, 1)} style={{
                          flexShrink: 0, padding: '5px 12px', borderRadius: 'var(--rs)',
                          background: 'rgba(var(--ac-rgb),.12)', border: '1px solid var(--ac)',
                          color: 'var(--ac)', fontWeight: 700, cursor: 'pointer',
                          fontSize: '.75rem', fontFamily: "'DM Sans',sans-serif",
                        }}>+ Pedir</button>
                      )}
                    </div>
                    {/* Selector de embalaje (solo si el producto tiene envase/caja) */}
                    {niveles.length > 1 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                        {niveles.map(n => (
                          <button key={n.key} onClick={() => elegirUnidad(p, n.key)} style={{
                            padding: '2px 9px', borderRadius: 12, fontSize: '.68rem', fontWeight: 700, cursor: 'pointer',
                            fontFamily: "'DM Sans',sans-serif",
                            background: unidad === n.key ? 'var(--ac)' : 'var(--s2)',
                            border: `1px solid ${unidad === n.key ? 'var(--ac)' : 'var(--bd)'}`,
                            color: unidad === n.key ? 'white' : 'var(--tx2)',
                          }}>{n.label}{n.size > 1 ? ` (${n.size})` : ''}</button>
                        ))}
                      </div>
                    )}
                    {/* Fila 2: stock + info */}
                    <div style={{ fontSize: '.7rem', display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                      {stockDisp === 0 ? (
                        <span style={{ background: 'rgba(var(--red-rgb),.15)', border: '1px solid rgba(var(--red-rgb),.4)', color: 'var(--red)', fontWeight: 800, padding: '1px 6px', borderRadius: 8 }}><i className="fi fi-rr-cross-circle"/> Agotado</span>
                      ) : stockDisp < 10 ? (
                        <span style={{ background: 'rgba(var(--gold-rgb),.15)', border: '1px solid rgba(var(--gold-rgb),.4)', color: 'var(--gold)', fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}><i className="fi fi-rr-triangle-warning"/> {stockDisp} uds</span>
                      ) : (
                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>Stock: {stockDisp}</span>
                      )}
                      <span style={{ color: 'var(--tx2)', opacity: .7 }}>{p.categoria}</span>
                      <span style={{ color: 'var(--tx2)', opacity: .6 }}>{fmt(p.precio)}</span>
                      {enPedido > 0 && <span style={{ color: 'var(--ac)', fontWeight: 700, marginLeft: 'auto' }}>En pedido: {enPedido}</span>}
                      {items.find(i => i.producto_id === p.id)?.origen === 'auto' && enPedido > 0 && (
                        <span style={{ fontSize: '.62rem', background: 'rgba(var(--blue-rgb),.15)', color: 'var(--blue)', border: '1px solid rgba(var(--blue-rgb),.3)', borderRadius: 6, padding: '1px 5px', fontWeight: 700 }}>auto</span>
                      )}
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
              ) : [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(item => {
                const prod = productos.find(p => p.id === item.producto_id)
                const niveles = nivelesDe(prod)
                const unidad = niveles.some(n => n.key === item.unidadPedido) ? item.unidadPedido : 'unidad'
                const size = sizeDe(prod, unidad)
                const qtyUnit = Math.max(1, Math.round(item.cantidad / size))
                return (
                <div key={item.producto_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--bd)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {item.nombre}
                      {item.origen === 'auto'
                        ? <span style={{ fontSize: '.62rem', background: 'rgba(var(--blue-rgb),.15)', color: 'var(--blue)', border: '1px solid rgba(var(--blue-rgb),.3)', borderRadius: 6, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>auto</span>
                        : <span style={{ fontSize: '.62rem', background: 'rgba(144,144,168,.1)', color: 'var(--tx2)', border: '1px solid rgba(144,144,168,.2)', borderRadius: 6, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>manual</span>
                      }
                    </div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx2)' }}>
                      Stock: {stock[item.producto_id] ?? 0}
                      {item.origen === 'auto' && ` · mín. ${stockMinimos[item.producto_id] || 0}`}
                      {unidad !== 'unidad' && ` · = ${item.cantidad.toLocaleString('es-ES')} uds`}
                    </div>
                    {niveles.length > 1 && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                        {niveles.map(n => (
                          <button key={n.key} onClick={() => setUnidadPedido(item.producto_id, prod, n.key)} style={{
                            padding: '2px 9px', borderRadius: 12, fontSize: '.68rem', fontWeight: 700, cursor: 'pointer',
                            fontFamily: "'DM Sans',sans-serif",
                            background: unidad === n.key ? 'var(--ac)' : 'var(--s2)',
                            border: `1px solid ${unidad === n.key ? 'var(--ac)' : 'var(--bd)'}`,
                            color: unidad === n.key ? 'white' : 'var(--tx2)',
                          }}>{n.label}{n.size > 1 ? ` (${n.size})` : ''}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="qb" onClick={() => setQtyEnUnidad(item.producto_id, qtyUnit - 1, size)}>−</button>
                  <input type="number" min="1" defaultValue={qtyUnit} key={`${item.cantidad}-${unidad}`}
                    onFocus={e => e.target.select()}
                    onBlur={e => setQtyEnUnidad(item.producto_id, e.target.value, size)}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                    style={{ width: 52, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '4px', fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}
                    inputMode="numeric" />
                  <button className="qb" onClick={() => setQtyEnUnidad(item.producto_id, qtyUnit + 1, size)}>+</button>
                  <button onClick={() => del(item.producto_id)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(var(--red-rgb),.3)', background: 'rgba(var(--red-rgb),.1)', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
                </div>
              )})}
            </div>

            <div className="fg" style={{ marginBottom: 10, marginTop: 8 }}>
              <label>Notas / Observaciones (opcional)</label>
              <input className="bi" style={{ marginBottom: 0 }} value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Ej: urgente, revisar stock de tracas..." />
            </div>

            <button className="btn-p" disabled={loading || items.length === 0} onClick={enviar}>
              {loading ? 'Enviando...' : `Enviar pedido (${items.reduce((s,i)=>s+i.cantidad,0)} uds)`}
            </button>
          </>
        )}

        <button className="btn-s" onClick={() => onClose(items)}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL MIS PEDIDOS ────────────────────────────────────────
function ModalMisPedidos({ caseta, perfil, productos, onClose, showToast, onRecibido, onStock }) {
  const [pedidos, setPedidos]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [recibiendo, setRecibiendo] = useState(null)
  const [recItems, setRecItems]     = useState([])
  const [notasRec, setNotasRec]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [scanRec, setScanRec]       = useState('')
  const [expandido, setExpandido]   = useState(null)
  const [recPicker, setRecPicker]   = useState(null)   // varias líneas con el mismo EAN → elegir cuál
  const recListRef                  = useRef(null)

  // Aplica al stock (al instante) lo recibido de una línea: calcula el delta
  // respecto a lo ya aplicado, lo manda a la BD y refresca el stock del TPV.
  // El producto queda vendible en cuanto se marca, sin esperar al resto.
  const aplicarItem = async (idx, estado, cantidadRecibida) => {
    const item = recItems[idx]
    if (!item) return
    const delta = cantidadRecibida - (item.cantidad_aplicada ?? 0)
    setRecItems(prev => prev.map((r, i) => i !== idx ? r : { ...r, estado, cantidad_recibida: cantidadRecibida }))
    try {
      const nueva = await recibirItemPedido(item.id, item.producto_id, caseta.id, delta, cantidadRecibida, item.notas_item)
      setRecItems(prev => prev.map((r, i) => i !== idx ? r : { ...r, cantidad_aplicada: cantidadRecibida }))
      // Mantener fresca la lista para que, si se cierra y reabre, no se recuente.
      setPedidos(prev => prev.map(p => p.id !== recibiendo?.id ? p : {
        ...p,
        pedido_items: (p.pedido_items || []).map(pi => pi.id !== item.id ? pi : { ...pi, cantidad_recibida: cantidadRecibida }),
      }))
      if (nueva !== null && nueva !== undefined) onStock && onStock(item.producto_id, nueva)
      if (estado === 'no_llegado') showToast(`✕ ${item.nombre}: marcado como no llegado`)
      else showToast(`✓ ${item.nombre}: ${cantidadRecibida} uds en stock`)
    } catch (e) {
      showToast('Error al actualizar stock: ' + e.message, 'error')
    }
  }

  // Marca una línea como recibida completa (escáner/selector) y aplica su stock.
  const marcarRecibido = (idx) => {
    setScanRec(''); setRecPicker(null)
    aplicarItem(idx, 'ok', recItems[idx].cantidad)
    setTimeout(() => {
      const el = recListRef.current?.querySelector(`[data-recidx="${idx}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  useEffect(() => {
    getPedidos({ casetaId: caseta.id }).then(setPedidos).finally(() => setLoading(false))
  }, [caseta.id])

  const abrirRecepcion = (pedido) => {
    setRecibiendo(pedido)
    setRecItems(pedido.pedido_items.map(i => {
      // cantidad_recibida en BD = lo ya aplicado al stock en sesiones previas.
      // null → aún sin revisar.
      const yaRec = i.cantidad_recibida
      const estado = yaRec == null ? 'pendiente'
        : yaRec === 0 ? 'no_llegado'
        : yaRec === i.cantidad ? 'ok' : 'diferencia'
      return {
        id:                i.id,
        producto_id:       i.producto_id,
        nombre:            i.productos?.nombre || '?',
        cantidad:          i.cantidad,
        cantidad_recibida: yaRec ?? i.cantidad,   // valor mostrado en el input
        cantidad_aplicada: yaRec ?? 0,            // lo realmente sumado al stock
        notas_item:        i.notas_item || '',
        estado,
      }
    }))
    setNotasRec('')
  }

  const confirmarRec = async () => {
    setSaving(true)
    try {
      // Reconcilia cualquier cantidad editada que no se llegara a aplicar
      // (p.ej. una diferencia escrita sin salir del campo).
      for (const it of recItems) {
        const delta = it.cantidad_recibida - (it.cantidad_aplicada ?? 0)
        if (delta !== 0) {
          const nueva = await recibirItemPedido(it.id, it.producto_id, caseta.id, delta, it.cantidad_recibida, it.notas_item)
          if (nueva !== null && nueva !== undefined) onStock && onStock(it.producto_id, nueva)
        }
      }
      await confirmarRecepcionPedido(recibiendo.id, caseta.id, recItems, notasRec, { nombreEmpleado: perfil.nombre, nombreCaseta: caseta.nombre })
      const hayIncidencia = notasRec?.trim() ||
        recItems.some(i => i.estado === 'no_llegado' || i.estado === 'diferencia' || i.notas_item?.trim())
      showToast(hayIncidencia ? 'Recepción con incidencias — stock actualizado' : 'Recepción confirmada, stock actualizado')
      setPedidos(prev => prev.map(p => p.id === recibiendo.id
        ? { ...p, estado: hayIncidencia ? 'INCIDENCIA' : 'RECIBIDO' }
        : p))
      setRecibiendo(null)
      onRecibido && onRecibido()
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setSaving(false)
  }

  const ESTADO_COLOR = {
    PENDIENTE:  'var(--gold)',
    ACEPTADO:   'var(--blue)',
    EN_CAMINO:  'var(--ac)',
    RECIBIDO:   'var(--green)',
    INCIDENCIA: 'var(--red)',
    RECHAZADO:  'var(--red)',
  }
  const ESTADO_ICON = {PENDIENTE:'fi-rr-clock', ACEPTADO:'fi-rr-check', EN_CAMINO:'fi-rr-truck-side', RECIBIDO:'fi-rr-box', INCIDENCIA:'fi-rr-triangle-warning', RECHAZADO:'fi-rr-cross'}
  const ESTADO_LABEL = {PENDIENTE:'Pendiente', ACEPTADO:'Aceptado', EN_CAMINO:'En camino', RECIBIDO:'Recibido', INCIDENCIA:'Incidencia', RECHAZADO:'Rechazado'}

  return (
    <div className="mo" style={recibiendo ? { background: 'transparent', backdropFilter: 'none' } : undefined}>
      <div className="mc wide" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-truck-side"/> Mis Pedidos</div>
        {loading
          ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
          : (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {pedidos.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 30 }}>Sin pedidos realizados</div>
              )}
              {pedidos.map(p => (
                <div key={p.id} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 10, border: '1px solid var(--bd)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '.88rem' }}>
                      {new Date(p.creado_en).toLocaleDateString('es-ES')}
                      <span style={{ fontWeight: 400, color: 'var(--tx2)', fontSize: '.75rem', marginLeft: 6 }}>
                        {new Date(p.creado_en).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '.82rem', color: ESTADO_COLOR[p.estado] }}>
                      <i className={`fi ${ESTADO_ICON[p.estado]}`}/>{' '}{ESTADO_LABEL[p.estado]}
                    </span>
                  </div>
                  {p.notas && <div style={{ fontSize: '.75rem', color: 'var(--tx2)', fontStyle: 'italic', marginTop: 4 }}><i className="fi fi-rr-note"/> {p.notas}</div>}
                  {p.notas_admin && <div style={{ fontSize: '.75rem', marginTop: 4, color: 'var(--blue)' }}><i className="fi fi-rr-shield"/> Admin: {p.notas_admin}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 'var(--rs)', background: 'transparent', border: '1px solid var(--bd)', color: 'var(--tx2)', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                      <i className={`fi ${expandido === p.id ? 'fi-rr-angle-up' : 'fi-rr-angle-down'}`}/>{expandido === p.id ? ' Ocultar' : ' Ver productos'}
                    </button>
                    {p.estado === 'EN_CAMINO' && (
                      <button className="btn-p" style={{ flex: 2, padding: '6px 0', fontSize: '.82rem', marginTop: 0 }}
                        onClick={() => abrirRecepcion(p)}>
                        <i className="fi fi-rr-check"/> Confirmar recepción
                      </button>
                    )}
                  </div>
                  {expandido === p.id && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--bd)', paddingTop: 10 }}>
                      {(()=>{
                        const byEmp = {}
                        ;(p.pedido_items||[]).forEach(i => {
                          const e = i.productos?.empresa || 'Sin empresa'
                          if (!byEmp[e]) byEmp[e] = []
                          byEmp[e].push(i)
                        })
                        return Object.entries(byEmp).map(([emp, items]) => (
                          <div key={emp} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--blue)', marginBottom: 3, paddingBottom: 2, borderBottom: '1px solid var(--bd)' }}>{emp}</div>
                            {items.map(i => (
                              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                                <span style={{ color: 'var(--tx)' }}>{i.productos?.nombre}</span>
                                <span style={{ color: 'var(--tx2)' }}>×<strong style={{ color: 'var(--tx)' }}>{i.cantidad}</strong></span>
                              </div>
                            ))}
                          </div>
                        ))
                      })()}
                    </div>
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
        <div className="mo" style={{ zIndex: 999 }}>
          <div className="mc wide" style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
            <ModalClose onClose={() => setRecibiendo(null)} />
            <div className="mt-modal"><i className="fi fi-rr-box"/> Confirmar Recepción</div>
            <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 4 }}>
              Marca cada producto según lo revisas: <strong style={{ color: 'var(--green)' }}>el stock se actualiza al instante</strong> y ya puedes venderlo. Al final, confirma para cerrar el pedido.
            </div>
            {/* Resumen rápido */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.75rem', background: 'rgba(var(--green-rgb),.12)', color: 'var(--green)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                ✓ {recItems.filter(i => i.estado === 'ok').length} OK
              </span>
              <span style={{ fontSize: '.75rem', background: 'rgba(var(--gold-rgb),.12)', color: 'var(--gold)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                ± {recItems.filter(i => i.estado === 'diferencia').length} con diferencia
              </span>
              <span style={{ fontSize: '.75rem', background: 'rgba(var(--red-rgb),.12)', color: 'var(--red)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                ✕ {recItems.filter(i => i.estado === 'no_llegado').length} no llegó
              </span>
              <span style={{ fontSize: '.75rem', background: 'var(--s2)', color: 'var(--tx2)', padding: '3px 10px', borderRadius: 20 }}>
                ⏳ {recItems.filter(i => i.estado === 'pendiente').length} pendiente
              </span>
            </div>

            {/* Buscador / escáner */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input className="si" style={{ flex: 1, marginBottom: 0 }}
                placeholder="Escanea EAN o escribe nombre y pulsa Enter..."
                value={scanRec} onChange={e => setScanRec(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !scanRec.trim()) return
                  const code = scanRec.trim()
                  const q = code.toLowerCase()
                  // Un EAN puede pertenecer a varios productos (variantes de color o
                  // colisiones entre proveedores). El escáner lee el EAN, idéntico en
                  // todos, así que NO sabe cuál tienes en la mano. Si coincide con varias
                  // líneas del pedido, abrimos un selector para que la persona elija la
                  // correcta (mirando la caja); marcar a ciegas falsearía el recuento.
                  const idsEan = new Set(productos.filter(p => p.codigo_ean === code).map(p => p.id))
                  let matches = []
                  if (idsEan.size > 0) {
                    matches = recItems.map((r, i) => ({ r, i })).filter(x => idsEan.has(x.r.producto_id))
                  } else {
                    matches = recItems.map((r, i) => ({ r, i })).filter(x => x.r.nombre.toLowerCase().includes(q))
                  }
                  if (matches.length === 0) { showToast('Producto no encontrado en el pedido', 'error'); setScanRec(''); return }
                  if (matches.length === 1) { marcarRecibido(matches[0].i); return }
                  // Varias coincidencias → elegir cuál se recibe
                  setRecPicker(matches)
                }} />
            </div>

            {/* Selector cuando un EAN coincide con varias líneas (variantes/colisiones).
                La persona elige mirando la caja cuál está recibiendo realmente. */}
            {recPicker && (
              <div className="mo">
                <div className="mc">
                  <ModalClose onClose={() => setRecPicker(null)} />
                  <div className="mt-modal">¿Cuál estás recibiendo?</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 12 }}>
                    Varias líneas comparten este código. Mira la caja y elige la correcta.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {recPicker.map(({ r, i }) => (
                      <button key={r.id} onClick={() => marcarRecibido(i)} disabled={r.estado !== 'pendiente'} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        textAlign: 'left', padding: '12px 14px', borderRadius: 'var(--rs)',
                        background: 'var(--s2)', border: '1px solid var(--bd)', color: 'var(--tx)',
                        cursor: r.estado === 'pendiente' ? 'pointer' : 'not-allowed',
                        opacity: r.estado === 'pendiente' ? 1 : .5, fontFamily: "'DM Sans',sans-serif",
                      }}>
                        <span style={{ fontWeight: 700 }}>{r.nombre}</span>
                        <span style={{ fontSize: '.74rem', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
                          {r.estado === 'pendiente' ? `Pedido: ${r.cantidad}` : `ya: ${r.estado}`}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button className="btn-s" onClick={() => { setRecPicker(null); setScanRec('') }}>Cancelar</button>
                </div>
              </div>
            )}

            <div ref={recListRef} style={{ overflowY: 'auto', flex: 1 }}>
              {recItems.map((item, idx) => {
                // "Todo llegó" y "No llegó" aplican el stock al instante.
                // "Diferencia" solo abre el input; el stock se aplica al salir
                // del campo (onBlur) o con +/−.
                const marcarDiferencia = () => setRecItems(prev => prev.map((r, i) => i !== idx ? r : { ...r, estado: 'diferencia' }))
                const editQtyLocal = (val) => setRecItems(prev => prev.map((r, i) => {
                  if (i !== idx) return r
                  const cantidad_recibida = Math.max(0, parseInt(val) || 0)
                  const estado = cantidad_recibida === 0 ? 'no_llegado' : cantidad_recibida === r.cantidad ? 'ok' : 'diferencia'
                  return { ...r, cantidad_recibida, estado }
                }))
                const aplicarQty = (n) => {
                  const q = Math.max(0, n)
                  const estado = q === 0 ? 'no_llegado' : q === item.cantidad ? 'ok' : 'diferencia'
                  aplicarItem(idx, estado, q)
                }
                const setNota = (val) => setRecItems(prev => prev.map((r, i) => i !== idx ? r : { ...r, notas_item: val }))

                const borderCol = item.estado === 'ok' ? 'rgba(var(--green-rgb),.4)'
                  : item.estado === 'diferencia' ? 'rgba(var(--gold-rgb),.4)'
                  : item.estado === 'no_llegado' ? 'rgba(var(--red-rgb),.4)'
                  : 'var(--bd)'
                const bgCol = item.estado === 'ok' ? 'rgba(var(--green-rgb),.06)'
                  : item.estado === 'diferencia' ? 'rgba(var(--gold-rgb),.06)'
                  : item.estado === 'no_llegado' ? 'rgba(var(--red-rgb),.06)'
                  : 'var(--s2)'

                return (
                  <div key={item.id} data-recidx={idx} style={{ background: bgCol, border: `1px solid ${borderCol}`, borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 10 }}>
                    {/* Nombre + cantidad pedida */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{item.nombre}</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--tx2)' }}>Pedido: <strong style={{ color: 'var(--tx)' }}>{item.cantidad}</strong></div>
                    </div>

                    {/* Botones de estado rápido */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                      <button onClick={() => aplicarItem(idx, 'ok', item.cantidad)} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 'var(--rs)', fontSize: '.75rem', fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                        background: item.estado === 'ok' ? 'var(--green)' : 'transparent',
                        border: `1px solid ${item.estado === 'ok' ? 'var(--green)' : 'rgba(var(--green-rgb),.4)'}`,
                        color: item.estado === 'ok' ? 'white' : 'var(--green)',
                      }}>✓ Todo llegó</button>
                      <button onClick={marcarDiferencia} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 'var(--rs)', fontSize: '.75rem', fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                        background: item.estado === 'diferencia' ? 'var(--gold)' : 'transparent',
                        border: `1px solid ${item.estado === 'diferencia' ? 'var(--gold)' : 'rgba(var(--gold-rgb),.4)'}`,
                        color: item.estado === 'diferencia' ? '#000' : 'var(--gold)',
                      }}>± Diferencia</button>
                      <button onClick={() => aplicarItem(idx, 'no_llegado', 0)} style={{
                        flex: 1, padding: '8px 4px', borderRadius: 'var(--rs)', fontSize: '.75rem', fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                        background: item.estado === 'no_llegado' ? 'var(--red)' : 'transparent',
                        border: `1px solid ${item.estado === 'no_llegado' ? 'var(--red)' : 'rgba(var(--red-rgb),.4)'}`,
                        color: item.estado === 'no_llegado' ? 'white' : 'var(--red)',
                      }}>✕ No llegó</button>
                    </div>

                    {/* Input cantidad si hay diferencia */}
                    {item.estado === 'diferencia' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>Cantidad recibida:</span>
                        <button className="qb" onClick={() => aplicarQty(item.cantidad_recibida - 1)}>−</button>
                        <input type="number" value={item.cantidad_recibida} min="0" max={item.cantidad * 2}
                          onChange={e => editQtyLocal(e.target.value)}
                          onBlur={e => aplicarQty(Math.max(0, parseInt(e.target.value) || 0))}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                          style={{ width: 60, background: 'var(--s1)', border: '2px solid var(--gold)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '5px 8px', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, textAlign: 'center' }}
                          inputMode="numeric" />
                        <button className="qb" onClick={() => aplicarQty(item.cantidad_recibida + 1)}>+</button>
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
              <div style={{ fontSize: '.75rem', color: 'var(--gold)', marginTop: 8, padding: '6px 10px', background: 'rgba(var(--gold-rgb),.1)', borderRadius: 'var(--rs)' }}>
                <i className="fi fi-rr-triangle-warning"/> Quedan {recItems.filter(i => i.estado === 'pendiente').length} productos sin revisar. Márcalos antes de confirmar.
              </div>
            )}

            <button className="btn-p" style={{ marginTop: 10 }} disabled={saving || recItems.some(i => i.estado === 'pendiente')}
              onClick={confirmarRec}>
              {saving ? 'Guardando...' : recItems.some(i => i.estado === 'pendiente')
                ? `⏳ Revisa los ${recItems.filter(i=>i.estado==='pendiente').length} productos pendientes`
                : '✓ Confirmar y cerrar pedido'}
            </button>
            <button className="btn-s" onClick={() => setRecibiendo(null)}>Cerrar (seguir luego)</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MODAL INVENTARIO ─────────────────────────────────────────
function ModalInventario({ caseta, perfil, productos, stockActual, onClose, showToast }) {
  // Borrador persistente: guarda lo contado en localStorage por si se cierra la
  // pantalla o se cuelga a media cuenta, para no perder el recuento.
  const LSKEY = `inv_draft_${caseta.id}`
  const [items, setItems]       = useState(() => {
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(LSKEY) || '{}') } catch (_) {}
    return productos.map(p => ({ producto_id: p.id, nombre: p.nombre, categoria: p.categoria, codigo_ean: p.codigo_ean, cantidad_real: saved[p.id] ?? 0 }))
  })

  // Avisar (una vez) si se recuperó un conteo previo.
  useEffect(() => {
    try { if (localStorage.getItem(LSKEY)) showToast('Recuperado el conteo guardado') } catch (_) {}
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // Persistir el borrador cada vez que cambia lo contado (solo cantidades > 0).
  useEffect(() => {
    const map = {}
    for (const i of items) if (i.cantidad_real) map[i.producto_id] = i.cantidad_real
    try {
      if (Object.keys(map).length) localStorage.setItem(LSKEY, JSON.stringify(map))
      else localStorage.removeItem(LSKEY)
    } catch (_) {}
  }, [items])   // eslint-disable-line react-hooks/exhaustive-deps

  const [busq, setBusq]         = useState('')
  const [catFiltro, setCatFiltro] = useState('Todos')
  const [loading, setLoading]   = useState(false)
  const [enviado, setEnviado]   = useState(false)
  const [esFinal, setEsFinal]   = useState(false)

  const cats = ['Todos', ...new Set(productos.map(p => p.categoria).sort())]

  const itemsFiltrados = items.filter(i => {
    const b = busq.trim().toLowerCase()
    const bOk = !b || i.nombre.toLowerCase().includes(b) || i.codigo_ean?.includes(b)
    const cOk = catFiltro === 'Todos' || i.categoria === catFiltro
    return bOk && cOk
  }).sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'))

  const setQty = (productoId, val) => {
    const q = Math.max(0, parseInt(val) || 0)
    setItems(prev => prev.map(i => i.producto_id === productoId ? { ...i, cantidad_real: q } : i))
  }

  const enviar = async () => {
    setLoading(true)
    try {
      await crearInventario(caseta.id, perfil.id, items, esFinal)
      try { localStorage.removeItem(LSKEY) } catch (_) {}   // enviado: borrar borrador
      showToast('✓ Inventario enviado al administrador para confirmación')
      setEnviado(true)
    } catch (e) { showToast('Error: ' + e.message, 'error') }
    setLoading(false)
  }

  if (enviado) return (
    <div className="mo">
      <div className="mc" style={{ textAlign: 'center' }}>
        <ModalClose onClose={onClose} />
        <div style={{ fontSize: '2.5rem', marginBottom: 12, color: 'var(--green)' }}><i className="fi fi-rr-check-circle"/></div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Inventario enviado</div>
        <div style={{ color: 'var(--tx2)', fontSize: '.85rem', marginBottom: 20 }}>
          El administrador revisará el inventario y actualizará el stock.
        </div>
        <button className="btn-p" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )

  return (
    <div className="mo">
      <div className="mc wide" style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-clipboard-list"/> Inventario de Cierre</div>
        <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 10 }}>
          {caseta.nombre} · Cuenta el stock físico restante
        </div>

        <input className="si" placeholder="Buscar producto o EAN..."
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
                <div style={{ fontSize: '.72rem', color: 'var(--tx2)' }}>{item.categoria}</div>
              </div>
              <button className="qb" onClick={() => setQty(item.producto_id, item.cantidad_real - 1)}>−</button>
              <input type="number" value={item.cantidad_real || ''} min="0" placeholder="0"
                onChange={e => setQty(item.producto_id, e.target.value)}
                onFocus={e => e.target.select()}
                style={{ width: 60, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', padding: '5px', textAlign: 'center', fontFamily: "'DM Sans',sans-serif", fontWeight: 700 }}
                inputMode="numeric" />
              <button className="qb" onClick={() => setQty(item.producto_id, item.cantidad_real + 1)}>+</button>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 0', fontSize: '.78rem', color: 'var(--tx2)' }}>
          {items.filter(i => i.cantidad_real > 0).length} de {items.length} productos con stock contado
        </div>

        {/* Inventario final: al confirmarlo el admin, la caseta queda a 0 */}
        <div onClick={() => setEsFinal(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 10, cursor: 'pointer', borderRadius: 'var(--rs)', border: `1px solid ${esFinal ? 'var(--red)' : 'var(--bd)'}`, background: esFinal ? 'rgba(var(--red-rgb),.08)' : 'var(--s2)' }}>
          <div style={{ width: 40, height: 22, borderRadius: 11, background: esFinal ? 'var(--red)' : 'var(--s3)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: 3, left: esFinal ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
          </div>
          <div>
            <div style={{ fontSize: '.82rem', fontWeight: 700, color: esFinal ? 'var(--red)' : 'var(--tx)' }}>Inventario final (cierre de caseta)</div>
            <div style={{ fontSize: '.72rem', color: 'var(--tx2)' }}>Al confirmarlo, el stock de la caseta queda a 0. Úsalo solo al retirar la caseta.</div>
          </div>
        </div>

        <button className="btn-p" disabled={loading} onClick={enviar}>
          {loading ? 'Enviando...' : 'Enviar inventario para revisión'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── BADGE KILOS PÓLVORA ──────────────────────────────────────
function BadgeKgPolvora({ kgActual, kgLimite, necDetalle }) {
  const pct = kgLimite > 0 ? (kgActual / kgLimite) * 100 : 0
  const color = pct >= 90 ? 'var(--red)' : pct >= 75 ? 'var(--gold)' : 'var(--green)'
  const alerta = pct >= 80
  // Evaluación por división (1.3G ≤ 20%, etc.)
  const ev = evaluarNEC(necDetalle?.porDivision || {}, kgLimite)
  const d13 = ev.divisiones.find(d => d.division === '1.3G')
  const sinClasif = necDetalle?.sinClasificar || 0
  const incumple = ev.divisiones.some(d => d.excedido)
  const titulo = `Total: ${kgActual.toFixed(2)}/${kgLimite} kg (${pct.toFixed(0)}%)`
    + (d13 ? `\n1.3G: ${d13.kg.toFixed(2)}/${d13.maxKg.toFixed(2)} kg (máx 20%)` : '')
    + (sinClasif > 0 ? `\nSin clasificar: ${sinClasif.toFixed(2)} kg` : '')
  return (
    <div title={titulo} className="nec-badge" style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
      background: (alerta || incumple) ? `rgba(${pct >= 90 || incumple ? 'var(--red-rgb)' : 'var(--gold-rgb)'},.15)` : 'var(--s2)',
      border: `1px solid ${incumple ? 'var(--red)' : color}`, borderRadius: 20, fontSize: '.72rem', cursor: 'default',
      flexShrink: 1, minWidth: 0, whiteSpace: 'nowrap',
    }}>
      <span style={{ color, fontWeight: 700 }}><i className="fi fi-rr-flame"/> {kgActual.toFixed(2)}kg</span>
      <span className="nec-lim" style={{ color: 'var(--tx2)' }}>/ {kgLimite}kg</span>
      {d13 && (
        <span className="nec-div" style={{ color: d13.excedido ? 'var(--red)' : 'var(--tx2)', fontWeight: d13.excedido ? 800 : 600, borderLeft: '1px solid var(--bd)', paddingLeft: 6 }}>
          1.3G {d13.kg.toFixed(1)}/{d13.maxKg.toFixed(1)}{d13.excedido && <i className="fi fi-rr-triangle-warning" style={{ marginLeft: 3 }}/>}
        </span>
      )}
      {pct >= 100 && <span style={{ color: 'var(--red)', fontWeight: 800 }}>SUPERADO</span>}
      {sinClasif > 0 && <span title="Hay NEC sin división asignada" style={{ color: 'var(--gold)', cursor: 'help' }}><i className="fi fi-rr-interrogation"/></span>}
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
      const f = await fichar(perfil.id, caseta.id, tipo, notas, geoData, { nombreEmpleado: perfil.nombre, nombreCaseta: caseta.nombre })
      const mensajes = {
        ENTRADA:          'Entrada registrada',
        SALIDA:           'Salida registrada — ¡Hasta mañana!',
        INICIO_DESCANSO:  'Descanso iniciado',
        FIN_DESCANSO:     'Volviendo al trabajo',
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
    trabajando:{ color: 'var(--green)',  bg: 'rgba(var(--green-rgb),.08)',       border: 'rgba(var(--green-rgb),.3)',          dot: 'var(--green)',    label: 'Trabajando' },
    descanso:  { color: 'var(--gold)',   bg: 'rgba(var(--gold-rgb),.08)',      border: 'rgba(var(--gold-rgb),.3)',         dot: 'var(--gold)',     label: 'En descanso' },
  }
  const cfg = estadoCfg[estado]

  const labelSemana = semana===0 ? 'Esta semana'
    : semana===-1 ? 'Semana pasada'
    : `${getLunesSemana(semana).toLocaleDateString('es-ES',{day:'numeric',month:'short'})} – ${getFinSemana(semana).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}`

  return (
    <div className="mo">
      <div className="mc wide" style={{maxHeight:'93vh',display:'flex',flexDirection:'column'}}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-clock"/> Control de Presencia</div>
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
                {fichandoType==='ENTRADA'?'...':'Fichar entrada'}
              </button>
            )}
            {estado==='trabajando'&&(<>
              <button onClick={()=>handleFichar('INICIO_DESCANSO')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(var(--gold-rgb),.5)',
                background:'rgba(var(--gold-rgb),.1)',color:'var(--gold)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='INICIO_DESCANSO'?'...':'Iniciar descanso'}</button>
              <button onClick={()=>handleFichar('SALIDA')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(var(--red-rgb),.4)',
                background:'rgba(var(--red-rgb),.1)',color:'var(--red)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='SALIDA'?'...':'Fichar salida'}</button>
            </>)}
            {estado==='descanso'&&(<>
              <button onClick={()=>handleFichar('FIN_DESCANSO')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(var(--green-rgb),.4)',
                background:'rgba(var(--green-rgb),.1)',color:'var(--green)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='FIN_DESCANSO'?'...':<><i className="fi fi-rr-circle" style={{color:'var(--green)'}}/> Volver al trabajo</>}</button>
              <button onClick={()=>handleFichar('SALIDA')} disabled={loading2} style={{
                flex:1,padding:'10px 0',borderRadius:'var(--rs)',border:'1px solid rgba(var(--red-rgb),.4)',
                background:'rgba(var(--red-rgb),.1)',color:'var(--red)',fontWeight:700,cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem',
              }}>{fichandoType==='SALIDA'?'...':<><i className="fi fi-rr-sign-out-alt" style={{color:'var(--red)'}}/> Salida directa</>}</button>
            </>)}
            {/* Feedback de geolocalización */}
          {geoEstado === 'obteniendo' && (
            <div style={{width:'100%',marginTop:6,padding:'7px 12px',background:'rgba(var(--blue-rgb),.1)',border:'1px solid rgba(var(--blue-rgb),.3)',borderRadius:'var(--rs)',fontSize:'.78rem',color:'var(--blue)',display:'flex',gap:8,alignItems:'center'}}>
              <div className="spin-sm" style={{width:14,height:14,flexShrink:0}}/>
              Verificando tu ubicación...
            </div>
          )}
          {geoEstado === 'ok' && geoMsg && (
            <div style={{width:'100%',marginTop:6,padding:'7px 12px',background:'rgba(var(--green-rgb),.1)',border:'1px solid rgba(var(--green-rgb),.3)',borderRadius:'var(--rs)',fontSize:'.78rem',color:'var(--green)'}}>
              <i className="fi fi-rr-map-marker"/> {geoMsg}
            </div>
          )}
          {geoEstado === 'fuera' && (
            <div style={{width:'100%',marginTop:6,padding:'9px 12px',background:'rgba(var(--red-rgb),.12)',border:'1px solid rgba(var(--red-rgb),.4)',borderRadius:'var(--rs)',fontSize:'.8rem',color:'var(--red)',fontWeight:600}}>
              <i className="fi fi-rr-map-marker"/> {geoMsg}
            </div>
          )}
          {geoEstado === 'error' && (
            <div style={{width:'100%',marginTop:6,padding:'9px 12px',background:'rgba(var(--red-rgb),.12)',border:'1px solid rgba(var(--red-rgb),.4)',borderRadius:'var(--rs)',fontSize:'.78rem',color:'var(--red)'}}>
              <i className="fi fi-rr-triangle-warning"/> {geoMsg}
            </div>
          )}

          {/* Aviso si es el último y tiene caja abierta */}
            {(estado==='trabajando'||estado==='descanso') && esSoloEmpleado && caja && (
              <div style={{width:'100%',marginTop:4,fontSize:'.72rem',color:'var(--gold)',
                background:'rgba(var(--gold-rgb),.08)',border:'1px solid rgba(var(--gold-rgb),.2)',
                borderRadius:'var(--rs)',padding:'5px 10px',textAlign:'center'}}>
                <i className="fi fi-rr-triangle-warning"/> Eres el único empleado — debes cerrar caja antes de salir
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
            }}><i className="fi fi-rr-note"/></button>
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
                background:t.enCurso?'rgba(var(--green-rgb),.06)':t.enDescanso?'rgba(var(--gold-rgb),.06)':'var(--s2)',
                border:`1px solid ${t.enCurso?'rgba(var(--green-rgb),.25)':t.enDescanso?'rgba(var(--gold-rgb),.25)':'var(--bd)'}`,
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
                      <div style={{fontSize:'.67rem',color:'var(--gold)'}}><i className="fi fi-rr-mug-hot"/> {fmtDuracion(t.minutosDescanso)} descanso</div>
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
                  <div style={{borderTop:'1px dashed rgba(var(--gold-rgb),.3)',paddingTop:6,marginTop:4}}>
                    {t.descansos.map((d,j)=>(
                      <div key={j} style={{display:'flex',gap:8,fontSize:'.73rem',color:'var(--gold)',marginBottom:2}}>
                        <span><i className="fi fi-rr-mug-hot"/></span>
                        <span>{new Date(d.inicio.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                        <span style={{color:'var(--tx2)'}}>→</span>
                        <span>{new Date(d.fin.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                        <span style={{color:'var(--tx2)'}}>({fmtDuracion(d.minutos)})</span>
                      </div>
                    ))}
                    {t.descansoEnCurso&&(
                      <div style={{display:'flex',gap:8,fontSize:'.73rem',color:'var(--gold)'}}>
                        <span><i className="fi fi-rr-mug-hot"/></span>
                        <span>{new Date(t.descansoEnCurso.inicio.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                        <span style={{color:'var(--tx2)'}}>→ en curso ({fmtDuracion(t.descansoEnCurso.minutos)})</span>
                      </div>
                    )}
                  </div>
                )}

                {t.entrada.notas&&<div style={{fontSize:'.72rem',color:'var(--tx2)',marginTop:5,fontStyle:'italic'}}><i className="fi fi-rr-note"/> {t.entrada.notas}</div>}
              </div>
            ))
          }
        </div>

        <button className="btn-s" style={{marginTop:12}} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}


export default function EmpleadoPanel({ perfil, casetas, onSalirVenta }) {
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
  const [descuento,      setDescuento]      = useState(0)
  const [busq,           setBusq]           = useState('')
  const busqRef                             = useRef(null)
  const [cat,            setCat]            = useState('Todos')
  const [showScan,       setShowScan]       = useState(false)
  const [eanPicker,      setEanPicker]      = useState(null)   // productos que comparten EAN
  const [showAjustes,    setShowAjustes]    = useState(false)
  const [showPago,       setShowPago]       = useState(false)
  const [showCierre,       setShowCierre]       = useState(false)
  const [showRetirada,     setShowRetirada]     = useState(false)
  const [showAperturaCaja, setShowAperturaCaja] = useState(false)
  const [showDevolucion, setShowDevolucion] = useState(false)
  const [showBaja,       setShowBaja]       = useState(false)
  const [showAjuste,     setShowAjuste]     = useState(false)
  const [showHistorial,  setShowHistorial]  = useState(false)
  const [showOk,         setShowOk]         = useState(null)
  const [showFactura,    setShowFactura]    = useState(false)
  const [toast,          setToast]          = useState(null)
  const [apertura,       setApertura]       = useState('')
  // ── Persistidos en sessionStorage para sobrevivir a cambios de página ──
  const [modoRapido,     setModoRapido]     = useState(() => sessionStorage.getItem('tpv_rapido') === '1')
  const [noImprimir,     setNoImprimir]     = useState(() => sessionStorage.getItem('tpv_noimprimir') === '1') // por defecto SÍ se imprime
  const [modalAlEscanear, setModalAlEscanear] = useState(() => localStorage.getItem('tpv_modal_escanear') === '1') // por defecto: escanear añade 1 directo
  const [tabTPV,         setTabTPV]         = useState(() => sessionStorage.getItem('tpv_tab') || 'todos')
  const [cat2,           setCat2]           = useState(() => sessionStorage.getItem('tpv_cat') || 'Todos')

  const [favoritos,      setFavoritos]      = useState(() => getFavoritos())
  const [favOfertas,     setFavOfertas]     = useState(() => getFavoritosOfertas())
  const [prodModal,      setProdModal]      = useState(null)
  const [combModal,      setCombModal]      = useState(null)
  // Persistir panel abierto (pedidos/inventario) para que al volver no pierdan su posición
  const [showPedido,     setShowPedido]     = useState(false)
  const [pedidoBorrador, setPedidoBorrador] = useState(null) // items guardados al cerrar sin enviar
  const [showMisPedidos, setShowMisPedidos] = useState(()=>sessionStorage.getItem('tpv_panel')==='pedidos')
  const [showInventario, setShowInventario] = useState(()=>sessionStorage.getItem('tpv_panel')==='inventario')
  const [showFichajes,   setShowFichajes]   = useState(false)
  const [ultimoFichaje,  setUltimoFichaje]  = useState(null)
  const [fichajeLoading, setFichajeLoading] = useState(true)  // true mientras carga el estado del fichaje
  const [otrosActivos,   setOtrosActivos]   = useState([]) // otros empleados activos en la caseta
  const [kgPolvora,      setKgPolvora]      = useState(0)
  const [necDetalle,     setNecDetalle]     = useState({ total: 0, porDivision: {}, sinClasificar: 0 })
  const [kgLimite,       setKgLimite]       = useState(10)
  const [pedidosPend,          setPedidosPend]          = useState(0)
  const [stockMinimos,         setStockMinimos]         = useState({})
  const [pedidoActivo,         setPedidoActivo]         = useState(false)
  const [pedidosActivosProdIds,setPedidosActivosProdIds]= useState(new Set())
  const [countdown,            setCountdown]            = useState('')
  const [minsRestantes,        setMinsRestantes]        = useState(9999)
  const [showHamburger,        setShowHamburger]        = useState(false)

  const showToast = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800) }

  // ── FACTURA (post-venta): abre el modal reutilizable ──
  const abrirFactura = () => setShowFactura(true)
  const onFacturaConfirm = (cliente) => {
    imprimirTicket(showOk, { esFactura: true, cliente })
    // Guardar los datos del cliente en el ticket para poder reimprimir la factura
    if (showOk?.id) guardarFacturaCliente(showOk.id, cliente).catch(() => {})
    setShowFactura(false); setShowOk(null)
  }

  const refrescarTras = () => {
    Promise.all([
      getStockCaseta(caseta.id),
      getStockMinimos(caseta.id).catch(() => null),
      getPedidos({ casetaId: caseta.id, activos: true }).catch(() => []),
    ]).then(([stk, mins, peds]) => {
      setStock(stk)
      if (mins) setStockMinimos(mins)
      const pedsArr = peds || []
      setPedidosPend(pedsArr.filter(p => p.estado === 'EN_CAMINO').length)
      setPedidoActivo(pedsArr.some(p => ['PENDIENTE','ACEPTADO','EN_CAMINO'].includes(p.estado)))
      const ids = new Set()
      pedsArr.forEach(p => (p.pedido_items || []).forEach(i => ids.add(i.producto_id)))
      setPedidosActivosProdIds(ids)
    })
  }

  // Persistir estado simple en sessionStorage
  useEffect(() => { sessionStorage.setItem('tpv_rapido', modoRapido ? '1' : '0') }, [modoRapido])
  useEffect(() => { sessionStorage.setItem('tpv_noimprimir', noImprimir ? '1' : '0') }, [noImprimir])
  useEffect(() => { localStorage.setItem('tpv_modal_escanear', modalAlEscanear ? '1' : '0') }, [modalAlEscanear])
  useEffect(() => { sessionStorage.setItem('tpv_tab', tabTPV) }, [tabTPV])
  useEffect(() => { sessionStorage.setItem('tpv_cat', cat2) }, [cat2])

  const CATS = ['Todos', ...new Set(productos.map(p => p.categoria).sort())].filter(Boolean)

  useEffect(() => {
    if (!caseta) return
    Promise.all([
      getProductos(), getStockCaseta(caseta.id),
      getOfertas(), getCajaAbierta(caseta.id),
      getNECDetalle(caseta.id), getLimitePolvora(caseta.id),
      getPedidos({ casetaId: caseta.id, activos: true }).catch(() => []),
      getStockMinimos(caseta.id).catch(() => {}),
    ]).then(([prods, stk, ofs, cajaAbierta, nec, limite, peds, mins]) => {
      setProductos(prods); setStock(stk); setOfertas(ofs)
      setKgPolvora(nec.total); setNecDetalle(nec); setKgLimite(limite)
      setStockMinimos(mins || {})
      const pedsArr = peds || []
      setPedidosPend(pedsArr.filter(p => p.estado === 'EN_CAMINO').length)
      setPedidoActivo(pedsArr.some(p => ['PENDIENTE','ACEPTADO','EN_CAMINO'].includes(p.estado)))
      const ids = new Set()
      pedsArr.forEach(p => (p.pedido_items || []).forEach(i => ids.add(i.producto_id)))
      setPedidosActivosProdIds(ids)
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
          // Recalcular NEC en background
          getNECDetalle(caseta.id).then(d => { setKgPolvora(d.total); setNecDetalle(d) })
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [caseta?.id])

  // Refs para el auto-envío (evitan closures stale en el interval)
  const stockRef              = useRef({})
  const stockMinimosRef       = useRef({})
  const productosRef          = useRef([])
  const pedidoActivoRef       = useRef(false)
  const pedidosActivoProdRef  = useRef(new Set())
  const autoEnviadoRef        = useRef(null) // "YYYY-MM-DD" del último auto-envío
  useEffect(() => { stockRef.current = stock },                         [stock])
  useEffect(() => { stockMinimosRef.current = stockMinimos },           [stockMinimos])
  useEffect(() => { productosRef.current = productos },                 [productos])
  useEffect(() => { pedidoActivoRef.current = pedidoActivo },          [pedidoActivo])
  useEffect(() => { pedidosActivoProdRef.current = pedidosActivosProdIds }, [pedidosActivosProdIds])

  useEffect(() => {
    const horaCorte = caseta?.hora_corte_pedidos
    if (!horaCorte || !caseta?.pedidos_auto_activos) return

    const tick = () => {
      const now  = new Date()
      const [h, m] = horaCorte.slice(0, 5).split(':').map(Number)
      const corte = new Date(now); corte.setHours(h, m, 0, 0)

      // ¿Acabamos de pasar la hora de corte? (ventana de 90 s)
      const msPasados = now - corte
      if (msPasados >= 0 && msPasados < 90000) {
        const hoyStr = now.toISOString().slice(0, 10)
        if (autoEnviadoRef.current !== hoyStr && !pedidoActivoRef.current) {
          autoEnviadoRef.current = hoyStr
          // Calcular items necesarios
          const autoItems = productosRef.current.filter(p => {
            const min = stockMinimosRef.current[p.id] || 0
            return min > 0 && (stockRef.current[p.id] ?? 0) < min && !pedidosActivoProdRef.current.has(p.id)
          }).map(p => {
            const min  = stockMinimosRef.current[p.id]
            const diff = Math.max(1, min - (stockRef.current[p.id] ?? 0))
            const fardoSize = Math.max(1, p.fardo || 1)
            return { producto_id: p.id, nombre: p.nombre, cantidad: Math.ceil(diff / fardoSize) * fardoSize, fardo: fardoSize, origen: 'auto' }
          })
          if (autoItems.length > 0) {
            crearPedido(caseta.id, perfil.id, autoItems, 'Pedido automático generado a la hora de corte')
              .then(() => {
                showToast('Pedido automático enviado al administrador')
                refrescarTras()
              })
              .catch(e => {
                showToast('Error en pedido automático: ' + e.message, 'error')
              })
          }
        }
        // Después de la hora de corte el countdown apunta a mañana
        corte.setDate(corte.getDate() + 1)
      } else if (now < corte) {
        // Nada — corte es hoy en el futuro
      } else {
        // Pasó hace > 90 s, apuntamos a mañana
        corte.setDate(corte.getDate() + 1)
      }

      const diff     = corte - now
      const totalMins = Math.floor(diff / 60000)
      setMinsRestantes(totalMins)
      const hs = Math.floor(totalMins / 60)
      const ms = totalMins % 60
      setCountdown(`${hs}h ${ms}m`)
    }

    tick()
    const iv = setInterval(tick, 30000) // cada 30 s para no perdernos la ventana
    return () => clearInterval(iv)
  }, [caseta?.hora_corte_pedidos, caseta?.pedidos_auto_activos, caseta?.id, perfil?.id])

  const handleAbrirCaja = async () => {
    try {
      const c = await abrirCaja(caseta.id, perfil.id, parseFloat(apertura) || 0, { nombreEmpleado: perfil.nombre, nombreCaseta: caseta.nombre })
      setCaja(c); setVentas([])
    } catch (e) { showToast('Error: ' + e.message, 'error') }
  }

  // ── Restricciones basadas en fichaje ──────────────────────
  const esModoAdmin   = !!onSalirVenta   // admin vendiendo: no necesita fichar
  const estadoFichaje = calcularEstado(ultimoFichaje)
  const estaFichado   = estadoFichaje !== 'libre'
  const enDescanso    = estadoFichaje === 'descanso'
  // Mientras carga el fichaje no bloqueamos (evita falso negativo al arrancar)
  const puedeOperar   = esModoAdmin || fichajeLoading || (estaFichado && !enDescanso)
  // Para salir: si hay otros activos puede salir sin cerrar caja; si es el último, no
  const esSoloEmpleado = otrosActivos.length === 0

  // `permitirToggle`: solo el grid de productos lo activa (tocar un producto ya
  // en el ticket lo quita). El resto (ofertas, modal, escáner) SIEMPRE suma —
  // así una oferta no borra un producto compartido que ya estaba en el ticket.
  const agregar = useCallback((prod, cantidad = 1, regalo = false, permitirToggle = false) => {
    if (!puedeOperar) {
      showToast(enDescanso ? 'Estás en descanso — termina el descanso para vender' : 'Ficha tu entrada antes de vender', 'error')
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
      // Stock total comprometido por este producto (líneas pagada + regalo)
      const totalEnTicket = prev.filter(i => i.id === prod.id).reduce((s, i) => s + i.cantidad, 0)
      const idx = prev.findIndex(i => i.id === prod.id && !!i.regalo === regalo)
      if (idx >= 0) {
        // Tap simple en el grid sobre la línea pagada → toggle: quitar del ticket
        if (permitirToggle && !regalo && cantidad === 1) return prev.filter((_, j) => j !== idx)
        if (totalEnTicket + cantidad > stockDisp) { showToast('Stock insuficiente', 'error'); return prev }
        const n = [...prev]; n[idx] = { ...n[idx], cantidad: n[idx].cantidad + cantidad }; return n
      }
      if (totalEnTicket + cantidad > stockDisp) { showToast('Stock insuficiente', 'error'); return prev }
      return [...prev, { ...prod, cantidad, regalo, gramos_polvora: prod.gramos_polvora || 0 }]
    })
    setShowScan(false)
  }, [stock, caja, puedeOperar, enDescanso])

  const abrirModalCantidad = (prod, packSize = 1, etiquetaOferta = null) => {
    const stockDisp = stock[prod.id] ?? 0
    if (stockDisp < packSize) { showToast('Stock insuficiente para la oferta', 'error'); return }
    setProdModal({ ...prod, _packSize: packSize, _etiquetaOferta: etiquetaOferta })
  }

  // Al escanear/elegir: por defecto añade 1 directo; con el toggle activo abre el modal de cantidad
  const añadirEscaneado = (prod) => {
    if (modalAlEscanear) abrirModalCantidad(prod)
    else agregar(prod, 1)
  }

  // Resta `cantidad` unidades de la línea pagada de un producto. Si llega a 0, la elimina.
  const quitar = (prod, cantidad = 1) => setTicket(prev => {
    const idx = prev.findIndex(i => i.id === prod.id && !i.regalo)
    if (idx < 0) return prev
    const nuevaCant = prev[idx].cantidad - cantidad
    if (nuevaCant <= 0) return prev.filter((_, j) => j !== idx)
    const n = [...prev]; n[idx] = { ...n[idx], cantidad: nuevaCant }; return n
  })

  const cambiarQty = (key, delta) => setTicket(prev => {
    const line = prev.find(i => lineKey(i) === key)
    if (!line) return prev
    const q = line.cantidad + delta
    if (q <= 0) return prev.filter(i => lineKey(i) !== key)
    const otras = prev.filter(i => i.id === line.id && lineKey(i) !== key).reduce((s, i) => s + i.cantidad, 0)
    if (otras + q > (stock[line.id] ?? 0)) { showToast('Stock insuficiente', 'error'); return prev }
    return prev.map(i => lineKey(i) === key ? { ...i, cantidad: q } : i)
  })

  // Fijar cantidad a mano (limitada al stock disponible de la línea, mínimo 1)
  const fijarQty = (key, val) => setTicket(prev => {
    const line = prev.find(i => lineKey(i) === key)
    if (!line) return prev
    const otras = prev.filter(i => i.id === line.id && lineKey(i) !== key).reduce((s, i) => s + i.cantidad, 0)
    const max = (stock[line.id] ?? 0) - otras
    let q = parseInt(val) || 0
    if (q < 1) q = 1
    if (q > max) { showToast('Stock insuficiente', 'error'); q = Math.max(1, max) }
    return prev.map(i => lineKey(i) === key ? { ...i, cantidad: q } : i)
  })

  // Marcar/desmarcar línea como regalo. Si ya existe la otra línea (pagada/regalo)
  // del mismo producto, las fusiona para no duplicar.
  const toggleRegalo = (key) => setTicket(prev => {
    const line = prev.find(i => lineKey(i) === key)
    if (!line) return prev
    const target = !line.regalo
    const otra = prev.find(i => i.id === line.id && !!i.regalo === target)
    if (otra) {
      return prev.map(i => i === otra ? { ...i, cantidad: i.cantidad + line.cantidad } : i)
        .filter(i => lineKey(i) !== key)
    }
    return prev.map(i => lineKey(i) === key ? { ...i, regalo: target } : i)
  })

  const totalBruto = calcularTotalTicket(ticket.filter(i => !i.regalo), ofertas)
  const descuentoImporte = Math.round(totalBruto * descuento) / 100
  const total = Math.max(0, totalBruto - descuentoImporte)

  const confirmarVenta = async ({ metodo, dineroDado, cambio, cliente, pagoEfectivo, pagoTarjeta }) => {
    // Doble check en el momento de ejecutar (no en el render)
    if (!caja) { showToast('La caja está cerrada — no se puede registrar la venta', 'error'); return }
    // Límite legal de 10 kg NEC por comprador (ITC 17)
    const necVenta = ticket.reduce((s, i) => s + (i.gramos_polvora || 0) * i.cantidad, 0) / 1000
    if (necVenta > MAX_NEC_COMPRADOR &&
        !window.confirm(`Esta venta lleva ${necVenta.toFixed(2)} kg de NEC y supera el límite legal de ${MAX_NEC_COMPRADOR} kg por comprador (ITC 17).\n\n¿Seguro que quieres continuar?`)) {
      return
    }
    try {
      const items = ticket.map(item => {
        const { total: totalLinea, desglose } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas)
        if (item.regalo) {
          // Regalo: precio 0 pero el stock baja igual (cantidad intacta)
          return { producto_id: item.id, nombre: item.nombre, precio_unitario: 0, cantidad: item.cantidad, total_linea: 0, con_oferta: false, detalle_oferta: 'REGALO' }
        }
        return {
          producto_id: item.id, nombre: item.nombre, precio_unitario: item.precio,
          cantidad: item.cantidad, total_linea: totalLinea, con_oferta: !!desglose,
          detalle_oferta: desglose ? desglose.map(d => d.tipo === 'pack' ? `${d.packs}x ${d.etiqueta}` : `${d.unidades}u normal`).join(' + ') : null,
        }
      })
      const efec = pagoEfectivo ?? (metodo === 'efectivo' ? total : 0)
      const tarj = pagoTarjeta ?? (metodo === 'tarjeta' ? total : 0)
      const ticketResult = await crearTicket({ cajaId: caja.id, casetaId: caseta.id, empleadoId: perfil.id, metodoPago: metodo, total, dineroDado, cambio, items, pagoEfectivo: efec, pagoTarjeta: tarj })
      setStock(prev => {
        const next = { ...prev }
        ticket.forEach(i => { if (next[i.id] !== undefined) next[i.id] -= i.cantidad })
        return next
      })
      setVentas(prev => [...prev, { metodo_pago: metodo, total, pago_efectivo: efec, pago_tarjeta: tarj, perfiles: { nombre: perfil.nombre } }])
      const ticketData = {
        metodo, total, cambio, dineroDado, pagoEfectivo: efec, pagoTarjeta: tarj, descuento: descuentoImporte, descuentoPct: descuento,
        items: ticket.map(i => {
          const { total: tl } = calcularPrecio(i.id, i.cantidad, i.precio, ofertas)
          return { nombre: i.nombre, cantidad: i.cantidad, precio: i.regalo ? 0 : i.precio, total_linea: i.regalo ? 0 : tl, gramos_polvora: i.gramos_polvora || 0, regalo: !!i.regalo }
        }),
        caseta, perfil,
        fecha: new Date(),
        id: ticketResult?.id,
        ticketNum: ticketResult?.numero_ticket || `TVN-${Date.now().toString().slice(-6)}`,
      }
      setTicket([]); setDescuento(0); setShowPago(false)
      if (cliente) {
        // Factura pedida antes de cobrar: imprime factura (no ticket) y la guarda
        imprimirTicket(ticketData, { esFactura: true, cliente })
        if (ticketData.id) guardarFacturaCliente(ticketData.id, cliente).catch(() => {})
        showToast(`✓ Factura ${fmt(total)}`)
      } else if (noImprimir) {
        // Sin impresión: no abrimos popup ni imprimimos (p.ej. sin papel)
        showToast(`✓ Venta ${fmt(total)} · sin ticket`)
      } else if (modoRapido) {
        // Venta rápida: imprime el ticket automáticamente y a por la siguiente
        imprimirTicket(ticketData)
        showToast(`✓ Venta ${fmt(total)} · ticket impreso`)
      } else {
        // Normal: menú para elegir (ticket / factura / nueva venta)
        setShowOk(ticketData)
      }
    } catch (e) { showToast('Error al guardar venta: ' + e.message, 'error') }
  }

  const confirmarCierre = async (contado, esperadoCierre) => {
    try {
      await cerrarCaja(caja.id, perfil.id, contado, { nombreCaseta: caseta.nombre, esperado: esperadoCierre })
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
      <div style={{ fontSize: '2rem', color: 'var(--gold)' }}><i className="fi fi-rr-triangle-warning"/></div>
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
  // Orden: primero los que tienen stock (alfabético), y los AGOTADOS al final
  // (también alfabéticos), para que no estorben en la venta.
  prodsFiltrados = [...prodsFiltrados].sort((a, b) => {
    const agA = (stock[a.id] ?? 0) <= 0
    const agB = (stock[b.id] ?? 0) <= 0
    if (agA !== agB) return agA ? 1 : -1
    return a.nombre.localeCompare(b.nombre, 'es')
  })

  const KW_RAPIDOS = ['mecha', 'bolsa', 'cebador']
  const botonesRapidos = productos.filter(p =>
    KW_RAPIDOS.some(kw => p.nombre.toLowerCase().includes(kw))
  ).slice(0, 4)

  // Ofertas pack SOLO de esos productos frecuentes (un toque aplica la oferta del pack)
  const ofertasRapidas = [...new Map(
    ofertas.filter(o => (!o.tipo || o.tipo === 'pack') && o.cantidad_pack > 1).map(o => [o.producto_id, o])
  ).values()].filter(o => {
    const prod = productos.find(p => p.id === o.producto_id)
    return prod && KW_RAPIDOS.some(kw => prod.nombre.toLowerCase().includes(kw))
  }).slice(0, 4)

  // Ofertas COMBINADAS frecuentes (varios productos a un precio). Aparecen solo
  // si el NOMBRE de la propia oferta contiene una palabra clave (no sus productos
  // internos: así "5 Mechas + Rasca" sale, pero "Caja de Madera" —que lleva mechas
  // dentro— no). Un toque añade todos los productos de la combinada al ticket.
  const combosRapidos = ofertas.filter(o => o.tipo === 'combinada' && o.activa !== false).filter(o =>
    KW_RAPIDOS.some(kw => (o.etiqueta || o.nombre || '').toLowerCase().includes(kw))
  ).slice(0, 4)

  const toggleFavOferta = (id) => setFavOfertas([...toggleFavoritoOferta(id)])
  const _paidQty = id => ticket.filter(i => i.id === id && !i.regalo).reduce((s, i) => s + i.cantidad, 0)

  // Render de una oferta (compartido entre la pestaña Ofertas y la de Favs)
  const renderOfertaComb = (o) => {
    const reqs = o.productos_requeridos || []
    const sinStock = reqs.some(r => (stock[r.producto_id] ?? 0) < r.cantidad)
    const yaAnadida = reqs.length > 0 && reqs.every(r => _paidQty(r.producto_id) >= r.cantidad)
    return (
      <TarjetaOfertaComb key={o.id} oferta={o} productos={productos}
        sinStock={sinStock} yaAnadida={yaAnadida}
        esFav={favOfertas.includes(o.id)} onFav={() => toggleFavOferta(o.id)}
        onTap={() => {
          if (yaAnadida) {
            reqs.forEach(r => { const prod = productos.find(p => p.id === r.producto_id); if (prod) quitar(prod, r.cantidad) })
            showToast(`✕ ${o.etiqueta || o.nombre} retirada`, 'error'); return
          }
          if (sinStock) { showToast('Stock insuficiente', 'error'); return }
          reqs.forEach(r => { const prod = productos.find(p => p.id === r.producto_id); if (prod) agregar(prod, r.cantidad) })
          showToast(`✓ ${o.etiqueta || o.nombre} añadida`)
        }}
        onLong={() => {
          if (!puedeOperar) { showToast(enDescanso ? 'Termina el descanso para vender' : 'Ficha tu entrada antes de vender', 'error'); setShowFichajes(true); return }
          if (!caja) { showToast('Abre la caja antes de vender', 'error'); setShowAperturaCaja(true); return }
          setCombModal(o)
        }} />
    )
  }
  const renderOfertaPack = (o) => {
    const prod = productos.find(p => p.id === o.producto_id)
    if (!prod) return null
    const stockDisp = stock[prod.id] ?? 0
    const qtyEnTicket = ticket.filter(i => i.id === prod.id && !i.regalo).reduce((s, i) => s + i.cantidad, 0)
    return (
      <TarjetaOfertaPack key={o.id} oferta={o} prod={prod}
        stockDisp={stockDisp} qtyEnTicket={qtyEnTicket}
        esFav={favOfertas.includes(o.id)} onFav={() => toggleFavOferta(o.id)}
        onTap={() => {
          if (qtyEnTicket >= o.cantidad_pack) { quitar(prod, o.cantidad_pack); showToast(`✕ ${o.etiqueta || o.nombre} retirada`, 'error') }
          else if (stockDisp < o.cantidad_pack) { showToast('Stock insuficiente', 'error') }
          else { agregar(prod, o.cantidad_pack); showToast(`✓ ${o.etiqueta || o.nombre} añadido`) }
        }}
        onLong={() => abrirModalCantidad(prod, o.cantidad_pack, o.etiqueta || o.nombre)} />
    )
  }
  const renderProducto = (p) => (
    <TarjetaProducto
      key={p.id} p={p}
      stockDisp={stock[p.id] ?? 0} enT={ticket.find(i => i.id === p.id)}
      tieneOferta={ofertas.some(o => o.producto_id === p.id)} esFav={favoritos.includes(p.id)}
      onTap={() => agregar(p, 1, false, true)}
      onLong={() => abrirModalCantidad(p)}
      onFav={(id) => setFavoritos([...toggleFavorito(id)])}
    />
  )

  const pctPolvora = kgLimite > 0 ? (kgPolvora / kgLimite) * 100 : 0

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl"><Logo style={{ height: 28 }} /></div>
        <div className="ti">
          <BadgeKgPolvora kgActual={kgPolvora} kgLimite={kgLimite} necDetalle={necDetalle} />
          {/* Botón fichaje compacto — en móvil se mueve al menú desplegable */}
          <span className="hide-mobile">{(() => {
            const est = calcularEstado(ultimoFichaje)
            const dot = { libre:'var(--s3)', trabajando:'var(--green)', descanso:'var(--gold)' }[est]
            const col = { libre:'var(--tx2)', trabajando:'var(--green)', descanso:'var(--gold)' }[est]
            const anim = est !== 'libre'
            return (
              <button onClick={() => setShowFichajes(true)} title={caseta?.nombre} style={{
                display:'flex',alignItems:'center',gap:5,padding:'5px 10px',
                borderRadius:20,border:`1px solid ${anim?(est==='descanso'?'rgba(var(--gold-rgb),.4)':'rgba(var(--green-rgb),.4)'):'var(--bd)'}`,
                background:anim?(est==='descanso'?'rgba(var(--gold-rgb),.12)':'rgba(var(--green-rgb),.12)'):'var(--s2)',
                color:col,cursor:'pointer',fontSize:'.73rem',fontWeight:700,fontFamily:"'DM Sans',sans-serif",
              }}>
                <span style={{width:7,height:7,borderRadius:'50%',background:dot,display:'inline-block',flexShrink:0,
                  animation:anim?'pulse 1.5s ease-in-out infinite':'none'}}/>
                {caseta?.nombre?.replace('Caballer ','').replace('La Petardería ','') || 'Fichar'}
              </button>
            )
          })()}</span>
          <button className="btn-o btn-eye hide-mobile" title="Ajustes" onClick={() => setShowAjustes(true)} style={{ padding: '6px 9px', flexShrink: 0 }}><i className="fi fi-rr-settings"/></button>
          {onSalirVenta
            ? <button className="btn-o topbar-salir" style={{padding:'5px 10px',fontSize:'.75rem',borderColor:'var(--ac)',color:'var(--ac)'}} onClick={onSalirVenta}>Panel admin</button>
            : <button className="btn-o topbar-salir" style={{padding:'5px 10px',fontSize:'.75rem'}} onClick={() => supabase.auth.signOut()}>Salir</button>}
        </div>
      </div>

      {/* Banner de estado — fichaje o caja */}
      {!fichajeLoading && !puedeOperar && (
        <div onClick={() => setShowFichajes(true)} style={{
          padding: '9px 14px', cursor: 'pointer',
          background: enDescanso ? 'rgba(var(--gold-rgb),.15)' : 'rgba(var(--ac-rgb),.12)',
          borderBottom: `2px solid ${enDescanso ? 'var(--gold)' : 'var(--ac)'}`,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: '.82rem', fontWeight: 700,
          color: enDescanso ? 'var(--gold)' : 'var(--ac)',
        }}>
          <i className={`fi ${enDescanso ? 'fi-rr-mug-hot' : 'fi-rr-clock'}`} style={{ fontSize: '1.1rem' }}/>
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
          background: 'rgba(var(--gold-rgb),.12)',
          borderBottom: '2px solid var(--gold)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: '.82rem', fontWeight: 700,
          color: 'var(--gold)',
        }}>
          <span>Caja no abierta — toca aquí para abrir caja y poder vender</span>
          <span style={{ marginLeft: 'auto', opacity: .7, fontSize: '.75rem' }}>→ Abrir caja</span>
        </div>
      )}

      {/* Alerta pólvora prominente */}
      {pctPolvora >= 80 && (
        <div style={{
          background: pctPolvora >= 100 ? 'rgba(var(--red-rgb),.2)' : pctPolvora >= 90 ? 'rgba(var(--red-rgb),.15)' : 'rgba(var(--gold-rgb),.12)',
          borderBottom: `2px solid ${pctPolvora >= 90 ? 'var(--red)' : 'var(--gold)'}`,
          padding: '7px 20px', fontSize: '.8rem', fontWeight: 700,
          color: pctPolvora >= 90 ? 'var(--red)' : 'var(--gold)',
        }}>
          {pctPolvora >= 100
            ? <><i className="fi fi-rr-siren"/> LÍMITE SUPERADO: {kgPolvora.toFixed(2)} kg de {kgLimite} kg permitidos ({pctPolvora.toFixed(0)}%) — Obligatorio reducir stock</>
            : pctPolvora >= 90
            ? <><i className="fi fi-rr-triangle-warning"/> ALERTA: Pólvora al {pctPolvora.toFixed(0)}% ({kgPolvora.toFixed(2)} kg de {kgLimite} kg) — NO recibir más stock</>
            : <><i className="fi fi-rr-triangle-warning"/> Pólvora al {pctPolvora.toFixed(0)}% — Cerca del límite ({kgPolvora.toFixed(2)} kg de {kgLimite} kg)</>
          }
        </div>
      )}

      {/* Subbar caja — diseño compacto para móvil */}
      <div style={{ padding: '6px 12px', background: 'var(--s1)', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '.78rem', overflowX: 'auto', position: 'relative' }}>
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
            <span style={{ color: 'var(--gold)', fontSize: '.72rem', fontWeight: 600, background: 'rgba(var(--gold-rgb),.1)', padding: '2px 7px', borderRadius: 10 }}>
              Sin caja
            </span>
          )}
          {modoRapido && <span style={{ background: 'rgba(var(--green-rgb),.15)', color: 'var(--green)', padding: '2px 6px', borderRadius: 20, fontSize: '.65rem', fontWeight: 700, flexShrink: 0 }}><i className="fi fi-rr-bolt"/></span>}
        </div>
        {/* Separador */}
        <div style={{ flex: 1 }} />
        {/* Botones escritorio — ocultos en móvil */}
        <div className="subbar-desktop-btns" style={{ gap: 5, flexShrink: 0 }}>
          <button className="btn-o subbar-btn" onClick={() => {
              if (!caja) { showToast('Abre la caja para ver los tickets del turno', 'error'); return }
              setShowHistorial(true)
            }}>
            <i className="fi fi-rr-receipt btn-icon"/><span className="btn-label">Tickets</span>
          </button>
          <button className="btn-o subbar-btn" style={{ position: 'relative' }}
            onClick={() => { setShowMisPedidos(true); sessionStorage.setItem('tpv_panel','pedidos') }}>
            <i className="fi fi-rr-truck-side btn-icon"/><span className="btn-label">Pedidos</span>
            {pedidosPend > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--ac)', color: 'white', borderRadius: '50%', width: 14, height: 14, fontSize: '.55rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {pedidosPend}
              </span>
            )}
          </button>
          <button className="btn-o subbar-btn" onClick={() => !pedidoActivo && setShowPedido(true)}
            disabled={pedidoActivo} title={pedidoActivo ? 'Ya hay un pedido activo' : undefined}
            style={pedidoActivo ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
            <i className="fi fi-rr-paper-plane btn-icon"/><span className="btn-label">Pedir</span>
          </button>
          <button className="btn-o subbar-btn" onClick={() => { setShowInventario(true); sessionStorage.setItem('tpv_panel','inventario') }}>
            <i className="fi fi-rr-chart-histogram btn-icon"/><span className="btn-label">Inventario</span>
          </button>
          <button className="btn-o subbar-btn" onClick={() => setShowDevolucion(true)}>
            <i className="fi fi-rr-undo btn-icon"/><span className="btn-label">Devolución</span>
          </button>
          <button className="btn-o subbar-btn" onClick={() => setShowBaja(true)}>
            <i className="fi fi-rr-box-open btn-icon"/><span className="btn-label">Baja</span>
          </button>
          {(perfil?.es_encargado || perfil?.rol === 'ADMIN') && (
            <button className="btn-o subbar-btn" onClick={() => setShowAjuste(true)}>
              <i className="fi fi-rr-refresh btn-icon"/><span className="btn-label">Ajustar stock</span>
            </button>
          )}
          {caja ? (
            <>
              <button className="btn-o subbar-btn" style={{ borderColor: 'rgba(var(--gold-rgb),.3)', color: 'var(--gold)' }} onClick={() => setShowRetirada(true)}>
                <i className="fi fi-rr-coins btn-icon"/><span className="btn-label">Retirada</span>
              </button>
              <button className="btn-o subbar-btn" style={{ borderColor: 'rgba(var(--red-rgb),.3)', color: 'var(--red)' }} onClick={() => setShowCierre(true)}>
                <i className="fi fi-rr-lock btn-icon"/><span className="btn-label">Cerrar caja</span>
              </button>
            </>
          ) : (
            <button className="btn-o subbar-btn" style={{ borderColor: 'rgba(var(--green-rgb),.4)', color: 'var(--green)' }}
              onClick={() => (estaFichado || esModoAdmin) ? setShowAperturaCaja(true) : (showToast('Ficha tu entrada primero', 'error'), setShowFichajes(true))}>
              <i className="fi fi-rr-lock-open-alt btn-icon"/><span className="btn-label">Abrir caja</span>
            </button>
          )}
        </div>
        {/* Botón hamburguesa — solo en móvil, visible via CSS */}
        <button className="hamburger-btn" onClick={() => setShowHamburger(v => !v)}>
          <i className={`fi ${showHamburger ? 'fi-rr-cross' : 'fi-rr-menu-burger'}`}/>
        </button>
        {/* Drawer lateral móvil — overlay + panel deslizante */}
        {showHamburger && (
          <div onClick={() => setShowHamburger(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,.55)' }} />
        )}
        <div className={`side-drawer${showHamburger ? ' side-drawer--open' : ''}`}>
          <div className="drawer-header">
            <div>
              <Logo style={{ height: 26, marginBottom: 6 }} />
              <div className="drawer-user-row">
                <span className="drawer-user">{perfil?.nombre || 'Empleado'}</span>
              </div>
            </div>
            <button className="drawer-close" onClick={() => setShowHamburger(false)}><i className="fi fi-rr-cross"/></button>
          </div>
          {(() => {
            const est = calcularEstado(ultimoFichaje)
            const col = { libre:'var(--tx2)', trabajando:'var(--green)', descanso:'var(--gold)' }[est]
            const lbl = { libre:'Sin fichar', trabajando:'Trabajando', descanso:'En descanso' }[est]
            return (
              <button className="hamburger-item" onClick={() => { setShowHamburger(false); setShowFichajes(true) }}>
                <i className="fi fi-rr-clock"/> Control de presencia
                <span style={{ marginLeft:'auto', fontSize:'.72rem', fontWeight:700, color:col }}>{lbl}</span>
              </button>
            )
          })()}
          <button className="hamburger-item" onClick={() => {
              setShowHamburger(false)
              if (!caja) { showToast('Abre la caja para ver los tickets del turno', 'error'); return }
              setShowHistorial(true)
            }}>
            <i className="fi fi-rr-receipt"/> Tickets
          </button>
          <button className="hamburger-item" onClick={() => { setShowHamburger(false); setShowMisPedidos(true); sessionStorage.setItem('tpv_panel','pedidos') }}>
            <i className="fi fi-rr-truck-side"/> Pedidos
            {pedidosPend > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--ac)', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: '.65rem', fontWeight: 700 }}>
                {pedidosPend}
              </span>
            )}
          </button>
          <button className="hamburger-item"
            onClick={() => { setShowHamburger(false); !pedidoActivo && setShowPedido(true) }}
            disabled={pedidoActivo}
            style={pedidoActivo ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}>
            <i className="fi fi-rr-paper-plane"/> Pedir
          </button>
          <button className="hamburger-item" onClick={() => { setShowHamburger(false); setShowInventario(true); sessionStorage.setItem('tpv_panel','inventario') }}>
            <i className="fi fi-rr-chart-histogram"/> Inventario
          </button>
          <button className="hamburger-item" onClick={() => { setShowHamburger(false); setShowDevolucion(true) }}>
            <i className="fi fi-rr-undo"/> Devolución
          </button>
          <button className="hamburger-item" onClick={() => { setShowHamburger(false); setShowBaja(true) }}>
            <i className="fi fi-rr-box-open"/> Baja / rotura
          </button>
          {(perfil?.es_encargado || perfil?.rol === 'ADMIN') && (
            <button className="hamburger-item" onClick={() => { setShowHamburger(false); setShowAjuste(true) }}>
              <i className="fi fi-rr-refresh"/> Ajustar stock
            </button>
          )}
          <div className="drawer-sep" />
          {caja ? (
            <>
              <button className="hamburger-item" style={{ color: 'var(--gold)' }}
                onClick={() => { setShowHamburger(false); setShowRetirada(true) }}>
                <i className="fi fi-rr-coins"/> Retirada de caja
              </button>
              <button className="hamburger-item" style={{ color: 'var(--red)' }}
                onClick={() => { setShowHamburger(false); setShowCierre(true) }}>
                <i className="fi fi-rr-lock"/> Cerrar caja
              </button>
            </>
          ) : (
            <button className="hamburger-item" style={{ color: 'var(--green)' }}
              onClick={() => { setShowHamburger(false); (estaFichado || esModoAdmin) ? setShowAperturaCaja(true) : (showToast('Ficha tu entrada primero', 'error'), setShowFichajes(true)) }}>
              <i className="fi fi-rr-lock-open-alt"/> Abrir caja
            </button>
          )}
          <div className="drawer-sep" />
          {onSalirVenta && (
            <button className="hamburger-item" style={{ color: 'var(--ac)' }}
              onClick={() => { setShowHamburger(false); onSalirVenta() }}>
              <i className="fi fi-rr-arrow-left"/> Volver al panel admin
            </button>
          )}
          <button className="hamburger-item" onClick={() => { setShowHamburger(false); setShowAjustes(true) }}>
            <i className="fi fi-rr-settings"/> Ajustes
          </button>
          <button className="hamburger-item" style={{ color: 'var(--tx2)' }}
            onClick={() => { setShowHamburger(false); supabase.auth.signOut() }}>
            <i className="fi fi-rr-sign-out-alt"/> Cerrar sesión
          </button>
        </div>
      </div>

      <div className="cnt">
        {/* ── Banner pedido automático ── */}
        {(() => {
          if (!caseta?.pedidos_auto_activos) return null
          if (pedidoActivo) return null
          if (minsRestantes > 120) return null
          const autoItems = productos.filter(p => {
            const min = stockMinimos[p.id] || 0
            return min > 0 && (stock[p.id] ?? 0) < min && !pedidosActivosProdIds.has(p.id)
          })
          if (autoItems.length === 0) return null
          const urgente = minsRestantes <= 30
          return (
            <div style={{
              background: urgente ? 'rgba(var(--red-rgb),.08)' : 'rgba(var(--ac-rgb),.08)',
              border: `1px solid ${urgente ? 'rgba(var(--red-rgb),.35)' : 'rgba(var(--ac-rgb),.35)'}`,
              borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '.84rem', marginBottom: 2 }}>
                  <i className={`fi ${urgente ? 'fi-rr-triangle-warning' : 'fi-rr-settings'}`}/> {autoItems.length} producto{autoItems.length !== 1 ? 's' : ''} por debajo del mínimo
                </div>
                <div style={{ fontSize: '.74rem', color: 'var(--tx2)' }}>
                  Hora de corte: {caseta.hora_corte_pedidos?.slice(0,5)} · faltan {countdown}
                </div>
              </div>
              <button onClick={() => setShowPedido(true)} style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 'var(--rs)',
                background: 'var(--ac)', border: '1px solid var(--ac)', color: 'white',
                fontWeight: 700, cursor: 'pointer', fontSize: '.8rem', fontFamily: "'DM Sans',sans-serif",
              }} disabled={pedidoActivo}>Generar pedido →</button>
            </div>
          )
        })()}

        <div className="tpvg">
          {/* Panel productos */}
          <div className="pp">
            <div className="srch">
              <input ref={busqRef} className="si" placeholder="Buscar producto o EAN..."
                value={busq} onChange={e => setBusq(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  const term = busq.trim()
                  if (!term) return
                  // EAN exacto → esos productos; si no, lo que coincide por nombre en la pestaña
                  const porEan = productos.filter(p => p.codigo_ean === term)
                  const candidatos = porEan.length >= 1 ? porEan : prodsFiltrados
                  if (candidatos.length === 0) return
                  // Un solo producto → añadir (1 directo, o modal según el toggle)
                  if (candidatos.length === 1) {
                    setBusq('')
                    añadirEscaneado(candidatos[0])
                    return
                  }
                  // Varios (por EAN duplicado o por nombre) → elegir cuál
                  setBusq(''); setEanPicker(candidatos)
                }} />
              <button className="bsc" onClick={() => setShowScan(true)}><i className="fi fi-rr-camera"/></button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--bd)' }}>
              {[
                ['todos',     <><i className="fi fi-rr-grid"/>{' '}Todos</>,                                          'var(--ac)'],
                ['favoritos', <><i className="fi fi-rr-star" style={{color:'var(--gold)'}}/>{' '}Favs</>, 'var(--gold)'],
                ['ofertas',   <><i className="fi fi-rr-label" style={{color:'var(--green)'}}/>{' '}Ofertas</>, 'var(--green)'],
              ].map(([k, l, color]) => (
                <button key={k} onClick={() => setTabTPV(k)} style={{
                  flex: 1, padding: '9px 4px', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${tabTPV === k ? color : 'transparent'}`,
                  color: tabTPV === k ? color : 'var(--tx2)', fontFamily: "'DM Sans',sans-serif",
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
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
            {(botonesRapidos.length > 0 || ofertasRapidas.length > 0 || combosRapidos.length > 0) && !busq && tabTPV !== 'ofertas' && (
              <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--bd)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.67rem', color: 'var(--tx2)', alignSelf: 'center', marginRight: 2 }}><i className="fi fi-rr-bolt"/></span>
                {botonesRapidos.map(p => (
                  <button key={p.id} onClick={() => agregar(p)} style={{
                    padding: '5px 11px', borderRadius: 20, border: '1px solid var(--bd)',
                    background: 'var(--s2)', color: 'var(--tx2)', fontSize: '.73rem',
                    fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                  }}>{p.nombre}</button>
                ))}
                {ofertasRapidas.map(o => {
                  const prod = productos.find(p => p.id === o.producto_id)
                  if (!prod) return null
                  return (
                    <button key={'of-' + o.producto_id} onClick={() => {
                      if ((stock[prod.id] ?? 0) < o.cantidad_pack) { showToast('Stock insuficiente', 'error'); return }
                      agregar(prod, o.cantidad_pack)
                      showToast(`✓ ${o.etiqueta || o.nombre || prod.nombre} añadido`)
                    }} style={{
                      padding: '5px 11px', borderRadius: 20, border: '1px solid var(--green)',
                      background: 'rgba(var(--green-rgb),.12)', color: 'var(--green)', fontSize: '.73rem',
                      fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    }}><i className="fi fi-rr-label"/> {prod.nombre} ×{o.cantidad_pack}</button>
                  )
                })}
                {combosRapidos.map(o => {
                  const reqs = o.productos_requeridos || []
                  return (
                    <button key={'comb-' + o.id} onClick={() => {
                      if (reqs.some(r => (stock[r.producto_id] ?? 0) < r.cantidad)) { showToast('Stock insuficiente', 'error'); return }
                      reqs.forEach(r => {
                        const prod = productos.find(p => p.id === r.producto_id)
                        if (prod) agregar(prod, r.cantidad)
                      })
                      showToast(`✓ ${o.etiqueta || o.nombre || 'Oferta'} añadida`)
                    }} style={{
                      padding: '5px 11px', borderRadius: 20, border: '1px solid var(--green)',
                      background: 'rgba(var(--green-rgb),.12)', color: 'var(--green)', fontSize: '.73rem',
                      fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                    }}><i className="fi fi-rr-label"/> {o.etiqueta || o.nombre}</button>
                  )
                })}
              </div>
            )}

            {/* Grid productos (pestañas Todos / Ofertas-oculto) */}
            {tabTPV !== 'favoritos' && (
              <div className="pg" style={{ display: tabTPV === 'ofertas' ? 'none' : undefined }}>
                {prodsFiltrados.map(renderProducto)}
              </div>
            )}

            {/* Favs: 50/50 — productos arriba, ofertas abajo, cada mitad con scroll propio */}
            {tabTPV === 'favoritos' && (
              favoritos.length === 0 && favOfertas.length === 0 ? (
                <div className="pg">
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--tx2)', padding: 30, fontSize: '.85rem' }}>
                    Pulsa <i className="fi fi-rr-star" style={{color:'var(--gold)'}}/> en cualquier producto u oferta para añadirlo a favoritos
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {favoritos.length > 0 && (
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderBottom: favOfertas.length > 0 ? '1px solid var(--bd)' : 'none' }}>
                      <div style={{ padding: '12px 12px 6px', fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <i className="fi fi-rr-star" style={{ color: 'var(--gold)' }}/> Productos favoritos
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gridAutoRows: '110px', gap: 10 }}>
                          {prodsFiltrados.map(renderProducto)}
                        </div>
                      </div>
                    </div>
                  )}
                  {favOfertas.length > 0 && (
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '12px 12px 6px', fontSize: '.72rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <i className="fi fi-rr-star" style={{ color: 'var(--gold)' }}/> Ofertas favoritas
                      </div>
                      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {ofertas.filter(o => favOfertas.includes(o.id)).map(o => o.tipo === 'combinada' ? renderOfertaComb(o) : renderOfertaPack(o))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* Tab ofertas */}
            {tabTPV === 'ofertas' && (
              <div style={{ padding: 12, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ofertas.filter(o => o.tipo === 'combinada').filter(o => {
                  if (!busq) return true
                  const b = busq.toLowerCase()
                  if ((o.etiqueta || o.nombre || '').toLowerCase().includes(b)) return true
                  return (o.productos_requeridos || []).some(r => productos.find(p => p.id === r.producto_id)?.nombre.toLowerCase().includes(b))
                }).map(renderOfertaComb)}
                {[...new Map(ofertas.filter(o => !o.tipo || o.tipo === 'pack').map(o => [o.producto_id, o])).values()].filter(o => {
                  if (!busq) return true
                  const b = busq.toLowerCase()
                  const prod = productos.find(p => p.id === o.producto_id)
                  return (prod?.nombre.toLowerCase().includes(b)) || (o.etiqueta || o.nombre || '').toLowerCase().includes(b)
                }).map(renderOfertaPack)}
              </div>
            )}
          </div>

          {/* Panel ticket */}
          <div className="tp" id="ticket-panel">
            <div className="th">
              <div className="tt"><i className="fi fi-rr-receipt"/> Ticket</div>
              <div className="tm">{perfil.nombre} · {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div className="tis">
              {ticket.length === 0
                ? <div className="te"><span style={{ fontSize: '2rem', opacity: .35, color: 'var(--tx2)' }}><i className="fi fi-rr-shopping-cart"/></span><span>Ticket vacío</span></div>
                : ticket.map(item => (
                  <TicketItem key={lineKey(item)} item={item} ofertas={ofertas} onQty={cambiarQty}
                    onSetQty={fijarQty} onRegalo={toggleRegalo}
                    onDel={key => setTicket(p => p.filter(i => lineKey(i) !== key))} />
                ))
              }
            </div>
            <div className="tf">
              <div className="tsb"><span>Artículos</span><span>{ticket.reduce((s, i) => s + i.cantidad, 0)}</span></div>
              {(() => {
                // Mismo orden de consumo que calcularTotalTicket: cada combinada
                // consume unidades para no contarlas dos veces entre ofertas.
                const restante = new Map(ticket.map(i => [i.id, i.cantidad]))
                const rows = []
                for (const o of ofertas.filter(x => x.tipo === 'combinada' && x.activa !== false)) {
                  const veces = vecesAplicables(o, restante)
                  if (veces <= 0) continue
                  let costeNormal = 0
                  for (const req of o.productos_requeridos) {
                    const item = ticket.find(i => i.id === req.producto_id)
                    costeNormal += (item ? item.precio : 0) * req.cantidad * veces
                    restante.set(req.producto_id, (restante.get(req.producto_id) || 0) - req.cantidad * veces)
                  }
                  const ahorro = costeNormal - o.precio_pack * veces
                  if (ahorro > 0) rows.push(
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderTop: '1px dashed rgba(var(--green-rgb),.3)', margin: '2px 0' }}>
                      <span style={{ fontSize: '.72rem', color: 'var(--green)', fontWeight: 600 }}><i className="fi fi-rr-label"/> {o.etiqueta || o.nombre}{veces > 1 && ` ×${veces}`}</span>
                      <span style={{ fontSize: '.72rem', color: 'var(--green)', fontWeight: 700 }}>-{fmt(ahorro)}</span>
                    </div>
                  )
                }
                return rows
              })()}
                {ticket.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderTop: '1px dashed rgba(255,255,255,.1)', margin: '2px 0' }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--tx2)', flexShrink: 0 }}>Descuento</span>
                  <input type="number" min="0" max="100" step="1" value={descuento || ''} placeholder="0"
                    onChange={e => setDescuento(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '4px 8px', color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif", fontSize: '.82rem', textAlign: 'right' }}
                    inputMode="numeric" />
                  <span style={{ fontSize: '.82rem', color: 'var(--tx2)', flexShrink: 0 }}>%</span>
                  {descuento > 0 && <button onClick={() => setDescuento(0)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: '.8rem', padding: 0 }}>✕</button>}
                </div>
              )}
            <div className="ttr">
                <span className="ttl">TOTAL</span>
                <span className="tta">{fmt(total)}</span>
              </div>
              <button className="bfin"
                disabled={ticket.length === 0 || !puedeOperar || !caja}
                onClick={() => {
                  if (!puedeOperar) {
                    showToast(enDescanso ? 'Termina el descanso para cobrar' : 'Ficha tu entrada para cobrar', 'error')
                    setShowFichajes(true)
                    return
                  }
                  if (!caja) { showToast('Abre la caja antes de cobrar', 'error'); setShowAperturaCaja(true); return }
                  setShowPago(true)
                }}>
                {!puedeOperar
                  ? (enDescanso ? 'En descanso' : 'Ficha para vender')
                  : !caja ? 'Abre la caja'
                  : 'Finalizar Venta →'}
              </button>
              {ticket.length > 0 && (
                <button className="bclr" onClick={() => { setTicket([]); setDescuento(0) }}><i className="fi fi-rr-cross"/> Limpiar ticket</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ fontSize: '.68rem', color: 'var(--tx2)', textAlign: 'center', marginTop: 8, opacity: .6 }}>
          Pulsa = +1 unidad · Mantén pulsado = selector de cantidad · <i className="fi fi-rr-star" style={{color:'var(--gold)'}}/> = favorito
        </div>
      </div>

      {/* ─── Botón flotante móvil: ir al ticket / subir ─── */}
      <BtnScroll />

      {/* ─── Modales ─── */}
      {prodModal && (
        <ModalCantidad producto={prodModal}
          stockDisp={Math.max(0, (stock[prodModal.id] ?? 0) - ticket.filter(i => i.id === prodModal.id).reduce((s, i) => s + i.cantidad, 0))}
          ofertas={ofertas} packSize={prodModal._packSize || 1} etiquetaOferta={prodModal._etiquetaOferta}
          onConfirm={(qty, regalo) => { agregar(prodModal, qty, regalo); setProdModal(null); setTimeout(() => busqRef.current?.focus(), 50) }}
          onClose={() => { setProdModal(null); setTimeout(() => busqRef.current?.focus(), 50) }} />
      )}
      {combModal && (
        <ModalCantidadComb oferta={combModal} productos={productos} stock={stock} ticket={ticket}
          onConfirm={(n) => {
            ;(combModal.productos_requeridos || []).forEach(r => {
              const prod = productos.find(p => p.id === r.producto_id)
              if (prod) agregar(prod, r.cantidad * n)
            })
            showToast(`✓ ${combModal.etiqueta || combModal.nombre}${n > 1 ? ` ×${n}` : ''} añadida`)
            setCombModal(null)
          }}
          onClose={() => setCombModal(null)} />
      )}
      {showScan && (
        <Scanner
          onDetect={(p, qty) => { agregar(p, qty || 1); setShowScan(false) }}
          onClose={() => setShowScan(false)}
          stock={stock} ofertas={ofertas} />
      )}
      {showAjustes && (
        <ModalAjustes
          modoRapido={modoRapido} onToggleModoRapido={() => setModoRapido(m => !m)}
          noImprimir={noImprimir} onToggleNoImprimir={() => setNoImprimir(n => !n)}
          modalAlEscanear={modalAlEscanear} onToggleModalEscanear={() => setModalAlEscanear(v => !v)}
          onClose={() => setShowAjustes(false)} />
      )}
      {eanPicker && (
        <div className="mo">
          <div className="mc">
            <ModalClose onClose={() => setEanPicker(null)} />
            <div className="mt-modal"><i className="fi fi-rr-interrogation"/> ¿Cuál es?</div>
            <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 12 }}>
              Varios productos coinciden. Elige el correcto.
            </div>
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {eanPicker.map(p => {
                const st = stock[p.id] ?? 0
                return (
                  <button key={p.id} onClick={() => { setEanPicker(null); añadirEscaneado(p) }} style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', marginBottom: 6, borderRadius: 'var(--rs)',
                    background: 'var(--s2)', border: '1px solid var(--bd)', cursor: 'pointer',
                    color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif", opacity: st > 0 ? 1 : .5,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '.88rem' }}>{p.nombre}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--tx2)' }}>{p.empresa ? `${p.empresa} · ` : ''}{p.categoria} · {fmt(p.precio)}</div>
                    </div>
                    <span style={{ fontSize: '.75rem', fontWeight: 700, color: st > 0 ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{st > 0 ? `Stock ${st}` : 'Agotado'}</span>
                  </button>
                )
              })}
            </div>
            <button className="btn-s" onClick={() => setEanPicker(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {showPago && (
        <ModalPago total={total} onConfirm={confirmarVenta} onClose={() => setShowPago(false)} />
      )}
      {showCierre && (
        <ModalCierreCaja caja={caja} caseta={caseta?.nombre} ventas={ventas}
          onClose={() => setShowCierre(false)} onCerrar={confirmarCierre} />
      )}
      {showRetirada && (
        <ModalRetirada caja={caja} perfil={perfil} caseta={caseta}
          onClose={() => setShowRetirada(false)}
          onDone={() => { setShowRetirada(false); showToast('✓ Retirada registrada') }} />
      )}

      {/* Modal apertura de caja */}
      {showAperturaCaja && (
        <div className="mo">
          <div className="mc">
            <ModalClose onClose={() => setShowAperturaCaja(false)} />
            <div className="mt-modal"><i className="fi fi-rr-lock-open-alt"/> Abrir Caja</div>
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
                const c = await abrirCaja(caseta.id, perfil.id, parseFloat(apertura) || 0, { nombreEmpleado: perfil.nombre, nombreCaseta: caseta.nombre })
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

      {showHistorial && caja && (
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
          stockMinimos={stockMinimos}
          pedidosActivosProdIds={pedidosActivosProdIds}
          itemsIniciales={pedidoBorrador}
          showToast={showToast}
          onClose={(itemsActuales) => { setPedidoBorrador(itemsActuales?.length ? itemsActuales : null); setShowPedido(false) }}
          onCreado={() => { setPedidoBorrador(null); setShowPedido(false); setPedidoActivo(true); refrescarTras() }} />
      )}
      {showMisPedidos && (
        <ModalMisPedidos caseta={caseta} perfil={perfil} productos={productos}
          showToast={showToast}
          onRecibido={refrescarTras}
          onStock={(pid, cant) => setStock(prev => ({ ...prev, [pid]: cant }))}
          onClose={() => { setShowMisPedidos(false); sessionStorage.removeItem('tpv_panel'); refrescarTras() }} />
      )}
      {showInventario && (
        <ModalInventario caseta={caseta} perfil={perfil} productos={productos} stockActual={stock}
          showToast={showToast} onClose={() => { setShowInventario(false); sessionStorage.removeItem('tpv_panel') }} />
      )}
      {showDevolucion && (
        <ModalDevolucion caseta={caseta} perfil={perfil} caja={caja} productos={productos} stock={stock}
          showToast={showToast}
          onDone={(delta) => setStock(prev => {
            const next = { ...prev }
            Object.entries(delta).forEach(([id, d]) => { next[id] = Math.max(0, (next[id] || 0) + d) })
            return next
          })}
          onClose={() => setShowDevolucion(false)} />
      )}
      {showBaja && (
        <ModalBaja caseta={caseta} perfil={perfil} caja={caja} productos={productos} stock={stock}
          showToast={showToast}
          onDone={(delta) => setStock(prev => {
            const next = { ...prev }
            Object.entries(delta).forEach(([id, d]) => { next[id] = Math.max(0, (next[id] || 0) + d) })
            return next
          })}
          onClose={() => setShowBaja(false)} />
      )}
      {showAjuste && (perfil?.es_encargado || perfil?.rol === 'ADMIN') && (
        <ModalAjusteStock caseta={caseta} perfil={perfil} productos={productos} stock={stock}
          showToast={showToast}
          onDone={(delta) => setStock(prev => {
            const next = { ...prev }
            Object.entries(delta).forEach(([id, d]) => { next[id] = Math.max(0, (next[id] || 0) + d) })
            return next
          })}
          onClose={() => setShowAjuste(false)} />
      )}
      {showOk && (
        <div className="mo">
          <div className="mc" style={{ textAlign: 'center' }}>
            <ModalClose onClose={() => setShowOk(null)} />
            <div style={{ fontSize: '2rem', marginBottom: 8, color: 'var(--green)' }}><i className="fi fi-rr-check-circle"/></div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.8rem', color: 'var(--green)', marginBottom: 6 }}>¡Venta Confirmada!</div>
            <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--ac)', marginBottom: 4 }}>{fmt(showOk.total)}</div>
            <div style={{ fontSize: '.83rem', color: 'var(--tx2)', marginBottom: 16 }}>
              {showOk.metodo === 'efectivo' ? `Efectivo · Cambio: ${fmt(showOk.cambio)}` : showOk.metodo === 'tarjeta' ? 'Tarjeta' : `Mixto · ${fmt(showOk.pagoEfectivo)} efectivo + ${fmt(showOk.pagoTarjeta)} tarjeta`}
            </div>
            {/* Botones imprimir — ticket y factura, en fila y mismo color */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button onClick={() => { imprimirTicket(showOk); setShowOk(null) }} style={{
                flex: 1, padding: '11px 6px', borderRadius: 'var(--rs)',
                background: 'var(--s2)', border: '1px solid var(--bd)',
                color: 'var(--tx)', fontWeight: 700, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif", fontSize: '.84rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <i className="fi fi-rr-print"/> Imprimir ticket
              </button>
              <button onClick={abrirFactura} style={{
                flex: 1, padding: '11px 6px', borderRadius: 'var(--rs)',
                background: 'var(--s2)', border: '1px solid var(--bd)',
                color: 'var(--tx)', fontWeight: 700, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif", fontSize: '.84rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <i className="fi fi-rr-file-invoice"/> Imprimir factura
              </button>
            </div>
            <button className="btn-p" onClick={() => setShowOk(null)}>Nueva Venta</button>
          </div>
        </div>
      )}
      {showFactura && (
        <FacturaModal onConfirm={onFacturaConfirm} onClose={() => setShowFactura(false)} />
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
