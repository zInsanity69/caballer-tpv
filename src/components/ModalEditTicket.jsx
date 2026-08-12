import React, { useState, useEffect } from 'react'
import { getOfertas, getProductos } from '../lib/api.js'
import { fmt, calcularPrecio, calcularTotalTicket } from '../lib/precios.js'
import ModalClose from './ModalClose.jsx'

// Modal de edición de ticket — fuente única, reutilizado por el panel del
// admin y el del empleado. onSave(ticketId, nuevoTotal, items) hace el guardado.
export default function ModalEditTicket({ ticket: t, onClose, onSave }) {
  const [items, setItems]     = useState(t.ticket_items.map(i=>({producto_id:i.producto_id,nombre:i.nombre_producto,precio:i.precio_unitario,cantidad:i.cantidad,total_linea:i.total_linea,con_oferta:i.con_oferta||false})))
  const [ofertas, setOfertas] = useState([])
  const [productos, setProductos] = useState([])
  const [busqAdd, setBusqAdd] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    Promise.all([getOfertas(), getProductos(true)]).then(([o, p]) => { setOfertas(o); setProductos(p) }).catch(() => {})
  }, [])

  const recalcItem = (item, nuevaCantidad) => {
    const nq = Math.max(1, nuevaCantidad)
    const { total } = calcularPrecio(item.producto_id, nq, item.precio, ofertas)
    return { ...item, cantidad: nq, total_linea: total, con_oferta: total < +(nq * item.precio).toFixed(2) }
  }

  const editQty = (idx, delta) => setItems(prev => prev.map((it, i) => i !== idx ? it : recalcItem(it, it.cantidad + delta)))
  const editDel = idx => setItems(prev => prev.filter((_, i) => i !== idx))

  const addProd = (prod) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.producto_id === prod.id)
      if (idx >= 0) {
        const it = prev[idx]
        return prev.map((x, i) => i !== idx ? x : recalcItem(x, it.cantidad + 1))
      }
      const { total } = calcularPrecio(prod.id, 1, prod.precio, ofertas)
      return [...prev, { producto_id: prod.id, nombre: prod.nombre, precio: prod.precio, cantidad: 1, total_linea: total, con_oferta: false }]
    })
    setBusqAdd('')
  }

  // Total final con ofertas combinadas aplicadas al conjunto
  const ticketParaCalculo = items.map(i => ({ id: i.producto_id, cantidad: i.cantidad, precio: i.precio }))
  const nuevoTotal = calcularTotalTicket(ticketParaCalculo, ofertas)
  const ahorroTotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0) - nuevoTotal
  const vacio = items.length === 0 || nuevoTotal <= 0

  const guardar = async () => {
    if (vacio) { alert('El ticket no puede quedar vacío ni a 0 €. Usa Eliminar o crea una incidencia.'); return }
    const itemsConTotal = items.map(i => ({ ...i, total_linea: calcularPrecio(i.producto_id, i.cantidad, i.precio, ofertas).total }))
    setSaving(true)
    try { await onSave(t.id, nuevoTotal, itemsConTotal); onClose() } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const prodsFiltrados = busqAdd.length >= 2
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqAdd.toLowerCase()) || p.codigo_ean?.includes(busqAdd)).slice(0, 6)
    : []

  return(
    <div className="mo">
      <div className="mc wide" style={{maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-pencil"/> Editar Ticket</div>
        <div style={{fontSize:'.78rem',color:'var(--tx2)',marginBottom:12}}>{new Date(t.creado_en).toLocaleString('es-ES')} · {t.perfiles?.nombre || t.empleado_nombre || '—'} · {t.casetas?.nombre || ''}</div>

        {/* Buscador para añadir productos */}
        <div style={{position:'relative',marginBottom:10}}>
          <input className="si" placeholder="Añadir producto..." value={busqAdd} onChange={e=>setBusqAdd(e.target.value)} style={{width:'100%'}}/>
          {prodsFiltrados.length>0&&(
            <div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',zIndex:10,maxHeight:200,overflowY:'auto'}}>
              {prodsFiltrados.map(p=>(
                <div key={p.id} onClick={()=>addProd(p)} style={{padding:'8px 12px',cursor:'pointer',fontSize:'.85rem',borderBottom:'1px solid var(--bd)',display:'flex',justifyContent:'space-between'}} onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                  <span>{p.nombre}</span><span style={{color:'var(--ac)',fontWeight:700}}>{fmt(p.precio)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{overflowY:'auto',flex:1}}>
          {items.map((item,idx)=>(
            <div key={idx} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid var(--bd)'}}>
              <div style={{flex:1,fontSize:'.85rem'}}>
                {item.nombre}
                {item.con_oferta&&<span style={{marginLeft:5,fontSize:'.65rem',color:'var(--green)',fontWeight:700}}>oferta</span>}
              </div>
              <button className="qb" onClick={()=>editQty(idx,-1)}>−</button>
              <span style={{minWidth:26,textAlign:'center',fontWeight:700}}>{item.cantidad}</span>
              <button className="qb" onClick={()=>editQty(idx,+1)}>+</button>
              <span style={{minWidth:55,textAlign:'right',fontSize:'.85rem',color:'var(--ac)'}}>{fmt(item.total_linea)}</span>
              <button onClick={()=>editDel(idx)} style={{width:26,height:26,borderRadius:'50%',border:'1px solid rgba(var(--red-rgb),.3)',background:'rgba(var(--red-rgb),.1)',color:'var(--red)',cursor:'pointer',fontSize:'.8rem',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="fi fi-rr-cross"/></button>
            </div>
          ))}
          {vacio&&<div style={{textAlign:'center',color:'var(--red)',padding:16,fontSize:'.82rem',background:'rgba(var(--red-rgb),.08)',borderRadius:'var(--rs)',marginTop:8}}><i className="fi fi-rr-triangle-warning"/> El ticket no puede quedar vacío ni a 0 €. Usa Eliminar o crea una incidencia.</div>}
        </div>
        {ahorroTotal>0.005&&<div style={{fontSize:'.78rem',color:'var(--green)',padding:'4px 0'}}>✓ Ahorro ofertas: -{fmt(ahorroTotal)}</div>}
        <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,padding:'10px 0'}}><span>Nuevo total</span><span style={{color:'var(--ac)'}}>{fmt(nuevoTotal)}</span></div>
        <button className="btn-p" disabled={saving||vacio} onClick={guardar}>{saving?'Guardando...':'✓ Guardar cambios'}</button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}
