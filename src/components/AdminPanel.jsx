import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { imprimirTicket, ticketRowToDatos } from '../lib/ticket.js'
import FacturaModal from './FacturaModal.jsx'
import ModalEditTicket from './ModalEditTicket.jsx'
import ModalClose from './ModalClose.jsx'
import { ModalPedido } from './EmpleadoPanel.jsx'
import Logo from './Logo.jsx'
import {
  getProductos, upsertProducto, toggleProducto, deleteProducto,
  getCategorias, crearCategoria, renombrarCategoria, eliminarCategoria,
  getOfertas, upsertOferta, updateOferta, deleteOferta, setTodasOfertasActivas,
  getPerfiles, updatePerfil, eliminarPerfil, crearUsuario, actualizarCredenciales,
  getCasetas, upsertCaseta, deleteCaseta, updateCaseta, updateAllPedidosAuto,
  getStatsAdmin, getTicketsAdmin, deleteTicket, updateTicket, getCajasAbiertas, updateTicketNota, getRetiradasHoy, getVentasTotalesPorCaseta, guardarFacturaCliente,
  getAuditoriaTickets,
  getDevoluciones, getDefectuosos, updateReclamacionItem,
  setStock, ajustarStock, ajustarStockAuditado, getStockAuditoria, getStockCaseta, getStockMinimos, setStockMinimo,
  getVentasPorDia,
  getPedidos, crearPedido, updatePedido, updatePedidoItems,
  getFichajesAdmin, editarFichaje, deleteFichaje, calcularTurnos, calcularEstado, fmtDuracion,
  getInventarios, confirmarInventario,
  getKgPolvora,
  getAlertasConfig, updateAlertaConfig,
} from '../lib/api.js'
import { fmt, calcularPrecio, calcularTotalTicket } from '../lib/precios.js'
import { DIVISIONES, evaluarNEC } from '../lib/nec.js'
import ThemeToggle from './ThemeToggle.jsx'

const TABS = [
  ['dashboard',   'fi-rr-chart-histogram', 'Dashboard'],
  ['ventas',      'fi-rr-coins',           'Ventas'],
  ['tickets',     'fi-rr-receipt',         'Tickets'],
  ['auditoria',   'fi-rr-time-past',       'Cambios'],
  ['devoluciones','fi-rr-undo',            'Devoluc.'],
  ['defectuosos', 'fi-rr-box-open',        'Defectuosos'],
  ['pedidos',     'fi-rr-truck-side',      'Pedidos'],
  ['inventarios', 'fi-rr-clipboard-list',  'Inventarios'],
  ['fichajes',    'fi-rr-clock',           'Fichajes'],
  ['productos',   'fi-rr-box',             'Productos'],
  ['stock',       'fi-rr-list',            'Stock'],
  ['ofertas',     'fi-rr-label',           'Ofertas'],
  ['casetas',     'fi-rr-shop',            'Casetas'],
  ['usuarios',    'fi-rr-users',           'Usuarios'],
  ['alertas',     'fi-rr-bell',            'Alertas'],
]

// ─── SCROLL HORIZONTAL CON RUEDA ─────────────────────────────
function useWheelScroll() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const h = (e) => { if (e.deltaY === 0) return; e.preventDefault(); el.scrollLeft += e.deltaY }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])
  return ref
}
function WheelScrollDiv({ children, className, style }) {
  const ref = useWheelScroll()
  return <div ref={ref} className={className} style={style}>{children}</div>
}



function Toast({ msg, type }) {
  return <div className="twrap"><div className={`toast ${type === 'error' ? 'te2' : 'tok'}`}>{msg}</div></div>
}

// ─── DASHBOARD ────────────────────────────────────────────────
function Dashboard({ casetas }) {
  const [stats, setStats] = useState(null)
  const [tickets, setTickets] = useState([])
  const [cajas, setCajas] = useState([])
  const [retiradas, setRetiradas] = useState([])
  const [ventasCasetaMes, setVentasCasetaMes] = useState([])
  const [ventasCasetaHoy, setVentasCasetaHoy] = useState([])
  const [periodoCaseta, setPeriodoCaseta] = useState(() => localStorage.getItem('admin_periodo_caseta') || 'mes') // 'mes' | 'hoy'
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    const mes = new Date(); mes.setDate(1); mes.setHours(0,0,0,0)
    Promise.all([getStatsAdmin(), getTicketsAdmin(hoy.toISOString(), null, null), getCajasAbiertas(), getRetiradasHoy().catch(()=>[]), getVentasTotalesPorCaseta(mes.toISOString()).catch(()=>[]), getVentasTotalesPorCaseta(hoy.toISOString()).catch(()=>[])])
      .then(([s, t, c, r, vm, vh]) => { setStats(s); setTickets(t); setCajas(c); setRetiradas(r); setVentasCasetaMes(vm); setVentasCasetaHoy(vh) })
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="loading-row"><div className="spin-sm" /> Cargando...</div>
  if (!stats) return <div className="loading-row" style={{color:'var(--red)'}}>Error al cargar el dashboard — recarga la página</div>
  const totalHoy = stats.tickets.reduce((s,t) => s+t.total, 0)
  const devolucionesHoy = stats.devolucionesHoy || 0
  const ventasNetas = totalHoy - devolucionesHoy
  const efectivoHoy = stats.tickets.reduce((s,t)=>s+(t.pago_efectivo ?? (t.metodo_pago==='efectivo'?t.total:0)),0)
  const tarjetaHoy = stats.tickets.reduce((s,t)=>s+(t.pago_tarjeta ?? (t.metodo_pago==='tarjeta'?t.total:0)),0)
  return (
    <>
      <div className="ag">
        <div className="sc"><div className="sv">{fmt(totalHoy)}</div><div className="sl2">Ventas brutas hoy</div></div>
        {devolucionesHoy>0&&<div className="sc"><div className="sv" style={{color:'var(--red)'}}>−{fmt(devolucionesHoy)}</div><div className="sl2">Devoluciones hoy</div></div>}
        {devolucionesHoy>0&&<div className="sc"><div className="sv" style={{color:'var(--green)'}}>{fmt(ventasNetas)}</div><div className="sl2">Ventas netas hoy</div></div>}
        <div className="sc"><div className="sv">{stats.tickets.length}</div><div className="sl2">Tickets hoy</div></div>
        <div className="sc"><div className="sv">{fmt(efectivoHoy)}</div><div className="sl2">Efectivo hoy</div></div>
        <div className="sc"><div className="sv">{fmt(tarjetaHoy)}</div><div className="sl2">Tarjeta hoy</div></div>
        <div className="sc"><div className="sv" style={{color:(stats.stockBajo.length+stats.stockCero.length)>5?'var(--red)':'var(--ac)'}}>{stats.stockBajo.length+stats.stockCero.length}</div><div className="sl2">Stock bajo/agotado</div></div>
        <div className="sc"><div className="sv">{casetas.filter(c=>c.activo!==false).length}</div><div className="sl2">Casetas activas</div></div>
      </div>
      {cajas.length>0&&(<>
        <div className="stit">Efectivo en caja ahora</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10,marginBottom:22}}>
          {[...cajas].sort((a,b)=>b.totalEfectivo-a.totalEfectivo).map((c,i)=>(
            <div key={c.casetaId} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:'16px',position:'relative',overflow:'hidden'}}>
              {i===0&&<div style={{position:'absolute',top:8,right:10,fontSize:'.65rem',fontWeight:700,color:'var(--gold)',background:'rgba(var(--gold-rgb),.12)',border:'1px solid rgba(var(--gold-rgb),.25)',borderRadius:20,padding:'1px 7px'}}>TOP {i+1}</div>}
              {i===1&&<div style={{position:'absolute',top:8,right:10,fontSize:'.65rem',fontWeight:700,color:'var(--tx2)',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:20,padding:'1px 7px'}}>TOP {i+1}</div>}
              {i>=2&&<div style={{position:'absolute',top:8,right:10,fontSize:'.65rem',fontWeight:700,color:'var(--tx2)',background:'transparent',borderRadius:20,padding:'1px 7px'}}>#{i+1}</div>}
              <div style={{fontSize:'.7rem',color:'var(--tx2)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>{c.casetaNombre.replace('Caballer ','')}</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2rem',color:'var(--green)',letterSpacing:1}}>{fmt(c.totalEfectivo)}</div>
              {c.totalRetiradas>0&&<div style={{fontSize:'.7rem',color:'var(--gold)',marginTop:2}}>Retiradas −{fmt(c.totalRetiradas)}</div>}
              {c.totalDevoluciones>0&&<div style={{fontSize:'.7rem',color:'var(--red)',marginTop:2}}>Devoluciones −{fmt(c.totalDevoluciones)}</div>}
              <div style={{fontSize:'.7rem',color:'var(--tx2)',marginTop:2}}>{c.numTickets} tickets · Apertura {fmt(c.apertura)}</div>
            </div>
          ))}
        </div>
      </>)}
      {(ventasCasetaMes.some(c=>Number(c.total_ventas)>0&&c.activo!==false)||ventasCasetaHoy.some(c=>Number(c.total_ventas)>0&&c.activo!==false))&&(<>
        <div className="stit" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span>Ganado por caseta</span>
          <div style={{display:'flex',gap:0,background:'var(--s2)',borderRadius:'var(--rs)',padding:3}}>
            {[['mes','Este mes'],['hoy','Hoy']].map(([k,l])=>(
              <button key={k} onClick={()=>{setPeriodoCaseta(k);localStorage.setItem('admin_periodo_caseta',k)}} style={{
                padding:'4px 12px',borderRadius:'calc(var(--rs) - 2px)',border:'none',cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif",fontSize:'.75rem',fontWeight:700,
                background:periodoCaseta===k?'var(--ac)':'transparent',color:periodoCaseta===k?'white':'var(--tx2)',
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10,marginBottom:22}}>
          {(periodoCaseta==='mes'?ventasCasetaMes:ventasCasetaHoy).filter(c=>Number(c.total_ventas)>0&&c.activo!==false).slice(0,5).map((c,i)=>(
            <div key={c.caseta_id} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:'16px',position:'relative',overflow:'hidden'}}>
              {i===0&&<div style={{position:'absolute',top:8,right:10,fontSize:'.65rem',fontWeight:700,color:'var(--gold)',background:'rgba(var(--gold-rgb),.12)',border:'1px solid rgba(var(--gold-rgb),.25)',borderRadius:20,padding:'1px 7px'}}>TOP 1</div>}
              {i===1&&<div style={{position:'absolute',top:8,right:10,fontSize:'.65rem',fontWeight:700,color:'var(--tx2)',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:20,padding:'1px 7px'}}>TOP 2</div>}
              {i>=2&&<div style={{position:'absolute',top:8,right:10,fontSize:'.65rem',fontWeight:700,color:'var(--tx2)',borderRadius:20,padding:'1px 7px'}}>#{i+1}</div>}
              <div style={{fontSize:'.7rem',color:'var(--tx2)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>{c.nombre.replace('Caballer ','')}</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'2rem',color:'var(--ac)',letterSpacing:1}}>{fmt(Number(c.total_ventas))}</div>
              <div style={{fontSize:'.7rem',color:'var(--tx2)',marginTop:2}}>{c.num_tickets} tickets</div>
            </div>
          ))}
        </div>
      </>)}
      {retiradas.length>0&&(<>
        <div className="stit">Retiradas de caja hoy</div>
        <div style={{marginBottom:22,background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:'var(--r)',overflow:'hidden'}}>
          {retiradas.map((r,i)=>(
            <div key={r.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 16px',borderTop:i>0?'1px solid var(--bd)':'none',fontSize:'.85rem'}}>
              <span style={{color:'var(--tx2)',flexShrink:0,fontSize:'.78rem'}}>{new Date(r.creado_en).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
              <span style={{color:'var(--tx2)',flexShrink:0}}>{r.casetas?.nombre?.replace('Caballer ','') || '?'}</span>
              <span style={{flexGrow:1}}>{r.perfiles?.nombre || r.empleado_nombre || '—'}</span>
              {r.motivo&&<span style={{color:'var(--tx2)',fontSize:'.78rem',fontStyle:'italic',flexShrink:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{r.motivo}</span>}
              <span style={{fontWeight:700,color:'var(--gold)',flexShrink:0}}>−{fmt(r.cantidad)}</span>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',padding:'8px 16px',borderTop:'1px solid var(--bd)',fontWeight:700,fontSize:'.85rem',background:'var(--s2)'}}>
            <span style={{color:'var(--tx2)'}}>Total retirado hoy</span>
            <span style={{color:'var(--gold)'}}>{fmt(retiradas.reduce((s,r)=>s+(r.cantidad||0),0))}</span>
          </div>
        </div>
      </>)}
      <div className="stit">Últimos tickets</div>
      <div className="tw">
        <table>
          <thead><tr><th>Hora</th><th>Caseta</th><th>Empleado</th><th>Método</th><th>Total</th></tr></thead>
          <tbody>
            {tickets.length===0?<tr><td colSpan={5} style={{textAlign:'center',color:'var(--tx2)',padding:20}}>Sin ventas hoy</td></tr>
              :tickets.slice(0,25).map(t=>(
              <tr key={t.id}>
                <td style={{color:'var(--tx2)'}}>{new Date(t.creado_en).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td>
                <td style={{color:'var(--tx2)'}}>{t.casetas?.nombre}</td>
                <td>{t.perfiles?.nombre || t.empleado_nombre || '—'}</td>
                <td style={{textAlign:'left',whiteSpace:'nowrap'}}>{t.metodo_pago==='efectivo'?<><i className="fi fi-rr-coins"/> Efectivo</>:t.metodo_pago==='tarjeta'?<><i className="fi fi-rr-credit-card"/> Tarjeta</>:<><i className="fi fi-rr-coins"/> <i className="fi fi-rr-credit-card"/> Mixto <span style={{color:'var(--tx2)',fontSize:'.72rem'}}>({fmt(t.pago_efectivo)} ef · {fmt(t.pago_tarjeta)} tj)</span></>}</td>
                <td style={{fontWeight:700,color:'var(--ac)'}}>{fmt(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StockAlerta stockBajo={stats.stockBajo} stockCero={stats.stockCero} casetas={casetas} />
    </>
  )
}

function StockAlerta({ stockBajo, stockCero, casetas }) {
  const [casetaSel, setCasetaSel] = useState('')
  const [vista, setVista] = useState('critico')
  const filtrar = l => casetaSel ? l.filter(s=>s.casetas?.id===casetaSel) : l
  const listaCritico = filtrar(stockBajo)
  const listaAgotado = filtrar(stockCero)
  const lista = vista==='critico' ? listaCritico : listaAgotado
  return (
    <>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:10}}>
        <div className="stit" style={{margin:0}}>Stock</div>
        <div style={{display:'flex',gap:0,background:'var(--s2)',borderRadius:'var(--rs)',padding:3}}>
          <button onClick={()=>setVista('critico')} style={{padding:'5px 14px',borderRadius:'var(--rs)',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.76rem',background:vista==='critico'?'var(--gold)':'transparent',color:vista==='critico'?'#000':'var(--tx2)'}}><i className="fi fi-rr-triangle-warning"/> Crítico ({listaCritico.length})</button>
          <button onClick={()=>setVista('agotado')} style={{padding:'5px 14px',borderRadius:'var(--rs)',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.76rem',background:vista==='agotado'?'var(--red)':'transparent',color:vista==='agotado'?'white':'var(--tx2)'}}><i className="fi fi-rr-cross-circle"/> Agotado ({listaAgotado.length})</button>
        </div>
        <select value={casetaSel} onChange={e=>setCasetaSel(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'6px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif",fontSize:'.8rem'}}>
          <option value="">Todas las casetas</option>
          {casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="tw" style={{marginBottom:22}}>
        <table>
          <thead><tr><th>Producto</th><th>Caseta</th><th>Stock</th></tr></thead>
          <tbody>
            {lista.length===0?<tr><td colSpan={3} style={{textAlign:'center',color:'var(--tx2)',padding:20}}>{vista==='critico'?'✓ Sin productos críticos':'✓ Sin productos agotados'}</td></tr>
              :lista.map((s,i)=>(
              <tr key={i}>
                <td>{s.productos?.nombre}</td>
                <td style={{color:'var(--tx2)'}}>{s.casetas?.nombre}</td>
                <td style={{color:s.cantidad===0?'var(--red)':'var(--gold)',fontWeight:700}}>{s.cantidad===0?'Agotado':s.cantidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── PANEL VENTAS ─────────────────────────────────────────────
function PanelVentas({ casetas, onVerDia }) {
  const hoy = new Date()
  const [año, setAño] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth()+1)
  const [casetaSel, setCasetaSel] = useState('')
  const [datos, setDatos] = useState({})
  const [loading, setLoading] = useState(false)
  const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  useEffect(()=>{ setLoading(true); getVentasPorDia(casetaSel||null,año,mes).then(setDatos).finally(()=>setLoading(false)) },[año,mes,casetaSel])
  const diasEnMes=new Date(año,mes,0).getDate(), primerDia=new Date(año,mes-1,1).getDay(), ajuste=(primerDia+6)%7
  const totalMes=Object.values(datos).reduce((s,d)=>s+d.efectivo+d.tarjeta,0)
  const ticketsMes=Object.values(datos).reduce((s,d)=>s+d.tickets,0)
  const diasConVenta=Object.keys(datos).length
  const maxDia=Math.max(...Object.values(datos).map(d=>d.efectivo+d.tarjeta),1)
  const diaStr=d=>`${año}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  return (
    <>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:18,flexWrap:'wrap'}}>
        <select value={mes} onChange={e=>setMes(Number(e.target.value))} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>{MESES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
        <select value={año} onChange={e=>setAño(Number(e.target.value))} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>{[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}</select>
        <select value={casetaSel} onChange={e=>setCasetaSel(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}><option value="">Todas</option>{casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
      </div>
      <div className="ag" style={{marginBottom:20}}>
        <div className="sc"><div className="sv">{fmt(totalMes)}</div><div className="sl2">Total {MESES[mes-1]}</div></div>
        <div className="sc"><div className="sv">{ticketsMes}</div><div className="sl2">Tickets</div></div>
        <div className="sc"><div className="sv">{diasConVenta}</div><div className="sl2">Días con venta</div></div>
        <div className="sc"><div className="sv">{diasConVenta?fmt(totalMes/diasConVenta):'—'}</div><div className="sl2">Media/día</div></div>
      </div>
      {loading?<div className="loading-row"><div className="spin-sm"/>Cargando...</div>:(
        <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:16,marginBottom:20}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:6}}>
            {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=><div key={d} style={{textAlign:'center',fontSize:'.68rem',color:'var(--tx2)',fontWeight:700,padding:'4px 0'}}>{d}</div>)}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
            {Array(ajuste).fill(null).map((_,i)=><div key={`e${i}`}/>)}
            {Array(diasEnMes).fill(null).map((_,i)=>{
              const dia=i+1,key=diaStr(dia),d=datos[key],tot=d?d.efectivo+d.tarjeta:0
              const esHoy=key===hoy.toISOString().slice(0,10),intensidad=tot>0?Math.max(0.12,tot/maxDia):0,esMayor=tot===maxDia&&tot>0
              const txCol=esMayor?'white':(tot>0?'var(--tx)':'var(--tx2)')
              return(
                <div key={dia} onClick={()=>tot>0&&onVerDia(key)} style={{borderRadius:8,padding:'6px 4px',textAlign:'center',background:tot>0?`rgba(var(--ac-rgb),${intensidad})`:'var(--s2)',border:`2px solid ${esHoy?'var(--ac)':'transparent'}`,minHeight:54,cursor:tot>0?'pointer':'default'}}
                  onMouseEnter={e=>{if(tot>0)e.currentTarget.style.filter='brightness(1.15)'}} onMouseLeave={e=>{e.currentTarget.style.filter='none'}}>
                  <div style={{fontSize:'.7rem',color:txCol,fontWeight:700}}>{dia}</div>
                  {tot>0&&<><div style={{fontSize:'.62rem',color:txCol,fontWeight:800,marginTop:2}}>{fmt(tot)}</div><div style={{fontSize:'.56rem',color:esMayor?'rgba(255,255,255,.8)':'var(--tx2)'}}>{d.tickets}t</div></>}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="stit">Detalle por día</div>
      <div className="tw">
        <table>
          <thead><tr><th>Día</th><th>Tickets</th><th>Efectivo</th><th>Tarjeta</th><th>Total</th></tr></thead>
          <tbody>
            {Object.entries(datos).length===0?<tr><td colSpan={5} style={{textAlign:'center',color:'var(--tx2)',padding:20}}>Sin ventas</td></tr>
              :Object.entries(datos).sort((a,b)=>b[0].localeCompare(a[0])).map(([dia,d])=>(
              <tr key={dia} onClick={()=>onVerDia(dia)} style={{cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                <td style={{fontWeight:600}}>{new Date(dia+'T12:00:00').toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})} <span style={{fontSize:'.68rem',color:'var(--tx2)'}}>→ ver</span></td>
                <td style={{color:'var(--tx2)'}}>{d.tickets}</td>
                <td style={{color:'var(--green)'}}>{fmt(d.efectivo)}</td>
                <td style={{color:'var(--blue)'}}>{fmt(d.tarjeta)}</td>
                <td style={{fontWeight:700,color:'var(--ac)'}}>{fmt(d.efectivo+d.tarjeta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── PANEL TICKETS ────────────────────────────────────────────
// ModalEditTicket vive ahora en ./ModalEditTicket.jsx (reutilizado por admin y empleado)

function PanelTickets({ casetas, filtroInicial }) {
  const hoy=new Date(); hoy.setHours(0,0,0,0)
  const [desde,setDesde]=useState(filtroInicial?.desde||hoy.toISOString().slice(0,10))
  const [hasta,setHasta]=useState(filtroInicial?.hasta||new Date().toISOString().slice(0,10))
  const [casetaSel,setCasetaSel]=useState('')
  const [busqInline,setBusqInline]=useState('')
  const [tickets,setTickets]=useState([])
  const [loading,setLoading]=useState(false)
  const [expanded,setExpanded]=useState(null)
  const [editando,setEditando]=useState(null)
  const [facturaT,setFacturaT]=useState(null)
  const [toast,setToast]=useState(null)
  const showToast=(msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2500) }

  const onHacerFactura=(cliente)=>{
    const t=facturaT
    imprimirTicket(ticketRowToDatos(t),{ esFactura:true, cliente })
    guardarFacturaCliente(t.id,cliente).catch(()=>{})
    setTickets(prev=>prev.map(x=>x.id===t.id?{...x,factura:true,cliente_nombre:cliente.razonSocial,cliente_cif:cliente.cif,cliente_direccion:cliente.direccion}:x))
    setFacturaT(null); showToast('Factura generada ✓')
  }

  const buscar=(d=desde,h=hasta,c=casetaSel)=>{
    setLoading(true)
    getTicketsAdmin(d+'T00:00:00',h+'T23:59:59',c||null).then(setTickets).finally(()=>setLoading(false))
  }
  useEffect(()=>{ buscar() },[])

  const eliminar=async id=>{ if(!window.confirm('¿Eliminar ticket?')) return; try{await deleteTicket(id);setTickets(p=>p.filter(t=>t.id!==id));showToast('Eliminado')}catch(e){showToast(e.message,'error')} }
  const resolverIncidencia=async t=>{ if(!window.confirm(`¿Marcar incidencia como resuelta?\n"${t.notas}"`)) return; try{await updateTicketNota(t.id,null);setTickets(p=>p.map(x=>x.id===t.id?{...x,notas:null}:x));showToast('Incidencia resuelta ✓')}catch(e){showToast(e.message,'error')} }

  const handleSave=async(id,nuevoTotal,nuevosItems)=>{
    // Calcular delta de stock y actualizar antes de guardar el ticket
    const ticketOriginal = tickets.find(t=>t.id===id)
    const casetaId = ticketOriginal?.caseta_id
    if(casetaId) {
      const itemsOrig = ticketOriginal?.ticket_items || []
      const delta = {}
      itemsOrig.forEach(i=>{ delta[i.producto_id]=(delta[i.producto_id]||0)+i.cantidad })  // devolver
      nuevosItems.forEach(i=>{ delta[i.producto_id]=(delta[i.producto_id]||0)-i.cantidad }) // restar
      for(const [prodId, diff] of Object.entries(delta)) {
        if(diff===0) continue
        try {
          const { data: st } = await supabase.from('stock').select('cantidad').eq('producto_id',prodId).eq('caseta_id',casetaId).maybeSingle()
          if(st) await supabase.from('stock').update({cantidad:Math.max(0,(st.cantidad||0)+diff)}).eq('producto_id',prodId).eq('caseta_id',casetaId)
        } catch(_) {}
      }
    }
    await updateTicket(id,nuevoTotal,nuevosItems)
    setTickets(prev=>prev.map(t=>t.id===id?{...t,total:nuevoTotal,ticket_items:nuevosItems.map(i=>({...i,nombre_producto:i.nombre,precio_unitario:i.precio}))}:t))
    setEditando(null); showToast('Ticket actualizado y stock ajustado ✓')
  }

  const filtrados=busqInline?tickets.filter(t=>{
    const b=busqInline.toLowerCase()
    return (t.perfiles?.nombre||t.empleado_nombre)?.toLowerCase().includes(b)||t.casetas?.nombre?.toLowerCase().includes(b)||fmt(t.total).includes(b)||t.ticket_items?.some(i=>i.nombre_producto?.toLowerCase().includes(b))
  }):tickets

  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div style={{display:'flex',gap:10,alignItems:'flex-end',marginBottom:16,flexWrap:'wrap'}}>
        <div className="fg" style={{margin:0}}><label>Desde</label><input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}/></div>
        <div className="fg" style={{margin:0}}><label>Hasta</label><input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}/></div>
        <div className="fg" style={{margin:0}}><label>Caseta</label><select value={casetaSel} onChange={e=>setCasetaSel(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}><option value="">Todas</option>{casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
        <button className="btn-add" onClick={()=>buscar()} style={{height:38}}>Buscar</button>
      </div>
      {tickets.length>0&&<input className="si" placeholder="Filtrar por empleado, producto, caseta, importe..." value={busqInline} onChange={e=>setBusqInline(e.target.value)} style={{marginBottom:12}}/>}
      <div style={{marginBottom:14,fontSize:'.82rem',color:'var(--tx2)'}}>{filtrados.length} tickets · Total: <strong style={{color:'var(--ac)'}}>{fmt(filtrados.reduce((s,t)=>s+t.total,0))}</strong></div>
      {loading?<div className="loading-row"><div className="spin-sm"/>Cargando...</div>:(
        <div className="tw"><table>
          <thead><tr><th>Fecha/Hora</th><th>Caseta</th><th>Empleado</th><th>Método</th><th>Total</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtrados.length===0?<tr><td colSpan={6} style={{textAlign:'center',color:'var(--tx2)',padding:20}}>Sin tickets</td></tr>
              :filtrados.map(t=>(
              <React.Fragment key={t.id}>
                <tr style={{background:t.notas?'rgba(var(--red-rgb),.04)':''}}>
                  <td style={{color:'var(--tx2)',fontSize:'.78rem'}}>{new Date(t.creado_en).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                  <td style={{color:'var(--tx2)'}}>{t.casetas?.nombre}</td>
                  <td>
                    {t.perfiles?.nombre || t.empleado_nombre || '—'}
                    {t.notas&&<span title={t.notas} style={{marginLeft:6,fontSize:'.65rem',fontWeight:700,color:'var(--red)',background:'rgba(var(--red-rgb),.12)',border:'1px solid rgba(var(--red-rgb),.25)',borderRadius:20,padding:'1px 6px',cursor:'help'}}><i className="fi fi-rr-triangle-warning"/> Incidencia</span>}
                  </td>
                  <td style={{textAlign:'left',whiteSpace:'nowrap'}}>{t.metodo_pago==='efectivo'?<><i className="fi fi-rr-coins"/> Efectivo</>:t.metodo_pago==='tarjeta'?<><i className="fi fi-rr-credit-card"/> Tarjeta</>:<><i className="fi fi-rr-coins"/> <i className="fi fi-rr-credit-card"/> Mixto <span style={{color:'var(--tx2)',fontSize:'.72rem'}}>({fmt(t.pago_efectivo)} ef · {fmt(t.pago_tarjeta)} tj)</span></>}</td>
                  <td style={{fontWeight:700,color:'var(--ac)'}}>{fmt(t.total)}</td>
                  <td><div className="acell">
                    <button className="btn-edit" onClick={()=>setExpanded(expanded===t.id?null:t.id)}>{expanded===t.id?'Ocultar':'Ver líneas'}</button>
                    <button className="btn-edit" onClick={()=>imprimirTicket(ticketRowToDatos(t), { autoPrint: true })}><i className="fi fi-rr-print"/></button>
                    <button className="btn-edit" style={{color:'var(--sec)',borderColor:'var(--sec)'}} title="Hacer factura" onClick={()=>setFacturaT(t)}><i className="fi fi-rr-file-invoice"/>{t.factura&&' ✓'}</button>
                    <button className="btn-edit" style={{color:'var(--blue)',borderColor:'var(--blue)'}} onClick={()=>setEditando(t)}>Editar</button>
                    <button className="btn-del" onClick={()=>eliminar(t.id)}>Eliminar</button>
                  </div></td>
                </tr>
                {expanded===t.id&&(
                  <tr><td colSpan={6} style={{background:'var(--s2)',padding:'8px 16px'}}>
                    {t.notas&&(
                      <div style={{background:'rgba(var(--red-rgb),.1)',border:'1px solid rgba(var(--red-rgb),.25)',borderRadius:'var(--rs)',padding:'6px 10px',marginBottom:8,fontSize:'.78rem',color:'var(--red)',fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
                        <span style={{flex:1}}><i className="fi fi-rr-triangle-warning"/> Incidencia: {t.notas}</span>
                        <button onClick={()=>resolverIncidencia(t)} style={{flexShrink:0,padding:'3px 10px',borderRadius:'var(--rs)',border:'1px solid rgba(var(--green-rgb),.4)',background:'rgba(var(--green-rgb),.1)',color:'var(--green)',cursor:'pointer',fontSize:'.72rem',fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}><i className="fi fi-rr-check"/> Resolver</button>
                      </div>
                    )}
                    {(t.ticket_items||[]).map((li,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:'.78rem',padding:'3px 0',borderBottom:'1px solid var(--bd)'}}>
                        <span>{li.nombre_producto} × {li.cantidad}</span><span style={{color:'var(--ac)'}}>{fmt(li.total_linea)}</span>
                      </div>
                    ))}
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table></div>
      )}
      {editando&&<ModalEditTicket ticket={editando} onClose={()=>setEditando(null)} onSave={handleSave}/>}
      {facturaT&&<FacturaModal onConfirm={onHacerFactura} onClose={()=>setFacturaT(null)}/>}
    </>
  )
}

// ─── PANEL AUDITORÍA (cambios en tickets) ─────────────────────
function PanelAuditoria({ casetas }) {
  const [tickets, setTickets]   = useState([])
  const [stock, setStock]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [casetaSel, setCasetaSel] = useState('')
  const [accionSel, setAccionSel] = useState('')   // '' | 'EDITAR' | 'BORRAR' | 'STOCK'
  const [expand, setExpand]     = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getAuditoriaTickets(casetaSel || null).catch(e => { console.error('auditoria:', e.message); return [] }),
      getStockAuditoria(casetaSel || null).catch(e => { console.error('stock-audit:', e.message); return [] }),
    ]).then(([t, s]) => { setTickets(t); setStock(s) }).finally(() => setLoading(false))
  }, [casetaSel])

  const nombreProd = (it) => it?.nombre_producto || '—'
  const resumenItems = (items) => (items || []).map(i => `${nombreProd(i)} ×${i.cantidad}`).join(', ')

  // Lista unificada (tickets + ajustes de stock) ordenada por fecha
  const combinadas = [
    ...tickets.map(r => ({ ...r, _kind: 'ticket' })),
    ...stock.map(r => ({ ...r, _kind: 'stock' })),
  ]
    .filter(r => !accionSel || (accionSel === 'STOCK' ? r._kind === 'stock' : r._kind === 'ticket' && r.accion === accionSel))
    .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))

  return (
    <>
      <div className="stit"><i className="fi fi-rr-time-past"/> Cambios (tickets y stock)</div>
      <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 12 }}>
        Registro de quién editó/borró tickets y quién ajustó stock, con el antes y el después.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="si" style={{ maxWidth: 220 }} value={casetaSel} onChange={e => setCasetaSel(e.target.value)}>
          <option value="">Todas las casetas</option>
          {casetas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="si" style={{ maxWidth: 200 }} value={accionSel} onChange={e => setAccionSel(e.target.value)}>
          <option value="">Todo</option>
          <option value="EDITAR">Solo ediciones de ticket</option>
          <option value="BORRAR">Solo borrados de ticket</option>
          <option value="STOCK">Solo ajustes de stock</option>
        </select>
      </div>

      {loading
        ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
        : combinadas.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 40 }}>Sin cambios registrados con estos filtros</div>
          : combinadas.map(r => {
            const key = `${r._kind}-${r.id}`
            if (r._kind === 'stock') {
              const dif = (r.cantidad_despues ?? 0) - (r.cantidad_antes ?? 0)
              return (
                <div key={key} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="chip" style={{ background: 'rgba(var(--blue-rgb),.15)', color: 'var(--blue)', border: '1px solid var(--blue)' }}>AJUSTE STOCK</span>
                    <span style={{ fontWeight: 700 }}>{r.nombre_producto || '—'}</span>
                    <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                      {new Date(r.creado_en).toLocaleString('es-ES')} · {r.perfiles?.nombre || '—'} · {r.casetas?.nombre || '—'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                      <span style={{ color: 'var(--tx2)', textDecoration: 'line-through', marginRight: 6 }}>{r.cantidad_antes}</span>
                      <span style={{ color: 'var(--tx)' }}>{r.cantidad_despues}</span>
                      <span style={{ color: dif > 0 ? 'var(--green)' : 'var(--red)', marginLeft: 6 }}>({dif > 0 ? `+${dif}` : dif})</span>
                    </span>
                  </div>
                  {r.motivo && <div style={{ fontSize: '.75rem', color: 'var(--tx2)', marginTop: 4 }}>Motivo: {r.motivo}</div>}
                </div>
              )
            }
            const esBorrado = r.accion === 'BORRAR'
            const col = esBorrado ? 'var(--red)' : 'var(--gold)'
            return (
              <div key={key} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip" style={{ background: `rgba(var(--${esBorrado ? 'red' : 'gold'}-rgb),.15)`, color: col, border: `1px solid ${col}` }}>
                    {esBorrado ? 'BORRADO' : 'EDITADO'}
                  </span>
                  {r.numero_ticket && <span style={{ color: 'var(--ac)', fontWeight: 700 }}>{r.numero_ticket}</span>}
                  <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                    {new Date(r.creado_en).toLocaleString('es-ES')} · {r.perfiles?.nombre || '—'} · {r.casetas?.nombre || '—'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                    {esBorrado
                      ? <span style={{ color: 'var(--red)' }}>{fmt(r.total_antes)}</span>
                      : <><span style={{ color: 'var(--tx2)', textDecoration: 'line-through', marginRight: 6 }}>{fmt(r.total_antes)}</span><span style={{ color: 'var(--ac)' }}>{fmt(r.total_despues)}</span></>
                    }
                  </span>
                  <button className="btn-o" style={{ fontSize: '.7rem' }} onClick={() => setExpand(expand === key ? null : key)}>
                    {expand === key ? 'Ocultar' : 'Detalle'}
                  </button>
                </div>
                {expand === key && (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--bd)', paddingTop: 8, fontSize: '.78rem' }}>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: 'var(--tx2)', fontWeight: 700 }}>Antes: </span>
                      <span style={{ color: 'var(--tx2)' }}>{resumenItems(r.items_antes) || '—'}</span>
                    </div>
                    {!esBorrado && (
                      <div>
                        <span style={{ color: 'var(--ac)', fontWeight: 700 }}>Después: </span>
                        <span>{resumenItems(r.items_despues) || '—'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
      }
    </>
  )
}

const TIPO_DEV = { DEVOLUCION: 'Devolución', COMPENSACION: 'Compensación', BAJA: 'Baja / rotura' }
const MOV_DEV  = { DEVUELTO_VENDIBLE: 'Devuelto (vendible)', DEVUELTO_DEFECTUOSO: 'Devuelto (defectuoso)', ENTREGADO: 'Entregado', BAJA: 'Baja / rotura' }

// ─── PANEL DEVOLUCIONES ───────────────────────────────────────
function PanelDevoluciones({ casetas }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [casetaSel, setCasetaSel] = useState('')
  const [tipoSel, setTipoSel]   = useState('')
  const [expand, setExpand]     = useState(null)

  useEffect(() => {
    setLoading(true)
    getDevoluciones(casetaSel || null)
      .then(setRows).catch(e => { setRows([]); console.error('devoluciones:', e.message) })
      .finally(() => setLoading(false))
  }, [casetaSel])

  const filtradas = rows.filter(r => !tipoSel || r.tipo === tipoSel)

  return (
    <>
      <div className="stit"><i className="fi fi-rr-undo"/> Devoluciones, compensaciones y bajas</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="si" style={{ maxWidth: 220 }} value={casetaSel} onChange={e => setCasetaSel(e.target.value)}>
          <option value="">Todas las casetas</option>
          {casetas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="si" style={{ maxWidth: 200 }} value={tipoSel} onChange={e => setTipoSel(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="DEVOLUCION">Devoluciones</option>
          <option value="COMPENSACION">Compensaciones</option>
          <option value="BAJA">Bajas / roturas</option>
        </select>
      </div>

      {loading
        ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
        : filtradas.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 40 }}>Sin movimientos con estos filtros</div>
          : filtradas.map(r => {
            const col = r.tipo === 'BAJA' ? 'var(--red)' : r.tipo === 'COMPENSACION' ? 'var(--gold)' : 'var(--ac)'
            return (
              <div key={r.id} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 13px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip" style={{ color: col, border: `1px solid ${col}` }}>{TIPO_DEV[r.tipo] || r.tipo}</span>
                  {r.numero_ticket && <span style={{ color: 'var(--ac)', fontWeight: 700 }}>{r.numero_ticket}</span>}
                  <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                    {new Date(r.creado_en).toLocaleString('es-ES')} · {r.perfiles?.nombre || '—'} · {r.casetas?.nombre || '—'}
                  </span>
                  {r.importe_reembolsado > 0 && <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--gold)' }}>−{fmt(r.importe_reembolsado)}</span>}
                  <button className="btn-o" style={{ fontSize: '.7rem', marginLeft: r.importe_reembolsado > 0 ? 0 : 'auto' }} onClick={() => setExpand(expand === r.id ? null : r.id)}>
                    {expand === r.id ? 'Ocultar' : 'Detalle'}
                  </button>
                </div>
                {r.notas && <div style={{ fontSize: '.75rem', color: 'var(--tx2)', marginTop: 4 }}>{r.notas}</div>}
                {expand === r.id && (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--bd)', paddingTop: 8, fontSize: '.78rem' }}>
                    {(r.devolucion_items || []).map(it => (
                      <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--tx2)' }}>
                        <span>{it.nombre_producto} ×{it.cantidad}</span>
                        <span>{MOV_DEV[it.movimiento] || it.movimiento}{it.causa ? ` · ${it.causa === 'FABRICA' ? 'defecto fábrica' : 'rotura nuestra'}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
      }
    </>
  )
}

// ─── PANEL DEFECTUOSOS (agrupado por proveedor) ───────────────
function PanelDefectuosos({ casetas }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [casetaSel, setCasetaSel] = useState('')
  const [soloReclamables, setSoloReclamables] = useState(false)

  const cargar = () => {
    setLoading(true)
    getDefectuosos(casetaSel || null)
      .then(setRows).catch(e => { setRows([]); console.error('defectuosos:', e.message) })
      .finally(() => setLoading(false))
  }
  useEffect(cargar, [casetaSel])

  const cambiarReclam = async (item, estado) => {
    try {
      await updateReclamacionItem(item.id, estado)
      setRows(prev => prev.map(r => r.id === item.id ? { ...r, reclamacion: estado } : r))
    } catch (e) { alert(e.message) }
  }

  const visibles = rows.filter(r => !soloReclamables || r.causa === 'FABRICA')

  // Agrupar por proveedor (empresa)
  const porEmpresa = {}
  visibles.forEach(r => {
    const emp = r.empresa || 'Sin proveedor'
    if (!porEmpresa[emp]) porEmpresa[emp] = []
    porEmpresa[emp].push(r)
  })
  const empresas = Object.keys(porEmpresa).sort()

  const estadoChip = { PENDIENTE: 'var(--gold)', RECLAMADO: 'var(--blue)', ABONADO: 'var(--green)' }

  return (
    <>
      <div className="stit"><i className="fi fi-rr-box-open"/> Productos defectuosos / merma</div>
      <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginBottom: 12 }}>
        Agrupados por proveedor. Los de <strong>defecto de fábrica</strong> son reclamables; los de <strong>rotura nuestra</strong> son merma.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <select className="si" style={{ maxWidth: 220 }} value={casetaSel} onChange={e => setCasetaSel(e.target.value)}>
          <option value="">Todas las casetas</option>
          {casetas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div onClick={() => setSoloReclamables(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 12px', borderRadius: 'var(--rs)', border: '1px solid', borderColor: soloReclamables ? 'var(--ac)' : 'var(--bd)', background: soloReclamables ? 'rgba(var(--ac-rgb),.1)' : 'transparent' }}>
          <div style={{ width: 32, height: 18, borderRadius: 9, background: soloReclamables ? 'var(--ac)' : 'var(--s3)', position: 'relative', transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: 2, left: soloReclamables ? 14 : 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left .2s' }} />
          </div>
          <span style={{ fontSize: '.78rem', color: soloReclamables ? 'var(--ac)' : 'var(--tx2)', fontWeight: 600 }}>Solo reclamables (defecto de fábrica)</span>
        </div>
      </div>

      {loading
        ? <div className="loading-row"><div className="spin-sm" />Cargando...</div>
        : empresas.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 40 }}>Sin productos defectuosos registrados</div>
          : empresas.map(emp => {
            const items = porEmpresa[emp]
            const totalUds = items.reduce((s, i) => s + i.cantidad, 0)
            const reclamables = items.filter(i => i.causa === 'FABRICA').reduce((s, i) => s + i.cantidad, 0)
            return (
              <div key={emp} style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '.95rem' }}><i className="fi fi-rr-industry-windows"/> {emp}</span>
                  <span style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>{totalUds} uds · {reclamables} reclamables</span>
                </div>
                {items.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--bd)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: '.83rem', fontWeight: 600 }}>{it.nombre_producto} ×{it.cantidad}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--tx2)' }}>
                        {it.causa === 'FABRICA' ? 'Defecto de fábrica' : it.causa === 'PROPIA' ? 'Rotura nuestra' : '—'}
                        {' · '}{it.devoluciones?.casetas?.nombre || ''}
                        {' · '}{it.devoluciones?.creado_en ? new Date(it.devoluciones.creado_en).toLocaleDateString('es-ES') : ''}
                      </div>
                    </div>
                    {it.causa === 'FABRICA' ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['PENDIENTE', 'RECLAMADO', 'ABONADO'].map(est => (
                          <button key={est} onClick={() => cambiarReclam(it, est)} style={{
                            padding: '3px 9px', borderRadius: 12, fontSize: '.68rem', fontWeight: 700, cursor: 'pointer',
                            fontFamily: "'DM Sans',sans-serif",
                            background: it.reclamacion === est ? estadoChip[est] : 'var(--s3)',
                            border: `1px solid ${it.reclamacion === est ? estadoChip[est] : 'var(--bd)'}`,
                            color: it.reclamacion === est ? '#fff' : 'var(--tx2)',
                          }}>{est.charAt(0) + est.slice(1).toLowerCase()}</button>
                        ))}
                      </div>
                    ) : (
                      <span className="chip cr" style={{ fontSize: '.68rem' }}>Merma</span>
                    )}
                  </div>
                ))}
              </div>
            )
          })
      }
    </>
  )
}

// ─── PANEL PEDIDOS ────────────────────────────────────────────

// ─── MODAL EDITAR PEDIDO ─────────────────────────────────────
function ModalEditarPedido({ pedido, items, notasAdmin, saving, onChangeItems, onChangeNotas, onGuardar, onClose }) {
  const [productos, setProductos] = useState([])
  const [busq, setBusq]           = useState('')
  const [addQty, setAddQty]       = useState(1)
  const [showAdd, setShowAdd]     = useState(false)

  useEffect(() => {
    getProductos(true).then(setProductos).catch(() => {})
  }, [])

  const prodsFiltrados = busq.length >= 2
    ? productos.filter(p => p.nombre.toLowerCase().includes(busq.toLowerCase()) || p.codigo_ean?.includes(busq)).slice(0, 8)
    : []

  const addProducto = (prod) => {
    // Si ya está en el pedido, incrementar cantidad
    const existe = items.findIndex(i => i.producto_id === prod.id)
    if (existe >= 0) {
      onChangeItems(prev => prev.map((it, i) => i !== existe ? it : { ...it, cantidad: it.cantidad + addQty }))
    } else {
      onChangeItems(prev => [...prev, { producto_id: prod.id, nombre: prod.nombre, cantidad: addQty }])
    }
    setBusq('')
    setAddQty(1)
    setShowAdd(false)
  }

  const setQty = (idx, val) => {
    const q = Math.max(1, parseInt(val) || 1)
    onChangeItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, cantidad: q }))
  }

  return (
    <div className="mo">
      <div className="mc wide" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-pencil"/> Editar Pedido — {pedido.casetas?.nombre}</div>

        {/* Lista de items actuales */}
        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 10 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ flex: 1, fontSize: '.85rem', fontWeight: 600 }}>{item.nombre}</div>
              <button className="qb" onClick={() => setQty(idx, item.cantidad - 1)}>−</button>
              <input
                type="number" min="1" value={item.cantidad}
                onChange={e => setQty(idx, e.target.value)}
                style={{ width: 46, textAlign: 'center', background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', color: 'var(--tx)', fontWeight: 700, fontFamily: "'DM Sans',sans-serif", padding: '4px 2px' }}
                inputMode="numeric"
              />
              <button className="qb" onClick={() => setQty(idx, item.cantidad + 1)}>+</button>
              <button onClick={() => onChangeItems(prev => prev.filter((_, i) => i !== idx))}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(var(--red-rgb),.3)', background: 'rgba(var(--red-rgb),.1)', color: 'var(--red)', cursor: 'pointer', fontSize: '.8rem', fontFamily: "'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center' }}><i className="fi fi-rr-cross"/></button>
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 20, fontSize: '.85rem' }}>Sin productos — añade al menos uno</div>
          )}
        </div>

        {/* Añadir producto */}
        {!showAdd ? (
          <button onClick={() => setShowAdd(true)} style={{
            padding: '8px 0', borderRadius: 'var(--rs)', border: '1px dashed var(--bd)',
            background: 'transparent', color: 'var(--tx2)', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: '.83rem', marginBottom: 10,
          }}>+ Añadir producto</button>
        ) : (
          <div style={{ background: 'var(--s2)', borderRadius: 'var(--rs)', padding: '10px 12px', marginBottom: 10, border: '1px solid var(--bd)' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                autoFocus
                placeholder="Buscar producto..." value={busq}
                onChange={e => setBusq(e.target.value)}
                style={{ flex: 1, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '7px 10px', color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif" }}
              />
              <input
                type="number" min="1" value={addQty}
                onChange={e => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 56, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '7px 8px', color: 'var(--tx)', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, textAlign: 'center' }}
                inputMode="numeric"
              />
              <button onClick={() => { setShowAdd(false); setBusq('') }} style={{ padding: '6px 10px', borderRadius: 'var(--rs)', border: '1px solid var(--bd)', background: 'transparent', color: 'var(--tx2)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}><i className="fi fi-rr-cross"/></button>
            </div>
            {prodsFiltrados.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {prodsFiltrados.map(p => (
                  <div key={p.id} onClick={() => addProducto(p)} style={{
                    padding: '7px 10px', cursor: 'pointer', borderRadius: 'var(--rs)',
                    fontSize: '.82rem', display: 'flex', justifyContent: 'space-between',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                    <span style={{ color: 'var(--tx2)', fontSize: '.75rem' }}>{p.categoria}</span>
                  </div>
                ))}
              </div>
            )}
            {busq.length >= 2 && prodsFiltrados.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 8, fontSize: '.8rem' }}>Sin resultados</div>
            )}
            {busq.length < 2 && <div style={{ fontSize: '.75rem', color: 'var(--tx2)', textAlign: 'center' }}>Escribe al menos 2 letras para buscar</div>}
          </div>
        )}

        {/* Nota para empleado */}
        <div className="fg" style={{ marginTop: 4 }}>
          <label>Nota para el empleado (opcional)</label>
          <input className="bi" style={{ marginBottom: 0 }} value={notasAdmin}
            onChange={e => onChangeNotas(e.target.value)}
            placeholder="Ej: cambiada cantidad por falta de stock..." />
        </div>

        <button className="btn-p" style={{ marginTop: 12 }} disabled={saving || items.length === 0} onClick={onGuardar}>
          {saving ? 'Guardando...' : '✓ Guardar y aceptar'}
        </button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── MODAL NUEVO PEDIDO (admin) — reutiliza el ModalPedido del empleado ───
// Paso 1: elegir caseta. Paso 2: mismo catálogo/embalajes que usa el empleado.
function ModalNuevoPedido({ casetas, perfil, onClose, onCreado, showToast }) {
  const [casetaId,setCasetaId]=useState('')
  const [productos,setProductos]=useState([])
  const [stock,setStock]=useState({})
  const [stockMinimos,setStockMinimos]=useState({})
  const [cargando,setCargando]=useState(false)
  const [listo,setListo]=useState(false)
  const caseta=casetas.find(c=>c.id===casetaId)

  const continuar=async()=>{
    if(!casetaId){showToast('Elige una caseta','error');return}
    setCargando(true)
    try{
      const [prods,stk,mins]=await Promise.all([
        getProductos(), getStockCaseta(casetaId), getStockMinimos(casetaId).catch(()=>({})),
      ])
      setProductos(prods); setStock(stk||{}); setStockMinimos(mins||{}); setListo(true)
    }catch(e){showToast(e.message,'error')}
    setCargando(false)
  }

  // Paso 2: mismo modal que el empleado, ya con la caseta elegida
  if(listo&&caseta){
    return <ModalPedido caseta={caseta} perfil={perfil} productos={productos} stock={stock} stockMinimos={stockMinimos}
      pedidosActivosProdIds={new Set()} showToast={showToast}
      onClose={()=>onClose()} onCreado={()=>{ onCreado&&onCreado(); onClose() }} />
  }

  // Paso 1: elegir caseta
  return(
    <div className="mo"><div className="mc">
      <ModalClose onClose={onClose}/>
      <div className="mt-modal"><i className="fi fi-rr-truck-side"/> Nuevo pedido</div>
      <div style={{fontSize:'.85rem',color:'var(--tx2)',marginBottom:14}}>Elige la caseta a la que va el pedido. Después verás el mismo catálogo que usa el empleado (con embalajes: unidad / envase / caja).</div>
      <div className="fg"><label>Caseta</label>
        <select value={casetaId} onChange={e=>setCasetaId(e.target.value)}>
          <option value="">-- Elegir caseta --</option>
          {casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}{c.activo===false?' (inactiva)':''}</option>)}
        </select>
      </div>
      <button className="btn-add" style={{width:'100%'}} disabled={cargando||!casetaId} onClick={continuar}>{cargando?'Cargando...':'Continuar'}</button>
      <button className="btn-s" onClick={onClose}>Cancelar</button>
    </div></div>
  )
}

function PanelPedidos({ casetas, perfil, onPedidoAceptado }) {
  const [pedidos,setPedidos]=useState([])
  const [loading,setLoading]=useState(true)
  const [estadoFiltro,setEstadoFiltro]=useState('')
  const [casetaSel,setCasetaSel]=useState('')
  const [expandido,setExpandido]=useState(null)
  const [editando,setEditando]=useState(null)
  const [editItems,setEditItems]=useState([])
  const [notasAdmin,setNotasAdmin]=useState('')
  const [saving,setSaving]=useState(false)
  const [showNuevo,setShowNuevo]=useState(false)
  const [toast,setToast]=useState(null)
  const showToast=(msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2500) }

  const recargar=()=>getPedidos({}).then(setPedidos).catch(()=>{})
  useEffect(()=>{ getPedidos({}).then(setPedidos).catch(e=>{ setPedidos([]); console.error('getPedidos:',e.message) }).finally(()=>setLoading(false)) },[])

  const imprimirPedidoPDF=(p,soloEmpresa=null)=>{
    const items=p.pedido_items||[]
    const byEmpresa={}
    items.forEach(i=>{
      const emp=i.productos?.empresa||'Sin empresa'
      if(soloEmpresa&&emp!==soloEmpresa) return
      if(!byEmpresa[emp]) byEmpresa[emp]=[]
      const udsEnv=i.productos?.fardo||1            // uds por envase
      const epc=i.productos?.envases_por_caja||0    // envases por caja
      const envases=udsEnv>1?Math.ceil(i.cantidad/udsEnv):null
      let embalaje='—'
      if(envases!=null){
        if(epc>0){
          const cajas=Math.floor(envases/epc), resto=envases%epc
          embalaje=[cajas>0?`${cajas} cajas`:null,resto>0?`${resto} env`:null].filter(Boolean).join(' + ')||`${envases} env`
        } else embalaje=`${envases} env`
      }
      byEmpresa[emp].push({nombre:i.productos?.nombre||'?',cantidad:i.cantidad,embalaje})
    })
    const fecha=new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})
    const seccionesHTML=Object.entries(byEmpresa).map(([emp,prods],idx)=>`
      <div style="${idx>0?'page-break-before:always;':''}">
        <h2 style="font-size:15px;margin-bottom:3px;border-left:4px solid var(--ac);padding-left:8px">${emp}</h2>
        <div style="color:#555;font-size:11px;margin-bottom:10px">Caseta: ${p.casetas?.nombre} · Fecha: ${fecha}</div>
        <table>
          <thead><tr><th>Producto</th><th>Embalaje</th><th>Uds. totales</th></tr></thead>
          <tbody>${prods.map(pr=>`<tr><td>${pr.nombre}</td><td>${pr.embalaje}</td><td><strong>${pr.cantidad}</strong></td></tr>`).join('')}</tbody>
        </table>
      </div>`).join('')
    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Pedido — ${p.casetas?.nombre}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:20px}
      table{width:100%;border-collapse:collapse;margin-bottom:10px}
      th{text-align:left;padding:5px 8px;border-bottom:2px solid #ddd;font-size:11px;color:#555}
      td{padding:5px 8px;border-bottom:1px solid #eee}
      @media print{@page{margin:15mm}}
    </style></head><body>
    ${p.notas?`<div style="margin-bottom:14px;padding:8px 12px;background:#fafafa;border:1px solid #ddd;font-size:12px"><strong>Notas:</strong> ${p.notas}</div>`:''}
    ${seccionesHTML}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`
    const w=window.open('','_blank','width=900,height=800,scrollbars=yes')
    if(w){w.document.write(html);w.document.close()}
  }

  const ESTATE_COLOR={PENDIENTE:'var(--gold)',ACEPTADO:'var(--blue)',EN_CAMINO:'var(--ac)',RECIBIDO:'var(--green)',INCIDENCIA:'var(--red)',RECHAZADO:'var(--red)'}
  const ESTADO_ICON={PENDIENTE:'fi-rr-clock',ACEPTADO:'fi-rr-check',EN_CAMINO:'fi-rr-truck-side',RECIBIDO:'fi-rr-box',INCIDENCIA:'fi-rr-triangle-warning',RECHAZADO:'fi-rr-cross'}
  const ESTADO_LABEL={PENDIENTE:'Pendiente',ACEPTADO:'Aceptado',EN_CAMINO:'En camino',RECIBIDO:'Recibido',INCIDENCIA:'Incidencia',RECHAZADO:'Rechazado'}

  const filtrados=pedidos.filter(p=>{
    if(estadoFiltro&&p.estado!==estadoFiltro) return false
    if(casetaSel&&p.caseta_id!==casetaSel) return false
    return true
  })

  const abrirEdicion=p=>{ 
    setEditando(p)
    setEditItems(p.pedido_items.map(i=>({
      // producto_id puede venir directo o dentro del objeto productos (fallback)
      producto_id: i.producto_id || i.productos?.id,
      nombre: i.productos?.nombre || '?',
      cantidad: i.cantidad
    })))
    setNotasAdmin(p.notas_admin||'')
  }

  const guardarEdicion=async()=>{
    setSaving(true)
    try{
      await updatePedidoItems(editando.id,editItems)
      await updatePedido(editando.id,{notas_admin:notasAdmin||null})
      setPedidos(prev=>prev.map(p=>p.id===editando.id?{...p,notas_admin:notasAdmin,pedido_items:editItems.map(i=>({...i,productos:{nombre:i.nombre}}))}:p))
      setEditando(null); showToast('Pedido actualizado ✓')
    }catch(e){showToast('Error: '+e.message,'error')}
    setSaving(false)
  }

  const cambiarEstado=async(id,estado)=>{
    await updatePedido(id,{estado})
    setPedidos(prev=>prev.map(p=>p.id===id?{...p,estado}:p))
    showToast(`${ESTADO_LABEL[estado]}`)
    if(estado==='ACEPTADO') onPedidoAceptado && onPedidoAceptado()
  }

  if(loading) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
        <select value={estadoFiltro} onChange={e=>setEstadoFiltro(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select value={casetaSel} onChange={e=>setCasetaSel(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>
          <option value="">Todas las casetas</option>
          {casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <span style={{fontSize:'.82rem',color:'var(--tx2)'}}>{filtrados.length} pedidos</span>
        <button className="btn-add" style={{width:'auto',marginTop:0,marginLeft:'auto'}} onClick={()=>setShowNuevo(true)}><i className="fi fi-rr-plus"/> Nuevo pedido</button>
      </div>

      {showNuevo&&<ModalNuevoPedido casetas={casetas} perfil={perfil} showToast={showToast} onCreado={recargar} onClose={()=>setShowNuevo(false)}/>}

      {filtrados.length===0?<div style={{textAlign:'center',color:'var(--tx2)',padding:40}}>Sin pedidos con estos filtros</div>
        :filtrados.map(p=>(
        <div key={p.id} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'14px 16px',marginBottom:12,border:'1px solid var(--bd)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
            <div style={{flex:1}}>
              <span style={{fontWeight:700,fontSize:'.9rem'}}>{p.casetas?.nombre}</span>
              <span style={{color:'var(--tx2)',fontSize:'.78rem',marginLeft:8}}>{p.perfiles?.nombre}</span>
              <span style={{color:'var(--tx2)',fontSize:'.75rem',marginLeft:8}}>{new Date(p.creado_en).toLocaleDateString('es-ES',{day:'numeric',month:'short'})} {new Date(p.creado_en).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
            </div>
            <span style={{fontWeight:700,fontSize:'.82rem',color:ESTATE_COLOR[p.estado]}}><i className={`fi ${ESTADO_ICON[p.estado]}`}/>{' '}{ESTADO_LABEL[p.estado]}</span>
          </div>
          {p.notas&&<div style={{fontSize:'.78rem',color:'var(--tx2)',fontStyle:'italic',marginBottom:4}}><i className="fi fi-rr-note"/> {p.notas}</div>}
          {p.notas_admin&&<div style={{fontSize:'.78rem',color:'var(--blue)',marginBottom:4}}><i className="fi fi-rr-shield"/> Admin: {p.notas_admin}</div>}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
            {p.estado==='PENDIENTE'&&(<>
              <button className="btn-add" style={{width:'auto',padding:'6px 14px',marginTop:0}} onClick={()=>cambiarEstado(p.id,'ACEPTADO')}><i className="fi fi-rr-check"/> Aceptar</button>
              <button className="btn-edit" onClick={()=>abrirEdicion(p)}><i className="fi fi-rr-pencil"/> Editar</button>
              <button className="btn-del" style={{padding:'6px 12px',borderRadius:'var(--rs)',height:'auto'}} onClick={()=>{if(window.confirm('¿Rechazar este pedido?'))cambiarEstado(p.id,'RECHAZADO')}}><i className="fi fi-rr-cross"/> Rechazar</button>
            </>)}
            {p.estado==='ACEPTADO'&&(
              <button className="btn-add" style={{width:'auto',padding:'6px 14px',marginTop:0,background:'var(--blue)',borderColor:'var(--blue)'}} onClick={()=>cambiarEstado(p.id,'EN_CAMINO')}><i className="fi fi-rr-truck-side"/> En camino</button>
            )}
            <button className="btn-edit" style={{fontSize:'.72rem'}} onClick={()=>setExpandido(expandido===p.id?null:p.id)}><i className={`fi ${expandido===p.id?'fi-rr-angle-up':'fi-rr-angle-down'}`}/>{expandido===p.id?' Ocultar':' Ver productos'}</button>
            <button onClick={()=>imprimirPedidoPDF(p)} style={{padding:'6px 12px',borderRadius:'var(--rs)',background:'rgba(var(--blue-rgb),.1)',border:'1px solid rgba(var(--blue-rgb),.3)',color:'var(--blue)',fontWeight:600,cursor:'pointer',fontSize:'.75rem',fontFamily:"'DM Sans',sans-serif"}}><i className="fi fi-rr-print"/> Todo</button>
            {[...new Set((p.pedido_items||[]).map(i=>i.productos?.empresa||'Sin empresa'))].sort().map(emp=>(
              <button key={emp} onClick={()=>imprimirPedidoPDF(p,emp)} style={{padding:'6px 12px',borderRadius:'var(--rs)',background:'var(--s3)',border:'1px solid var(--bd)',color:'var(--tx2)',fontWeight:600,cursor:'pointer',fontSize:'.75rem',fontFamily:"'DM Sans',sans-serif"}}><i className="fi fi-rr-print"/> {emp}</button>
            ))}
          </div>
          {expandido===p.id&&(
            <div style={{marginTop:10,borderTop:'1px solid var(--bd)',paddingTop:10,fontSize:'.8rem'}}>
              {(()=>{
                const byEmp={}
                ;(p.pedido_items||[]).forEach(i=>{const e=i.productos?.empresa||'Sin empresa';if(!byEmp[e])byEmp[e]=[];byEmp[e].push(i)})
                return Object.entries(byEmp).map(([emp,items])=>(
                  <div key={emp} style={{marginBottom:10}}>
                    <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--blue)',marginBottom:4,paddingBottom:3,borderBottom:'1px solid var(--bd)'}}>{emp}</div>
                    {items.map(i=>(
                      <div key={i.id} style={{padding:'4px 0',borderBottom:'1px solid rgba(255,255,255,.04)',display:'flex',gap:12,flexWrap:'wrap'}}>
                        <span style={{flex:1}}>{i.productos?.nombre}</span>
                        <span>Pedido: <strong>{i.cantidad}</strong>{(i.productos?.fardo||1)>1&&<span style={{color:'var(--tx2)',fontSize:'.72rem'}}> ({Math.ceil(i.cantidad/(i.productos?.fardo||1))} env)</span>}</span>
                        {i.cantidad_recibida!=null&&<span>Recibido: <strong style={{color:i.cantidad_recibida!==i.cantidad?'var(--red)':'var(--green)'}}>{i.cantidad_recibida}</strong></span>}
                        {i.notas_item&&<span style={{color:'var(--red)'}}><i className="fi fi-rr-triangle-warning"/> {i.notas_item}</span>}
                      </div>
                    ))}
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      ))}

      {editando&&(
        <ModalEditarPedido
          pedido={editando}
          items={editItems}
          notasAdmin={notasAdmin}
          saving={saving}
          onChangeItems={setEditItems}
          onChangeNotas={setNotasAdmin}
          onGuardar={guardarEdicion}
          onClose={()=>setEditando(null)}
        />
      )}
    </>
  )
}

// ─── PANEL INVENTARIOS ────────────────────────────────────────
function PanelInventarios({ casetas }) {
  const [inventarios,setInventarios]=useState([])
  const [loading,setLoading]=useState(true)
  const [casetaSel,setCasetaSel]=useState('')
  const [expandido,setExpandido]=useState(null)
  const [confirmando,setConfirmando]=useState(null)
  const [saving,setSaving]=useState(false)
  const [toast,setToast]=useState(null)
  const showToast=(msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2500) }

  useEffect(()=>{ getInventarios(casetaSel||null).then(setInventarios).finally(()=>setLoading(false)) },[casetaSel])

  const confirmar=async inv=>{
    setSaving(true)
    try{
      await confirmarInventario(inv.id, { nombreCaseta: inv.casetas?.nombre || '', nombreEmpleado: inv.perfiles?.nombre || '' }, inv.es_final)
      setInventarios(prev=>prev.map(i=>i.id===inv.id?{...i,estado:'CONFIRMADO'}:i))
      setConfirmando(null); showToast(inv.es_final?'✓ Inventario final confirmado — caseta vaciada':'✓ Inventario confirmado — stock actualizado')
    }catch(e){showToast('Error: '+e.message,'error')}
    setSaving(false)
  }

  if(loading) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div style={{display:'flex',gap:10,marginBottom:18,alignItems:'center',flexWrap:'wrap'}}>
        <select value={casetaSel} onChange={e=>setCasetaSel(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>
          <option value="">Todas las casetas</option>
          {casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <span style={{fontSize:'.82rem',color:'var(--tx2)'}}>{inventarios.length} inventarios</span>
      </div>
      {inventarios.length===0?<div style={{textAlign:'center',color:'var(--tx2)',padding:40}}>
        Los empleados aún no han enviado ningún inventario.<br/>
        <span style={{fontSize:'.82rem'}}>El inventario se hace desde el panel del empleado al cierre de temporada.</span>
      </div>:inventarios.map(inv=>{
        const difs=inv.inventario_items?.filter(i=>i.diferencia!==0).length||0
        const pend=inv.estado==='BORRADOR'
        const casetaNombre=inv.casetas?.nombre||casetas.find(c=>c.id===inv.caseta_id)?.nombre
        return(
          <div key={inv.id} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'14px 16px',marginBottom:12,border:`1px solid ${pend?'rgba(var(--gold-rgb),.4)':'var(--bd)'}`}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
              <div style={{flex:1}}>
                <span style={{fontWeight:700,fontSize:'.9rem'}}>{casetaNombre}</span>
                <span style={{color:'var(--tx2)',fontSize:'.78rem',marginLeft:8}}>{inv.perfiles?.nombre}</span>
                <span style={{color:'var(--tx2)',fontSize:'.75rem',marginLeft:8}}>{new Date(inv.creado_en).toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})}</span>
              </div>
              {inv.es_final&&<span className="chip" style={{color:'var(--red)',border:'1px solid var(--red)',fontSize:'.68rem'}}>FINAL · vacía caseta</span>}
              <span style={{fontWeight:700,fontSize:'.82rem',color:pend?'var(--gold)':'var(--green)'}}>{pend?<><i className="fi fi-rr-clock"/> Pendiente de confirmar</>:<><i className="fi fi-rr-check"/> Confirmado</>}</span>
            </div>
            <div style={{fontSize:'.8rem',color:'var(--tx2)',marginBottom:8}}>{inv.inventario_items?.length||0} productos · <span style={{color:difs>0?'var(--red)':'var(--green)'}}>{difs} diferencias</span></div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button className="btn-edit" onClick={()=>setExpandido(expandido===inv.id?null:inv.id)}>{expandido===inv.id?'Ocultar':'Ver detalle'}</button>
              {pend&&<button className="btn-add" style={{width:'auto',padding:'6px 14px',marginTop:0}} onClick={()=>setConfirmando(inv)}><i className="fi fi-rr-check"/> Confirmar y actualizar stock</button>}
            </div>
            {expandido===inv.id&&(
              <div style={{marginTop:10,borderTop:'1px solid var(--bd)',paddingTop:10}}>
                <div className="tw"><table>
                  <thead><tr><th>Producto</th><th>Teórico</th><th>Real</th><th>Diferencia</th></tr></thead>
                  <tbody>
                    {(inv.inventario_items||[]).sort((a,b)=>Math.abs(b.diferencia||0)-Math.abs(a.diferencia||0)).map(item=>(
                      <tr key={item.id} style={{background:item.diferencia!==0?'rgba(var(--red-rgb),.05)':'transparent'}}>
                        <td>{item.productos?.nombre}</td>
                        <td style={{color:'var(--tx2)'}}>{item.cantidad_teorica ?? '—'}</td>
                        <td style={{fontWeight:700}}>{item.cantidad_real}</td>
                        <td style={{fontWeight:700,color:item.diferencia>0?'var(--green)':item.diferencia<0?'var(--red)':'var(--tx2)'}}>{item.diferencia>0?'+':''}{item.diferencia}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
          </div>
        )
      })}

      {confirmando&&(
        <div className="mo">
          <div className="mc">
            <ModalClose onClose={() => setConfirmando(null)} />
            <div className="mt-modal"><i className="fi fi-rr-check"/> Confirmar Inventario</div>
            {confirmando.es_final?(
              <div style={{fontSize:'.85rem',color:'var(--tx2)',marginBottom:16,lineHeight:1.6}}>
                Es un <strong style={{color:'var(--red)'}}>inventario final</strong>: al confirmarlo, el stock de <strong style={{color:'var(--ac)'}}>{casetas.find(c=>c.id===confirmando.caseta_id)?.nombre}</strong> quedará <strong style={{color:'var(--red)'}}>a 0</strong> (caseta retirada al almacén). El recuento se conserva como registro.<br/><br/>Esta acción <strong>no se puede deshacer.</strong>
              </div>
            ):(
              <div style={{fontSize:'.85rem',color:'var(--tx2)',marginBottom:16,lineHeight:1.6}}>
                Esta acción <strong style={{color:'var(--tx)'}}>sobreescribirá el stock actual</strong> de <strong style={{color:'var(--ac)'}}>{casetas.find(c=>c.id===confirmando.caseta_id)?.nombre}</strong> con los valores contados.<br/><br/>Esta acción <strong>no se puede deshacer.</strong>
              </div>
            )}
            {!confirmando.es_final&&<div style={{background:'var(--s2)',borderRadius:'var(--rs)',padding:'10px 12px',marginBottom:16,fontSize:'.8rem'}}>{confirmando.inventario_items?.filter(i=>i.diferencia!==0).length||0} productos con diferencias serán ajustados.</div>}
            <button className="btn-p" disabled={saving} onClick={()=>confirmar(confirmando)}>{saving?'Aplicando...':confirmando.es_final?'Confirmar y vaciar caseta':'Confirmar y actualizar stock'}</button>
            <button className="btn-s" onClick={()=>setConfirmando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── GESTIÓN PRODUCTOS ────────────────────────────────────────
function GestionProductos() {
  const [productos,setProductos]=useState([])
  const [loading,setLoading]=useState(true)
  const [toast,setToast]=useState(null)
  const [editId,setEditId]=useState(null)
  const [busq,setBusq]=useState('')
  const [catFiltro,setCatFiltro]=useState('Todos')
  const [soloActivos,setSoloActivos]=useState(true)
  const formRef=useRef(null)
  const [categorias,setCategorias]=useState([])
  const [showGestionCat,setShowGestionCat]=useState(false)
  const F0={nombre:'',precio:'',categoria:'',edad_minima:'16',codigo_ean:'',gramos_polvora:'0',division:'',empresa:'',fardo:'1',envases_por_caja:''}
  const [form,setForm]=useState(F0)
  const [empresaFiltro,setEmpresaFiltro]=useState('Todas')
  const showToast=(msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3000) }
  const cargarCategorias=()=>getCategorias().then(setCategorias)
  useEffect(()=>{ getProductos(false).then(setProductos).finally(()=>setLoading(false)); cargarCategorias() },[])
  const catsDinamicas=['Todos',...new Set([...categorias,...productos.map(p=>p.categoria)].filter(Boolean).sort())]

  const guardar=async()=>{
    if(!form.nombre.trim()||!form.precio||!form.codigo_ean.trim()){ showToast('Nombre, precio y EAN son obligatorios','error'); return }
    const categoria=form.categoria
    if(!categoria){ showToast('Elige una categoría','error'); return }
    // Un EAN repetido ya NO es error: puede ser una variante de color o un petardo
    // de otro proveedor que comparte código. Avisamos sin bloquear por si fue un descuido.
    const eanDup=productos.some(p=>p.codigo_ean===form.codigo_ean.trim()&&p.id!==editId)
    try{
      const data=await upsertProducto({...(editId?{id:editId}:{}),nombre:form.nombre.trim(),precio:parseFloat(form.precio),categoria,edad_minima:parseInt(form.edad_minima),codigo_ean:form.codigo_ean.trim(),gramos_polvora:parseFloat(form.gramos_polvora)||0,division:form.division||null,empresa:form.empresa.trim()||null,fardo:Math.max(1,parseInt(form.fardo)||1),envases_por_caja:form.envases_por_caja?Math.max(1,parseInt(form.envases_por_caja)):null,activo:true})
      const aviso=eanDup?' · ⚠ EAN compartido con otro producto (se tratará como variante)':''
      if(editId){setProductos(prev=>prev.map(p=>p.id===editId?data:p));showToast('Producto actualizado ✓'+aviso)}
      else{setProductos(prev=>[...prev,data]);showToast('Producto añadido ✓'+aviso)}
      setForm(F0);setEditId(null)
    }catch(e){showToast(e.message,'error')}
  }
  const editar=p=>{ setForm({nombre:p.nombre,precio:String(p.precio),categoria:p.categoria,edad_minima:String(p.edad_minima),codigo_ean:p.codigo_ean,gramos_polvora:String(p.gramos_polvora??0),division:p.division||'',empresa:p.empresa||'',fardo:String(p.fardo||1),envases_por_caja:p.envases_por_caja?String(p.envases_por_caja):''}); setEditId(p.id); setTimeout(()=>formRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),50) }
  const toggle=async(id,activo)=>{ await toggleProducto(id,!activo); setProductos(prev=>prev.map(p=>p.id===id?{...p,activo:!activo}:p)); showToast(!activo?'Producto activado ✓':'Producto desactivado') }
  const eliminar=async id=>{
    if(!window.confirm('¿Eliminar? Si tiene ventas se desactivará.')) return
    try{ await deleteProducto(id); setProductos(prev=>prev.filter(p=>p.id!==id)); showToast('Eliminado ✓') }
    catch(e){
      if(e.message?.includes('foreign key')||e.message?.includes('violates')){
        await toggleProducto(id,false); setProductos(prev=>prev.map(p=>p.id===id?{...p,activo:false}:p))
        showToast('Tiene ventas — desactivado','ok')
      }else showToast(e.message,'error')
    }
  }
  const eaCl=m=>m===0?'cp':m===12?'cg':m===16?'cb2':'cr'
  const eaLbl=m=>m===0?'T1':m===12?'F1 · 12+':m===16?'F2 · 16+':'F3 · 18+'
  const empresasDinamicas=['Todas',...new Set(productos.map(p=>p.empresa).filter(Boolean).sort())]
  const prods=productos.filter(p=>{
    if(soloActivos&&!p.activo) return false
    if(catFiltro!=='Todos'&&p.categoria!==catFiltro) return false
    if(empresaFiltro!=='Todas'&&(p.empresa||'')!==empresaFiltro) return false
    if(busq&&!p.nombre.toLowerCase().includes(busq.toLowerCase())&&!p.codigo_ean?.includes(busq)) return false
    return true
  }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))
  if(loading) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div ref={formRef} className="stit">{editId?<><i className="fi fi-rr-pencil"/> Editar Producto</>:<><i className="fi fi-rr-plus"/> Nuevo Producto</>}</div>
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Piratas 50u."/></div>
          <div className="fg"><label>Precio (€)</label><input type="number" value={form.precio} onChange={e=>setForm({...form,precio:e.target.value})} placeholder="1.00" min="0" step=".01"/></div>
          <div className="fg"><label>Código EAN</label><input value={form.codigo_ean} onChange={e=>setForm({...form,codigo_ean:e.target.value})} placeholder="8410278004" inputMode="numeric"/></div>
          <div className="fg">
            <label style={{display:'flex',alignItems:'center',gap:8}}>Categoría
              <button type="button" className="btn-o btn-eye" title="Gestionar categorías" onClick={()=>setShowGestionCat(true)}
                style={{padding:'3px 7px',borderRadius:6}}>
                <i className="fi fi-rr-settings"/>
              </button>
            </label>
            <select value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})}>
              <option value="">-- Elegir categoría --</option>
              {categorias.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="fg"><label>Edad mínima</label>
            <select value={form.edad_minima} onChange={e=>setForm({...form,edad_minima:e.target.value})}>
              <option value="0">T1</option><option value="12">F1 · 12+</option><option value="16">F2 · 16+</option><option value="18">F3 · 18+</option>
            </select>
          </div>
          <div className="fg">
            <label>Gramos pólvora NEC <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— según etiqueta del producto</span></label>
            <input type="number" value={form.gramos_polvora} onChange={e=>setForm({...form,gramos_polvora:e.target.value})} placeholder="4.820" min="0" step=".001"/>
          </div>
          <div className="fg">
            <label>División de riesgo <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— 1.3G/1.4G (etiqueta)</span></label>
            <select value={form.division} onChange={e=>setForm({...form,division:e.target.value})}>
              <option value="">— Sin clasificar —</option>
              {DIVISIONES.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="fg"><label>Empresa / Proveedor</label><input value={form.empresa} onChange={e=>setForm({...form,empresa:e.target.value})} placeholder="Ej: Pirotecnia Zaragozana"/></div>
          <div className="fg">
            <label>Uds por envase <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— unidades de venta por envase</span></label>
            <input type="number" value={form.fardo} onChange={e=>setForm({...form,fardo:e.target.value})} placeholder="40" min="1" step="1" inputMode="numeric"/>
          </div>
          <div className="fg">
            <label>Envases por caja <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— opcional (caja de almacén)</span></label>
            <input type="number" value={form.envases_por_caja} onChange={e=>setForm({...form,envases_por_caja:e.target.value})} placeholder="4" min="1" step="1" inputMode="numeric"/>
          </div>
        </div>
        <div style={{display:'flex',gap:9}}>
          <button className="btn-add" onClick={guardar}>{editId?'Guardar cambios':'Añadir producto'}</button>
          {editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setForm(F0)}}>Cancelar</button>}
        </div>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
        <div className="stit" style={{margin:0}}>Catálogo ({prods.length}/{productos.length})</div>
        <input className="si" style={{maxWidth:200}} placeholder="Buscar..." value={busq} onChange={e=>setBusq(e.target.value)}/>
        <select value={catFiltro} onChange={e=>setCatFiltro(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'7px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>{catsDinamicas.map(c=><option key={c}>{c}</option>)}</select>
        <select value={empresaFiltro} onChange={e=>setEmpresaFiltro(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'7px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>{empresasDinamicas.map(c=><option key={c}>{c}</option>)}</select>
        <div onClick={()=>setSoloActivos(v=>!v)} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',padding:'6px 12px',borderRadius:'var(--rs)',border:'1px solid',borderColor:soloActivos?'var(--bd)':'var(--gold)',background:soloActivos?'transparent':'rgba(var(--gold-rgb),.1)'}}>
          <div style={{width:32,height:18,borderRadius:9,background:soloActivos?'var(--s3)':'var(--gold)',position:'relative',transition:'background .2s'}}>
            <div style={{position:'absolute',top:2,left:soloActivos?2:14,width:14,height:14,borderRadius:'50%',background:'white',transition:'left .2s'}}/>
          </div>
          <span style={{fontSize:'.78rem',color:soloActivos?'var(--tx2)':'var(--gold)',fontWeight:600}}>{soloActivos?'Solo activos':'Todos (inc. inactivos)'}</span>
        </div>
      </div>
      <div className="tw"><table style={{minWidth:1120,tableLayout:'fixed'}}>
        <colgroup>
          <col style={{width:'17%'}}/><col style={{width:'11%'}}/><col style={{width:'9%'}}/><col style={{width:'9%'}}/>
          <col style={{width:'5%'}}/><col style={{width:'7%'}}/><col style={{width:'8%'}}/><col style={{width:'6%'}}/>
          <col style={{width:'5%'}}/><col style={{width:'6%'}}/><col style={{width:'17%'}}/>
        </colgroup>
        <thead><tr><th>Nombre</th><th>EAN</th><th>Categoría</th><th>Empresa</th><th>Uds/env</th><th>Precio</th><th>Pólvora NEC</th><th>División</th><th>Edad</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          {prods.map(p=>(
            <tr key={p.id} style={{opacity:p.activo?1:.55}}>
              <td style={{fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={p.nombre}>{p.nombre}{!p.activo&&<span style={{marginLeft:6,fontSize:'.7rem',color:'var(--red)',background:'rgba(var(--red-rgb),.1)',padding:'1px 5px',borderRadius:4}}>inactivo</span>}</td>
              <td style={{color:'var(--tx2)',fontSize:'.76rem',fontFamily:'monospace'}}>{p.codigo_ean}</td>
              <td style={{color:'var(--tx2)'}}>{p.categoria}</td>
              <td style={{color:'var(--tx2)',fontSize:'.82rem'}}>{p.empresa||<span style={{opacity:.3}}>—</span>}</td>
              <td style={{textAlign:'center',fontWeight:600,color:'var(--blue)'}}>{p.fardo>1?p.fardo:<span style={{opacity:.3}}>1</span>}</td>
              <td style={{color:'var(--ac)',fontWeight:700}}>{fmt(p.precio)}</td>
              <td style={{color:'var(--tx2)',fontSize:'.82rem',textAlign:'center'}}>{p.gramos_polvora>0?<span style={{color:'var(--gold)',fontWeight:600}}>{p.gramos_polvora}g</span>:<span style={{opacity:.3}}>—</span>}</td>
              <td style={{textAlign:'center',fontSize:'.78rem'}}>{p.division?<span className={`chip ${p.division==='1.3G'?'cr':'cb2'}`}>{p.division}</span>:(p.gramos_polvora>0?<span title="Producto con NEC sin división asignada" style={{color:'var(--gold)',fontWeight:700,cursor:'help'}}><i className="fi fi-rr-triangle-warning"/></span>:<span style={{opacity:.3}}>—</span>)}</td>
              <td><span className={`chip ${eaCl(p.edad_minima)}`}>{eaLbl(p.edad_minima)}</span></td>
              <td><span className={`chip ${p.activo?'cg':'cr'}`}>{p.activo?'Activo':'Inactivo'}</span></td>
              <td style={{padding:'6px 8px'}}><div className="acell" style={{flexWrap:'nowrap',gap:4}}>
                <button className="btn-edit" onClick={()=>editar(p)}>Editar</button>
                <button className="btn-tog" style={{color:p.activo?'var(--gold)':'var(--green)'}} onClick={()=>toggle(p.id,p.activo)}>{p.activo?'Desact.':'Activar'}</button>
                {p.activo&&<button className="btn-del" onClick={()=>eliminar(p.id)}>Eliminar</button>}
              </div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {showGestionCat&&(
        <ModalCategorias categorias={categorias} productos={productos} showToast={showToast}
          onChanged={()=>{ cargarCategorias(); getProductos(false).then(setProductos) }}
          onClose={()=>setShowGestionCat(false)} />
      )}
    </>
  )
}

// ─── MODAL GESTIÓN CATEGORÍAS ─────────────────────────────────
function ModalCategorias({ categorias, productos, onChanged, onClose, showToast }) {
  const [nueva,setNueva]=useState('')
  const [editTxt,setEditTxt]=useState({})
  const conteo=c=>productos.filter(p=>p.categoria===c).length
  const cerrarEd=c=>setEditTxt(p=>{const x={...p};delete x[c];return x})

  const add=async()=>{ const n=nueva.trim(); if(!n)return
    try{ await crearCategoria(n); setNueva(''); onChanged(); showToast('Categoría añadida ✓') }catch(e){ showToast(e.message,'error') } }
  const rename=async viejo=>{ const nv=(editTxt[viejo]||'').trim()
    if(!nv||nv===viejo){ cerrarEd(viejo); return }
    try{ await renombrarCategoria(viejo,nv); cerrarEd(viejo); onChanged(); showToast('Renombrada ✓') }catch(e){ showToast(e.message,'error') } }
  const del=async c=>{ if(!window.confirm(`¿Borrar la categoría "${c}"?`))return
    try{ await eliminarCategoria(c); onChanged(); showToast('Borrada ✓') }catch(e){ showToast(e.message,'error') } }

  return (
    <div className="mo">
      <div className="mc">
        <ModalClose onClose={onClose} />
        <div className="mt-modal"><i className="fi fi-rr-tags"/> Gestionar categorías</div>
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          <input value={nueva} onChange={e=>setNueva(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Nueva categoría..."
            style={{flex:1,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'9px 12px',color:'var(--tx)',fontSize:'.9rem',fontFamily:"'DM Sans',sans-serif",outline:'none'}}/>
          <button className="btn-add" onClick={add}><i className="fi fi-rr-plus"/> Añadir</button>
        </div>
        <div style={{maxHeight:'50vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
          {categorias.map(c=>{
            const ed=editTxt[c]!==undefined, n=conteo(c)
            return (
              <div key={c} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--s2)',borderRadius:'var(--rs)'}}>
                {ed
                  ? <input autoFocus value={editTxt[c]} onChange={e=>setEditTxt(p=>({...p,[c]:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&rename(c)}
                      style={{flex:1,background:'var(--s1)',border:'1px solid var(--ac)',borderRadius:6,padding:'6px 10px',color:'var(--tx)',fontSize:'.88rem',fontFamily:"'DM Sans',sans-serif",outline:'none'}}/>
                  : <span style={{flex:1,fontWeight:600}}>{c} <span style={{color:'var(--tx2)',fontWeight:400,fontSize:'.75rem'}}>· {n} prod.</span></span>}
                {ed
                  ? <><button className="btn-edit" onClick={()=>rename(c)}>Guardar</button><button className="btn-del" onClick={()=>cerrarEd(c)}>✕</button></>
                  : <><button className="btn-edit" onClick={()=>setEditTxt(p=>({...p,[c]:c}))}>Renombrar</button><button className="btn-del" onClick={()=>del(c)}>Borrar</button></>}
              </div>
            )
          })}
          {categorias.length===0&&<div style={{color:'var(--tx2)',fontSize:'.85rem',textAlign:'center',padding:14}}>No hay categorías.</div>}
        </div>
        <div className="info-box" style={{marginTop:10,marginBottom:10}}>Al <strong>renombrar</strong> se actualizan todos los productos de esa categoría. No se puede <strong>borrar</strong> una categoría que tenga productos.</div>
        <button className="btn-s" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  )
}

// ─── GESTIÓN STOCK ────────────────────────────────────────────
function GestionStock({ casetas }) {
  const [productos,setProductos]=useState([])
  const [stockData,setStockData]=useState({})
  const [minimoData,setMinimoData]=useState({})
  const [casetaSel,setCasetaSel]=useState('')
  const [kgActual,setKgActual]=useState(0)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(null)
  const [savingMin,setSavingMin]=useState(null)
  const [editVals,setEditVals]=useState({})
  const [editMinimos,setEditMinimos]=useState({})
  const [busq,setBusq]=useState('')
  const [catFiltro,setCatFiltro]=useState('Todos')
  const [toast,setToast]=useState(null)
  const showToast=(msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2500) }

  useEffect(()=>{ getProductos(true).then(p=>{setProductos(p);if(casetas.length)setCasetaSel(casetas[0].id)}).finally(()=>setLoading(false)) },[])
  useEffect(()=>{
    if(!casetaSel) return; setLoading(true)
    Promise.all([getStockCaseta(casetaSel),getKgPolvora(casetaSel),getStockMinimos(casetaSel)]).then(([stk,kg,mins])=>{
      setStockData(prev=>({...prev,[casetaSel]:stk}))
      setMinimoData(prev=>({...prev,[casetaSel]:mins}))
      setKgActual(kg); setEditVals({}); setEditMinimos({})
    }).finally(()=>setLoading(false))
  },[casetaSel])

  const stockActual=stockData[casetaSel]||{}
  const minimoActual=minimoData[casetaSel]||{}
  const CATS=['Todos',...new Set(productos.map(p=>p.categoria).sort())]
  const caseta=casetas.find(c=>c.id===casetaSel)
  const limite=caseta?.limite_kg_polvora||10
  const pctKg=limite>0?(kgActual/limite)*100:0
  // Desglose de NEC por división (1.3G ≤ 20%, etc.) calculado del stock actual
  const necPorDivision={}; let necSinClasif=0
  productos.forEach(p=>{
    const cant=stockActual[p.id]||0, g=p.gramos_polvora||0
    if(cant<=0||g<=0) return
    const kg=cant*g/1000
    if(p.division) necPorDivision[p.division]=(necPorDivision[p.division]||0)+kg
    else necSinClasif+=kg
  })
  const necEval=evaluarNEC(necPorDivision,limite)

  const ajustar=async(productoId, delta)=>{
    const val=editVals[productoId]; if(val===undefined||val==='') return
    const cantidad=parseInt(val); if(isNaN(cantidad)||cantidad<=0){showToast('Cantidad no válida','error');return}
    setSaving(productoId)
    try{
      const nueva=await ajustarStockAuditado(productoId,casetaSel,delta*cantidad,'Ajuste admin')
      setStockData(prev=>({...prev,[casetaSel]:{...prev[casetaSel],[productoId]:nueva}}))
      setEditVals(prev=>{const n={...prev};delete n[productoId];return n})
      showToast(`Stock ${delta>0?'añadido':'restado'} ✓`)
      getKgPolvora(casetaSel).then(setKgActual)
    }catch(e){showToast(e.message,'error')}finally{setSaving(null)}
  }

  const guardarMinimo=async(productoId)=>{
    const val=editMinimos[productoId]; if(val===undefined) return
    const minimo=Math.max(0,parseInt(val)||0)
    setSavingMin(productoId)
    try{
      await setStockMinimo(productoId,casetaSel,minimo)
      setMinimoData(prev=>({...prev,[casetaSel]:{...prev[casetaSel],[productoId]:minimo}}))
      setEditMinimos(prev=>{const n={...prev};delete n[productoId];return n})
      showToast('Mínimo actualizado ✓')
    }catch(e){showToast(e.message,'error')}finally{setSavingMin(null)}
  }

  const prods=productos.filter(p=>{
    if(catFiltro!=='Todos'&&p.categoria!==catFiltro) return false
    if(busq&&!p.nombre.toLowerCase().includes(busq.toLowerCase())&&!p.codigo_ean?.includes(busq)) return false
    return true
  }).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))
  const colStock=(n,min=0)=>n===0?'var(--red)':(min>0&&n<min)?'var(--gold)':'var(--green)'
  if(loading&&!productos.length) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:16,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {casetas.map(c=>(
            <button key={c.id} onClick={()=>setCasetaSel(c.id)} style={{padding:'7px 13px',borderRadius:'var(--rs)',border:'1px solid',borderColor:casetaSel===c.id?'var(--ac)':'var(--bd)',background:casetaSel===c.id?'rgba(var(--ac-rgb),.1)':'transparent',color:casetaSel===c.id?'var(--ac)':'var(--tx2)',fontSize:'.82rem',fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{c.nombre.replace('Caballer ','')}</button>
          ))}
        </div>
<input className="si" style={{maxWidth:200}} placeholder="Buscar..." value={busq} onChange={e=>setBusq(e.target.value)}/>
        <WheelScrollDiv style={{display:'flex',gap:5,overflowX:'auto',flexShrink:0}}>
          {CATS.map(c=>(
            <button key={c} onClick={()=>setCatFiltro(c)} style={{flexShrink:0,padding:'6px 12px',borderRadius:20,fontSize:'.75rem',fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",background:catFiltro===c?'var(--ac)':'var(--s2)',border:`1px solid ${catFiltro===c?'var(--ac)':'var(--bd)'}`,color:catFiltro===c?'white':'var(--tx2)',whiteSpace:'nowrap'}}>{c}</button>
          ))}
        </WheelScrollDiv>
      </div>

      {casetaSel&&(
        <div style={{background:pctKg>=90?'rgba(var(--red-rgb),.1)':pctKg>=75?'rgba(var(--gold-rgb),.1)':'var(--s2)',borderRadius:'var(--rs)',padding:'10px 14px',marginBottom:14,border:`1px solid ${pctKg>=90?'var(--red)':pctKg>=75?'var(--gold)':'var(--bd)'}`}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontWeight:600,fontSize:'.83rem'}}><i className="fi fi-rr-flame"/> Pólvora — {caseta?.nombre}</span>
            <span style={{fontWeight:700,color:pctKg>=90?'var(--red)':pctKg>=75?'var(--gold)':'var(--green)'}}>{kgActual.toFixed(3)} kg / {limite} kg ({pctKg.toFixed(1)}%)</span>
          </div>
          <div style={{height:6,background:'var(--s3)',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${Math.min(100,pctKg)}%`,background:pctKg>=90?'var(--red)':pctKg>=75?'var(--gold)':'var(--green)',borderRadius:3,transition:'width .5s'}}/>
          </div>
          {pctKg>=80&&<div style={{fontSize:'.75rem',marginTop:5,color:pctKg>=100?'var(--red)':pctKg>=90?'var(--red)':'var(--gold)',fontWeight:700}}>
            {pctKg>=100
              ? <><i className="fi fi-rr-siren"/> LÍMITE SUPERADO. Obligatorio reducir stock antes de recibir más mercancía.</>
              : pctKg>=90
              ? <><i className="fi fi-rr-triangle-warning"/> ALERTA: Más del 90% del límite. No añadir más stock.</>
              : <><i className="fi fi-rr-triangle-warning"/> Advertencia: Stock al 80% del límite legal.</>}
          </div>}
          {/* Desglose por división de riesgo */}
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8,fontSize:'.74rem'}}>
            {necEval.divisiones.map(d=>(
              <span key={d.division} title={`${d.division}: ${d.kg.toFixed(3)} kg de ${d.maxKg.toFixed(3)} kg máx (${(d.pctMax*100).toFixed(0)}%)`}
                style={{display:'flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:12,fontWeight:700,
                background:d.excedido?'rgba(var(--red-rgb),.15)':'var(--s3)',color:d.excedido?'var(--red)':'var(--tx2)',border:`1px solid ${d.excedido?'var(--red)':'var(--bd)'}`}}>
                {d.division}: {d.kg.toFixed(2)}/{d.maxKg.toFixed(2)}kg
                {d.excedido&&<><i className="fi fi-rr-triangle-warning"/> {(d.pctMax*100).toFixed(0)}% máx</>}
              </span>
            ))}
            {Object.entries(necPorDivision).filter(([div])=>!['1.1G','1.2G','1.3G'].includes(div)).map(([div,kg])=>(
              <span key={div} style={{padding:'2px 8px',borderRadius:12,fontWeight:700,background:'var(--s3)',color:'var(--tx2)',border:'1px solid var(--bd)'}}>{div}: {kg.toFixed(2)}kg</span>
            ))}
            {necSinClasif>0&&(
              <span title="NEC de productos sin división asignada — clasifícalos en Productos" style={{padding:'2px 8px',borderRadius:12,fontWeight:700,background:'rgba(var(--gold-rgb),.15)',color:'var(--gold)',border:'1px solid var(--gold)',cursor:'help'}}>
                <i className="fi fi-rr-triangle-warning"/> Sin clasificar: {necSinClasif.toFixed(2)}kg
              </span>
            )}
          </div>
        </div>
      )}

      <div className="info-box" style={{marginBottom:12}}>Escribe la cantidad a <strong>sumar</strong> o <strong>restar</strong> y pulsa el botón correspondiente. El <strong>mínimo</strong> define cuándo un producto aparece en el pedido automático.</div>
      {loading&&<div className="loading-row"><div className="spin-sm"/>Actualizando...</div>}
      <div className="tw"><table>
        <thead><tr><th>Producto</th><th>Categoría</th><th>EAN</th><th style={{textAlign:'center'}}>Stock</th><th style={{textAlign:'center'}}>Mínimo</th><th style={{textAlign:'center'}}>Ajustar</th></tr></thead>
        <tbody>
          {prods.map(p=>{
            const cant=stockActual[p.id]??0; const guardando=saving===p.id
            const minimo=minimoActual[p.id]??0; const guardandoMin=savingMin===p.id
            const bajominimo=minimo>0&&cant<minimo
            return(
              <tr key={p.id} style={bajominimo?{background:'rgba(var(--red-rgb),.04)'}:{}}>
                <td style={{fontWeight:600}}>{p.nombre}{bajominimo&&<span style={{marginLeft:6,fontSize:'.65rem',background:'rgba(var(--red-rgb),.15)',color:'var(--red)',border:'1px solid rgba(var(--red-rgb),.3)',borderRadius:6,padding:'1px 5px',fontWeight:700}}>bajo mín.</span>}</td>
                <td style={{color:'var(--tx2)',fontSize:'.78rem'}}>{p.categoria}</td>
                <td style={{color:'var(--tx2)',fontSize:'.74rem',fontFamily:'monospace'}}>{p.codigo_ean}</td>
                <td style={{textAlign:'center'}}><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.2rem',color:colStock(cant,minimo)}}>{cant}</span></td>
                <td style={{textAlign:'center'}}>
                  <input type="number" min="0"
                    value={editMinimos[p.id]!==undefined?editMinimos[p.id]:minimo}
                    onChange={e=>setEditMinimos(prev=>({...prev,[p.id]:e.target.value}))}
                    onFocus={e=>e.target.select()}
                    onBlur={()=>guardarMinimo(p.id)}
                    onKeyDown={e=>e.key==='Enter'&&guardarMinimo(p.id)}
                    disabled={guardandoMin}
                    style={{width:58,background:'var(--s2)',border:'1px solid',borderColor:editMinimos[p.id]!==undefined?'var(--ac)':'var(--bd)',borderRadius:'var(--rs)',padding:'5px 4px',color:'var(--tx)',fontSize:'.85rem',outline:'none',fontFamily:"'DM Sans',sans-serif",textAlign:'center'}}
                    inputMode="numeric"/>
                </td>
                <td style={{textAlign:'center'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                    <button onClick={()=>ajustar(p.id,-1)} disabled={guardando||!editVals[p.id]} style={{width:28,height:28,borderRadius:'50%',border:'1px solid rgba(var(--red-rgb),.4)',background:'rgba(var(--red-rgb),.1)',color:'var(--red)',cursor:'pointer',fontSize:'1rem',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',opacity:(!editVals[p.id]||guardando)?.4:1}}>−</button>
                    <input type="number" min="1" value={editVals[p.id]??''} placeholder="cant" onChange={e=>setEditVals(prev=>({...prev,[p.id]:e.target.value}))}
                      style={{width:58,background:'var(--s2)',border:'1px solid',borderColor:editVals[p.id]!==undefined?'var(--ac)':'var(--bd)',borderRadius:'var(--rs)',padding:'5px 4px',color:'var(--tx)',fontSize:'.85rem',outline:'none',fontFamily:"'DM Sans',sans-serif",textAlign:'center'}} inputMode="numeric"/>
                    <button onClick={()=>ajustar(p.id,+1)} disabled={guardando||!editVals[p.id]} style={{width:28,height:28,borderRadius:'50%',border:'1px solid rgba(var(--green-rgb),.4)',background:'rgba(var(--green-rgb),.1)',color:'var(--green)',cursor:'pointer',fontSize:'1rem',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',opacity:(!editVals[p.id]||guardando)?.4:1}}>{guardando?'…':'+'}</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
    </>
  )
}

// ─── GESTIÓN OFERTAS ─────────────────────────────────────────
function GestionOfertas() {
  const [ofertas,setOfertas]=useState([])
  const [productos,setProductos]=useState([])
  const [loading,setLoading]=useState(true)
  const [toast,setToast]=useState(null)
  const [editId,setEditId]=useState(null)
  const [tipo,setTipo]=useState('pack')
  const F0pack={producto_id:'',etiqueta:'',cantidad_pack:'',precio_pack:''}
  const [formPack,setFormPack]=useState(F0pack)
  const F0comb={etiqueta:'',precio_pack:'',lineas:[{producto_id:'',cantidad:'1'},{producto_id:'',cantidad:'1'}]}
  const [formComb,setFormComb]=useState(F0comb)
  const [busq,setBusq]=useState('')
  const [filtroTipo,setFiltroTipo]=useState('todas') // todas | pack | combinada
  const showToast=(msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  useEffect(()=>{ Promise.all([getOfertas(false),getProductos()]).then(([o,p])=>{setOfertas(o);setProductos(p)}).finally(()=>setLoading(false)) },[])

  const toggleActiva=async o=>{
    const activa=o.activa!==false
    try{
      await updateOferta(o.id,{activa:!activa})
      setOfertas(prev=>prev.map(x=>x.id===o.id?{...x,activa:!activa}:x))
      showToast(activa?'Oferta desactivada — no se aplica en las ventas':'Oferta activada ✓')
    }catch(e){showToast(e.message,'error')}
  }

  const toggleTodas=async activa=>{
    if(ofertas.length===0){showToast('No hay ofertas',' error');return}
    if(!confirm(activa?'¿Activar TODAS las ofertas?':'¿Desactivar TODAS las ofertas? No se aplicarán en las ventas hasta que las vuelvas a activar.'))return
    try{
      await setTodasOfertasActivas(activa)
      setOfertas(prev=>prev.map(x=>({...x,activa})))
      showToast(activa?'Todas las ofertas activadas ✓':'Todas las ofertas desactivadas')
    }catch(e){showToast(e.message,'error')}
  }

  const guardarPack=async()=>{
    const {producto_id,etiqueta,cantidad_pack,precio_pack}=formPack
    if(!producto_id||!etiqueta||!cantidad_pack||!precio_pack){showToast('Todos los campos obligatorios','error');return}
    try{
      const data=await upsertOferta({...(editId?{id:editId}:{}),tipo:'pack',producto_id,etiqueta,cantidad_pack:parseInt(cantidad_pack),precio_pack:parseFloat(precio_pack),activa:true})
      if(editId)setOfertas(prev=>prev.map(o=>o.id===editId?data:o)); else setOfertas(prev=>[...prev,data])
      showToast(editId?'Actualizada ✓':'Oferta añadida ✓'); setFormPack(F0pack); setEditId(null)
    }catch(e){showToast(e.message,'error')}
  }
  const guardarCombinada=async()=>{
    const {etiqueta,precio_pack,lineas}=formComb
    if(!etiqueta||!precio_pack){showToast('Etiqueta y precio obligatorios','error');return}
    const lineasVal=lineas.filter(l=>l.producto_id&&parseInt(l.cantidad)>0)
    if(lineasVal.length<2){showToast('Mínimo 2 productos','error');return}
    const productos_requeridos=lineasVal.map(l=>({producto_id:l.producto_id,cantidad:parseInt(l.cantidad),nombre:productos.find(p=>p.id===l.producto_id)?.nombre||''}))
    try{
      const data=await upsertOferta({...(editId?{id:editId}:{}),tipo:'combinada',producto_id:null,etiqueta,cantidad_pack:lineasVal.reduce((s,l)=>s+parseInt(l.cantidad),0),precio_pack:parseFloat(precio_pack),productos_requeridos,activa:true})
      if(editId)setOfertas(prev=>prev.map(o=>o.id===editId?data:o)); else setOfertas(prev=>[...prev,data])
      showToast(editId?'Actualizada ✓':'Oferta combinada añadida ✓'); setFormComb(F0comb); setEditId(null)
    }catch(e){showToast(e.message,'error')}
  }
  const editar=o=>{
    setEditId(o.id)
    if(!o.tipo||o.tipo==='pack'){setTipo('pack');setFormPack({producto_id:o.producto_id||'',etiqueta:o.etiqueta,cantidad_pack:String(o.cantidad_pack),precio_pack:String(o.precio_pack)})}
    else{setTipo('combinada');setFormComb({etiqueta:o.etiqueta,precio_pack:String(o.precio_pack),lineas:(o.productos_requeridos||[]).map(r=>({producto_id:r.producto_id,cantidad:String(r.cantidad)}))})}
  }
  const eliminar=async id=>{if(!window.confirm('¿Eliminar oferta?'))return; await deleteOferta(id); setOfertas(prev=>prev.filter(o=>o.id!==id)); showToast('Eliminada')}
  const addLinea=()=>setFormComb(prev=>({...prev,lineas:[...prev.lineas,{producto_id:'',cantidad:'1'}]}))
  const removeLinea=i=>setFormComb(prev=>({...prev,lineas:prev.lineas.filter((_,j)=>j!==i)}))
  const setLinea=(i,campo,val)=>setFormComb(prev=>({...prev,lineas:prev.lineas.map((l,j)=>j===i?{...l,[campo]:val}:l)}))
  const prodSel=productos.find(p=>p.id===formPack.producto_id)
  const precioU=formPack.cantidad_pack&&formPack.precio_pack?parseFloat(formPack.precio_pack)/parseInt(formPack.cantidad_pack):0
  if(loading) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  const ofertasFiltradas=ofertas.filter(o=>{
    if(filtroTipo==='pack'&&o.tipo==='combinada')return false
    if(filtroTipo==='combinada'&&o.tipo!=='combinada')return false
    if(!busq)return true
    const b=busq.toLowerCase()
    if((o.etiqueta||o.nombre||'').toLowerCase().includes(b))return true
    if(o.tipo==='combinada')return (o.productos_requeridos||[]).some(r=>(r.nombre||productos.find(p=>p.id===r.producto_id)?.nombre||'').toLowerCase().includes(b))
    return productos.find(p=>p.id===o.producto_id)?.nombre.toLowerCase().includes(b)
  })

  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div className="stit">{editId?<><i className="fi fi-rr-pencil"/> Editar Oferta</>:<><i className="fi fi-rr-plus"/> Nueva Oferta</>}</div>
      {!editId&&(
        <div style={{display:'flex',gap:0,marginBottom:14,background:'var(--s2)',borderRadius:'var(--rs)',padding:4,width:'fit-content'}}>
          <button onClick={()=>setTipo('pack')} style={{padding:'7px 18px',borderRadius:'var(--rs)',border:'none',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.82rem',cursor:'pointer',background:tipo==='pack'?'var(--ac)':'transparent',color:tipo==='pack'?'white':'var(--tx2)'}}><i className="fi fi-rr-box"/> Pack</button>
          <button onClick={()=>setTipo('combinada')} style={{padding:'7px 18px',borderRadius:'var(--rs)',border:'none',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.82rem',cursor:'pointer',background:tipo==='combinada'?'var(--ac)':'transparent',color:tipo==='combinada'?'white':'var(--tx2)'}}><i className="fi fi-rr-gift"/> Combinada</button>
        </div>
      )}
      {tipo==='pack'&&(
        <div className="iform">
          <div className="frow">
            <div className="fg"><label>Producto</label><select value={formPack.producto_id} onChange={e=>setFormPack({...formPack,producto_id:e.target.value})}><option value="">-- Seleccionar --</option>{[...productos.filter(p=>p.activo)].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(p=><option key={p.id} value={p.id}>{p.nombre} ({fmt(p.precio)})</option>)}</select></div>
            <div className="fg"><label>Etiqueta</label><input value={formPack.etiqueta} onChange={e=>setFormPack({...formPack,etiqueta:e.target.value})} placeholder="4 x 5€"/></div>
            <div className="fg"><label>Unidades</label><input type="number" value={formPack.cantidad_pack} onChange={e=>setFormPack({...formPack,cantidad_pack:e.target.value})} placeholder="4" min="2"/></div>
            <div className="fg"><label>Precio (€)</label><input type="number" value={formPack.precio_pack} onChange={e=>setFormPack({...formPack,precio_pack:e.target.value})} placeholder="5.00" min="0" step=".01"/></div>
          </div>
          {formPack.cantidad_pack&&formPack.precio_pack&&(<div style={{fontSize:'.8rem',marginBottom:11,display:'flex',gap:18}}><span style={{color:'var(--gold)'}}>€/u.: <strong>{fmt(precioU)}</strong></span>{prodSel&&<span style={{color:'var(--green)'}}>Ahorro: <strong>{fmt(prodSel.precio-precioU)}/u.</strong></span>}</div>)}
          <div style={{display:'flex',gap:9}}><button className="btn-add" onClick={guardarPack}>{editId?'Guardar':'Añadir'}</button>{editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setFormPack(F0pack)}}>Cancelar</button>}</div>
        </div>
      )}
      {tipo==='combinada'&&(
        <div className="iform">
          <div className="frow">
            <div className="fg"><label>Etiqueta</label><input value={formComb.etiqueta} onChange={e=>setFormComb({...formComb,etiqueta:e.target.value})} placeholder="Mini fuente + Cracker 5€"/></div>
            <div className="fg"><label>Precio total (€)</label><input type="number" value={formComb.precio_pack} onChange={e=>setFormComb({...formComb,precio_pack:e.target.value})} placeholder="5.00" min="0" step=".01"/></div>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:'.73rem',color:'var(--tx2)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Productos incluidos</div>
            {formComb.lineas.map((l,i)=>(
              <div key={i} style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                <select value={l.producto_id} onChange={e=>setLinea(i,'producto_id',e.target.value)} style={{flex:2,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}><option value="">-- Producto --</option>{[...productos.filter(p=>p.activo)].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                <div style={{display:'flex',alignItems:'center',gap:6,flex:1}}><label style={{fontSize:'.75rem',color:'var(--tx2)',whiteSpace:'nowrap'}}>Cant.</label><input type="number" min="1" value={l.cantidad} onChange={e=>setLinea(i,'cantidad',e.target.value)} style={{width:60,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif",textAlign:'center'}} inputMode="numeric"/></div>
                {formComb.lineas.length>2&&<button onClick={()=>removeLinea(i)} style={{width:28,height:28,borderRadius:'50%',border:'1px solid rgba(var(--red-rgb),.3)',background:'rgba(var(--red-rgb),.1)',color:'var(--red)',cursor:'pointer',fontSize:'.85rem',display:'flex',alignItems:'center',justifyContent:'center'}}><i className="fi fi-rr-cross"/></button>}
              </div>
            ))}
            <button onClick={addLinea} style={{background:'transparent',border:'1px dashed var(--bd)',borderRadius:'var(--rs)',padding:'6px 14px',color:'var(--tx2)',cursor:'pointer',fontSize:'.78rem',fontFamily:"'DM Sans',sans-serif"}}>+ Añadir producto</button>
          </div>
          <div style={{display:'flex',gap:9}}><button className="btn-add" onClick={guardarCombinada}>{editId?'Guardar':'Añadir combinada'}</button>{editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setFormComb(F0comb)}}>Cancelar</button>}</div>
        </div>
      )}
      <div className="stit" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <span>Ofertas ({busq||filtroTipo!=='todas'?`${ofertasFiltradas.length}/${ofertas.length}`:ofertas.length})</span>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>toggleTodas(true)} style={{padding:'5px 12px',borderRadius:'var(--rs)',background:'rgba(var(--green-rgb),.12)',border:'1px solid rgba(var(--green-rgb),.3)',color:'var(--green)',fontWeight:600,cursor:'pointer',fontSize:'.76rem',fontFamily:"'DM Sans',sans-serif"}}><i className="fi fi-rr-check"/> Activar todas</button>
          <button onClick={()=>toggleTodas(false)} style={{padding:'5px 12px',borderRadius:'var(--rs)',background:'rgba(var(--red-rgb),.08)',border:'1px solid rgba(var(--red-rgb),.25)',color:'var(--red)',fontWeight:600,cursor:'pointer',fontSize:'.76rem',fontFamily:"'DM Sans',sans-serif"}}><i className="fi fi-rr-square"/> Desactivar todas</button>
        </div>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar oferta o producto..." style={{flex:1,minWidth:180,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem'}}/>
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 12px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif",fontSize:'.85rem'}}>
          <option value="todas">Todos los tipos</option>
          <option value="pack">Solo packs</option>
          <option value="combinada">Solo combinadas</option>
        </select>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Tipo</th><th>Descripción</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          {ofertasFiltradas.length===0?<tr><td colSpan={5} style={{textAlign:'center',color:'var(--tx2)',padding:24}}>{ofertas.length===0?'Sin ofertas':'Ninguna oferta coincide con el filtro'}</td></tr>
            :ofertasFiltradas.map(o=>{
            const esComb=o.tipo==='combinada'; const p=!esComb&&productos.find(x=>x.id===o.producto_id)
            const activa=o.activa!==false
            return(
              <tr key={o.id} style={{opacity:activa?1:.5}}>
                <td><span className={`chip ${esComb?'cb2':'cy'}`}>{esComb?'Combinada':'Pack'}</span></td>
                <td style={{fontWeight:600}}>
                  {esComb?<>{o.etiqueta}<br/><span style={{fontWeight:400,fontSize:'.74rem',color:'var(--tx2)'}}>{(o.productos_requeridos||[]).map(r=>`${r.cantidad}× ${r.nombre}`).join(' + ')}</span></>
                    :<>{p?p.nombre:<span style={{color:'var(--red)'}}>Eliminado</span>}<br/><span style={{fontWeight:400,fontSize:'.74rem',color:'var(--tx2)'}}>{o.etiqueta} · {o.cantidad_pack}u.</span></>}
                </td>
                <td style={{color:'var(--ac)',fontWeight:700}}>{fmt(o.precio_pack)}</td>
                <td><span className={`chip ${activa?'cg':'cr'}`}>{activa?'Activa':'Inactiva'}</span></td>
                <td><div className="acell"><button className="btn-edit" onClick={()=>editar(o)}>Editar</button><button className="btn-tog" style={{color:activa?'var(--gold)':'var(--green)'}} onClick={()=>toggleActiva(o)}>{activa?'Desactivar':'Activar'}</button><button className="btn-del" onClick={()=>eliminar(o.id)}>Eliminar</button></div></td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
    </>
  )
}

// ─── GESTIÓN CASETAS ─────────────────────────────────────────
export function GestionCasetas({ casetas, setCasetas }) {
  const [toast,setToast]=useState(null)
  const [editId,setEditId]=useState(null)
  const F0={nombre:'',prefijo:'',direccion:'',limite_kg_polvora:'10',latitud:'',longitud:'',radio_metros:'150',geo_activo:false,pedidos_auto_activos:false,hora_corte_pedidos:'20:00'}
  const [form,setForm]=useState(F0)
  const showToast=(msg,type='ok')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3000) }
  const guardar=async()=>{
    if(!form.nombre.trim()){showToast('El nombre es obligatorio','error');return}
    try{
      const data=await upsertCaseta({
        ...(editId?{id:editId}:{}),
        nombre:form.nombre.trim(),
        prefijo:form.prefijo.trim().toUpperCase()||null,
        direccion:form.direccion.trim()||null,
        limite_kg_polvora:parseFloat(form.limite_kg_polvora)||10,
        latitud:form.latitud?parseFloat(form.latitud):null,
        longitud:form.longitud?parseFloat(form.longitud):null,
        radio_metros:parseInt(form.radio_metros)||150,
        geo_activo:form.geo_activo,
        pedidos_auto_activos:form.pedidos_auto_activos,
        hora_corte_pedidos:form.hora_corte_pedidos||'20:00',
      })
      if(editId){setCasetas(prev=>prev.map(c=>c.id===editId?data:c));showToast('Caseta actualizada ✓')}
      else{setCasetas(prev=>[...prev,data]);showToast('Caseta creada ✓')}
      setForm(F0);setEditId(null)
    }catch(e){showToast(e.message,'error')}
  }
  const eliminar=async id=>{
    if(!window.confirm('¿Eliminar caseta?')) return
    try{await deleteCaseta(id);setCasetas(prev=>prev.filter(c=>c.id!==id));showToast('Caseta eliminada')}
    catch(e){showToast(e.message,'error')}
  }
  const toggleActiva=async c=>{
    const activaAhora=c.activo!==false
    try{
      await updateCaseta(c.id,{activo:!activaAhora})
      setCasetas(prev=>prev.map(x=>x.id===c.id?{...x,activo:!activaAhora}:x))
      showToast(activaAhora?'Caseta desactivada — no cuenta en las alertas de stock':'Caseta activada ✓')
    }catch(e){showToast(e.message,'error')}
  }
  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div className="stit">{editId?<><i className="fi fi-rr-pencil"/> Editar Caseta</>:<><i className="fi fi-rr-plus"/> Nueva Caseta</>}</div>
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Caballer Ruzafa"/></div>
          <div className="fg"><label>Prefijo tique <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— 3 letras</span></label><input value={form.prefijo} maxLength={4} onChange={e=>setForm({...form,prefijo:e.target.value.toUpperCase()})} placeholder="RUZ" style={{textTransform:'uppercase'}}/></div>
          <div className="fg"><label>Dirección (opcional)</label><input value={form.direccion} onChange={e=>setForm({...form,direccion:e.target.value})} placeholder="Calle Mayor 12, Valencia"/></div>
          <div className="fg">
            <label>Límite pólvora (kg) <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— según licencia</span></label>
            <input type="number" value={form.limite_kg_polvora} onChange={e=>setForm({...form,limite_kg_polvora:e.target.value})} placeholder="10" min="0" step=".001"/>
          </div>
        </div>

        {/* ── Geolocalización ── */}
        <div style={{background:'var(--s2)',borderRadius:'var(--rs)',padding:'12px 14px',border:'1px solid var(--bd)',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:'.85rem'}}><i className="fi fi-rr-map-marker"/> Control de ubicación al fichar</div>
            <div onClick={()=>setForm(f=>({...f,geo_activo:!f.geo_activo}))} style={{
              width:38,height:20,borderRadius:10,cursor:'pointer',flexShrink:0,
              background:form.geo_activo?'var(--green)':'var(--s3)',position:'relative',marginLeft:'auto',transition:'background .2s',
            }}>
              <div style={{position:'absolute',top:2,left:form.geo_activo?20:2,width:16,height:16,borderRadius:'50%',background:'white',transition:'left .2s'}}/>
            </div>
          </div>
          {!form.geo_activo&&<div style={{fontSize:'.78rem',color:'var(--tx2)'}}>Desactivado — empleados pueden fichar desde cualquier lugar</div>}
          {form.geo_activo&&(
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10}}>
              <div className="fg" style={{margin:0}}>
                <label>Latitud</label>
                <input type="number" step="0.0000001" value={form.latitud} onChange={e=>setForm(f=>({...f,latitud:e.target.value}))} placeholder="39.4699"/>
              </div>
              <div className="fg" style={{margin:0}}>
                <label>Longitud</label>
                <input type="number" step="0.0000001" value={form.longitud} onChange={e=>setForm(f=>({...f,longitud:e.target.value}))} placeholder="-0.3763"/>
              </div>
              <div className="fg" style={{margin:0}}>
                <label>Radio (metros)</label>
                <input type="number" min="50" max="500" value={form.radio_metros} onChange={e=>setForm(f=>({...f,radio_metros:e.target.value}))} placeholder="150"/>
              </div>
              <div style={{gridColumn:'1/-1',fontSize:'.73rem',color:'var(--tx2)'}}>
                <i className="fi fi-rr-info"/> Abre <a href="https://maps.google.com" target="_blank" rel="noopener" style={{color:'var(--blue)'}}>Google Maps</a>, mantén pulsado sobre la caseta y copia las coordenadas que aparecen.
              </div>
            </div>
          )}
        </div>
        {/* ── Pedidos automáticos ── */}
        <div style={{background:'var(--s2)',borderRadius:'var(--rs)',padding:'12px 14px',border:'1px solid var(--bd)',marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:'.85rem'}}><i className="fi fi-rr-settings"/> Pedidos automáticos</div>
            <div onClick={()=>setForm(f=>({...f,pedidos_auto_activos:!f.pedidos_auto_activos}))} style={{
              width:38,height:20,borderRadius:10,cursor:'pointer',flexShrink:0,
              background:form.pedidos_auto_activos?'var(--green)':'var(--s3)',position:'relative',marginLeft:'auto',transition:'background .2s',
            }}>
              <div style={{position:'absolute',top:2,left:form.pedidos_auto_activos?20:2,width:16,height:16,borderRadius:'50%',background:'white',transition:'left .2s'}}/>
            </div>
          </div>
          {!form.pedidos_auto_activos&&<div style={{fontSize:'.78rem',color:'var(--tx2)'}}>Desactivado — los empleados crean pedidos manualmente</div>}
          {form.pedidos_auto_activos&&(
            <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div className="fg" style={{margin:0,flex:'0 0 auto'}}>
                <label>Hora de corte de pedidos</label>
                <input type="time" value={form.hora_corte_pedidos} onChange={e=>setForm(f=>({...f,hora_corte_pedidos:e.target.value}))} style={{width:'auto'}}/>
              </div>
              <div style={{fontSize:'.75rem',color:'var(--tx2)',marginTop:12}}>Los empleados verán un aviso y podrán generar el pedido automático antes de esta hora.</div>
            </div>
          )}
        </div>

        <div style={{display:'flex',gap:9}}>
          <button className="btn-add" onClick={guardar}>{editId?'Guardar':'Crear caseta'}</button>
          {editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setForm(F0)}}>Cancelar</button>}
        </div>
      </div>
      <div className="stit" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <span>Casetas ({casetas.length})</span>
        <div style={{display:'flex',gap:6}}>
          <button onClick={async()=>{
            try{await updateAllPedidosAuto(true);setCasetas(prev=>prev.map(c=>({...c,pedidos_auto_activos:true})));showToast('Pedidos auto activados en todas las casetas ✓')}
            catch(e){showToast(e.message,'error')}
          }} style={{padding:'5px 12px',borderRadius:'var(--rs)',background:'rgba(var(--green-rgb),.12)',border:'1px solid rgba(var(--green-rgb),.3)',color:'var(--green)',fontWeight:600,cursor:'pointer',fontSize:'.76rem',fontFamily:"'DM Sans',sans-serif"}}><i className="fi fi-rr-settings"/> Activar todas</button>
          <button onClick={async()=>{
            try{await updateAllPedidosAuto(false);setCasetas(prev=>prev.map(c=>({...c,pedidos_auto_activos:false})));showToast('Pedidos auto desactivados en todas las casetas')}
            catch(e){showToast(e.message,'error')}
          }} style={{padding:'5px 12px',borderRadius:'var(--rs)',background:'rgba(var(--red-rgb),.08)',border:'1px solid rgba(var(--red-rgb),.25)',color:'var(--red)',fontWeight:600,cursor:'pointer',fontSize:'.76rem',fontFamily:"'DM Sans',sans-serif"}}><i className="fi fi-rr-square"/> Desactivar todas</button>
        </div>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Nombre</th><th>Dirección</th><th>Límite pólvora</th><th>Geo</th><th>Pedidos auto</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          {casetas.map(c=>(
            <tr key={c.id}>
              <td style={{fontWeight:600}}>{c.nombre}</td>
              <td style={{color:'var(--tx2)'}}>{c.direccion||<span style={{opacity:.4}}>—</span>}</td>
              <td style={{color:'var(--gold)',fontWeight:700}}>{c.limite_kg_polvora||10} kg</td>
              <td>
                {c.geo_activo
                  ?<span style={{color:'var(--green)',fontSize:'.78rem',fontWeight:700}}><i className="fi fi-rr-map-marker"/> {c.radio_metros||150}m</span>
                  :<span style={{color:'var(--tx2)',fontSize:'.78rem',opacity:.5}}>—</span>}
              </td>
              <td>
                {c.pedidos_auto_activos
                  ?<span style={{color:'var(--green)',fontSize:'.78rem',fontWeight:700}}><i className="fi fi-rr-settings"/> {c.hora_corte_pedidos?.slice(0,5)||'20:00'}</span>
                  :<span style={{color:'var(--tx2)',fontSize:'.78rem',opacity:.5}}>—</span>}
              </td>
              <td><span className={`chip ${c.activo!==false?'cg':'cr'}`}>{c.activo!==false?'Activa':'Inactiva'}</span></td>
              <td><div className="acell">
                <button className="btn-edit" onClick={()=>{setEditId(c.id);setForm({nombre:c.nombre,prefijo:c.prefijo||'',direccion:c.direccion||'',limite_kg_polvora:String(c.limite_kg_polvora||10),latitud:c.latitud?String(c.latitud):'',longitud:c.longitud?String(c.longitud):'',radio_metros:String(c.radio_metros||150),geo_activo:c.geo_activo||false,pedidos_auto_activos:c.pedidos_auto_activos||false,hora_corte_pedidos:c.hora_corte_pedidos?.slice(0,5)||'20:00'})}}>Editar</button>
                <button className="btn-tog" style={{color:c.activo!==false?'var(--gold)':'var(--green)'}} onClick={()=>toggleActiva(c)}>{c.activo!==false?'Desactivar':'Activar'}</button>
                <button className="btn-del" onClick={()=>eliminar(c.id)}>Eliminar</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  )
}

// ─── GESTIÓN USUARIOS ─────────────────────────────────────────
export function GestionUsuarios({ casetas, soloEmpleados = false }) {
  const [perfiles,setPerfiles]=useState([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [toast,setToast]=useState(null)
  const [editId,setEditId]=useState(null)
  const [busq,setBusq]=useState('')
  const [rolFiltro,setRolFiltro]=useState('')
  const [casetaFiltro,setCasetaFiltro]=useState('')
  const F0={nombre:'',email:'',password:'',rol:'EMPLEADO',caseta_id:''}
  const [showPass, setShowPass] = useState(false)
  const PASS_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
  const passValida = (p) => !p || PASS_REGEX.test(p)
  const passReqs = (p) => {
    if (!p) return null
    const reqs = []
    if (p.length < 8) reqs.push('mínimo 8 caracteres')
    if (!/[A-Z]/.test(p)) reqs.push('una mayúscula')
    if (!/[a-z]/.test(p)) reqs.push('una minúscula')
    if (!/\d/.test(p)) reqs.push('un número')
    return reqs
  }
  const [form,setForm]=useState(F0)
  const [msg,setMsg]=useState(null)
  const showToast=(txt,type='ok')=>{ setToast({msg:txt,type}); setTimeout(()=>setToast(null),3000) }
  const showMsg=(txt,ok=true)=>{ setMsg({txt,ok}); setTimeout(()=>setMsg(null),4000) }
  useEffect(()=>{ getPerfiles().then(setPerfiles).finally(()=>setLoading(false)) },[])

  const guardar=async()=>{
    if(!form.nombre.trim()){showMsg('Nombre obligatorio',false);return}
    if(!editId&&!form.email.trim()){showMsg('Email obligatorio',false);return}
    if(!editId&&!form.password.trim()){showMsg('Contraseña obligatoria',false);return}
    if(form.password.trim()&&!passValida(form.password.trim())){showMsg('Contraseña débil: necesita 8+ caracteres, mayúscula, minúscula y número',false);return}
    if(soloEmpleados&&form.rol!=='EMPLEADO'){showMsg('Solo puedes crear empleados',false);return}
    if((form.rol==='EMPLEADO')&&!form.caseta_id){showMsg('Asigna una caseta al empleado',false);return}
    setSaving(true)
    try{
      if(editId){
        const cambios={nombre:form.nombre,rol:form.rol,caseta_id:form.caseta_id||null}
        await updatePerfil(editId,cambios)
        // Actualizar email/contraseña si se han rellenado
        if(form.email?.trim()||form.password?.trim()){
          if(form.password?.trim()&&form.password.trim().length<6){
            showMsg('La contraseña debe tener al menos 6 caracteres',false); setSaving(false); return
          }
          await actualizarCredenciales(editId,{email:form.email?.trim()||null,password:form.password?.trim()||null})
        }
        setPerfiles(prev=>prev.map(p=>p.id===editId?{...p,...cambios,casetas:casetas.find(c=>c.id===form.caseta_id)}:p))
        showMsg('Usuario actualizado ✓')
      }else{
        const nuevo=await crearUsuario(form)
        setPerfiles(prev=>[...prev,{...nuevo,activo:true,casetas:casetas.find(c=>c.id===nuevo.caseta_id)}])
        showMsg('Usuario creado ✓')
      }
      setForm(F0);setEditId(null)
    }catch(e){showMsg(e.message,false)}finally{setSaving(false)}
  }
  const toggleActivo=async(id,activo)=>{ await updatePerfil(id,{activo:!activo}); setPerfiles(prev=>prev.map(p=>p.id===id?{...p,activo:!activo}:p)); showToast(activo?'Desactivado':'Activado') }
  const toggleEncargado=async(id,val)=>{ try{ await updatePerfil(id,{es_encargado:!val}); setPerfiles(prev=>prev.map(p=>p.id===id?{...p,es_encargado:!val}:p)); showToast(val?'Ya no es encargado':'Ahora es encargado (puede borrar tickets y ajustar stock)') }catch(e){ showMsg(e.message,false) } }
  const editar=p=>{ setForm({nombre:p.nombre,email:'',password:'',rol:p.rol,caseta_id:p.caseta_id||''}); setEditId(p.id) }
  const eliminar=async(p)=>{
    if(!window.confirm(`¿Eliminar permanentemente a ${p.nombre}? Esta acción no se puede deshacer.`)) return
    try{ await eliminarPerfil(p.id); setPerfiles(prev=>prev.filter(u=>u.id!==p.id)); showToast('Empleado eliminado') }
    catch(e){ showMsg(e.message,false) }
  }
  const ordenRol = { ADMIN:0, RRHH:1, EMPLEADO:2 }
  const perfilesMostrados = (soloEmpleados ? perfiles.filter(p => p.rol === 'EMPLEADO') : perfiles)
    .filter(p => !rolFiltro || p.rol === rolFiltro)
    .filter(p => !casetaFiltro || p.caseta_id === casetaFiltro)
    .filter(p => !busq || p.nombre.toLowerCase().includes(busq.toLowerCase()))
    .sort((a,b) => (ordenRol[a.rol]??9) - (ordenRol[b.rol]??9) || a.nombre.localeCompare(b.nombre,'es'))
  if(loading) return <div className="loading-row"><div className="spin-sm"/>Cargando...</div>

  return(
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div className="stit">{editId?<><i className="fi fi-rr-pencil"/> Editar Usuario</>:<><i className="fi fi-rr-plus"/> Nuevo Usuario</>}</div>
      {msg&&<div className={msg.ok?'ok-box':'err-box'}>{msg.txt}</div>}
      <div className="iform">
        <div className="frow">
          <div className="fg"><label>Nombre completo</label><input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="María García"/></div>
          {/* Email: obligatorio al crear, opcional al editar */}
          {!editId
            ? <div className="fg"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="maria@caballer.es"/></div>
            : <div className="fg"><label>Nuevo email <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— dejar vacío para no cambiar</span></label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="Nuevo email..."/></div>
          }
          {/* Contraseña: obligatoria al crear, opcional al editar */}
          {!editId
            ? <div className="fg">
                <label>Contraseña</label>
                <div style={{position:'relative'}}>
                  <input type={showPass?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Mín. 8 car., mayúscula, minúscula y número" style={{paddingRight:38}}/>
                  <button type="button" className="btn-eye" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--tx2)',fontSize:'1rem'}}>{showPass?<i className="fi fi-rr-eye-crossed"/>:<i className="fi fi-rr-eye"/>}</button>
                </div>
              </div>
            : <div className="fg">
                <label>Nueva contraseña <span style={{fontSize:'.72rem',color:'var(--tx2)'}}>— dejar vacío para no cambiar</span></label>
                <div style={{position:'relative'}}>
                  <input type={showPass?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Nueva contraseña..." style={{paddingRight:38}}/>
                  <button type="button" className="btn-eye" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--tx2)',fontSize:'1rem'}}>{showPass?<i className="fi fi-rr-eye-crossed"/>:<i className="fi fi-rr-eye"/>}</button>
                </div>
              </div>
          }
          {!soloEmpleados&&<div className="fg"><label>Rol</label><select value={form.rol} onChange={e=>setForm({...form,rol:e.target.value,caseta_id:(e.target.value==='ADMIN'||e.target.value==='RRHH')?'':form.caseta_id})}><option value="EMPLEADO">Empleado</option><option value="ADMIN">Administrador</option><option value="RRHH">Recursos Humanos</option></select></div>}
          {form.rol==='EMPLEADO'&&<div className="fg"><label>Caseta asignada</label><select value={form.caseta_id} onChange={e=>setForm({...form,caseta_id:e.target.value})}><option value="">-- Seleccionar --</option>{casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>}
        </div>
        <div style={{display:'flex',gap:9}}><button className="btn-add" onClick={guardar} disabled={saving}>{saving?'Guardando...':editId?'Guardar cambios':'Crear usuario'}</button>{editId&&<button className="btn-s" style={{width:'auto',marginTop:0}} onClick={()=>{setEditId(null);setForm(F0);setMsg(null)}}>Cancelar</button>}</div>
      </div>
      <div className="stit" style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span>{soloEmpleados?'Empleados':'Usuarios'} ({perfilesMostrados.length})</span>
        <input className="si" style={{maxWidth:220,marginBottom:0}} placeholder="Buscar por nombre..." value={busq} onChange={e=>setBusq(e.target.value)}/>
        {!soloEmpleados&&(
          <select value={rolFiltro} onChange={e=>setRolFiltro(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'7px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem'}}>
            <option value="">Todos los roles</option>
            <option value="ADMIN">Administradores</option>
            <option value="EMPLEADO">Empleados</option>
            <option value="RRHH">Recursos Humanos</option>
          </select>
        )}
        <select value={casetaFiltro} onChange={e=>setCasetaFiltro(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'7px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif",fontSize:'.82rem'}}>
          <option value="">Todas las casetas</option>
          {casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Nombre</th>{!soloEmpleados&&<th>Rol</th>}<th>Caseta</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
          {perfilesMostrados.map(p=>(
            <tr key={p.id} style={{opacity:p.activo?1:.5}}>
              <td style={{fontWeight:600}}>{p.nombre}</td>
              {!soloEmpleados&&<td><span className={`chip ${p.rol==='ADMIN'?'cy':'cb2'}`}>{p.rol}</span></td>}
              <td style={{color:'var(--tx2)'}}>{p.casetas?.nombre||'— Global —'}</td>
              <td><span className={`chip ${p.activo?'cg':'cr'}`}>{p.activo?'Activo':'Inactivo'}</span></td>
              <td><div className="acell">
                <button className="btn-edit" onClick={()=>editar(p)}>Editar</button>
                {p.rol==='EMPLEADO'&&(
                  <button className="btn-tog" style={{color:p.es_encargado?'var(--green)':'var(--tx2)'}} title="Encargado: puede borrar tickets y ajustar stock" onClick={()=>toggleEncargado(p.id,p.es_encargado)}>
                    <i className="fi fi-rr-shield-check"/> {p.es_encargado?'Encargado':'Encargado: No'}
                  </button>
                )}
                <button className="btn-tog" style={{color:p.activo?'var(--gold)':'var(--green)'}} onClick={()=>toggleActivo(p.id,p.activo)}>{p.activo?'Desact.':'Activar'}</button>
                <button className="btn-del" onClick={()=>eliminar(p)}>Eliminar</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  )
}

// ─── ADMIN PANEL (raíz) ───────────────────────────────────────

// ─── PANEL FICHAJES (ADMIN) ───────────────────────────────────
export function PanelFichajes({ casetas, adminId }) {
  const hoy = new Date()
  // Por defecto: desde el lunes de esta semana hasta hoy
  const _lunes = new Date(hoy); _lunes.setDate(hoy.getDate() - ((hoy.getDay()+6)%7)); _lunes.setHours(0,0,0,0)
  const [desde, setDesde]         = useState(_lunes.toISOString().slice(0,10))
  const [hasta, setHasta]         = useState(hoy.toISOString().slice(0,10))
  const [casetaSel, setCasetaSel] = useState('')
  const [empleadoSel, setEmpleadoSel] = useState('')
  const [fichajes, setFichajes]   = useState([])
  const [perfiles, setPerfiles]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [editando, setEditando]   = useState(null) // fichaje en edición
  const [editTs, setEditTs]       = useState('')
  const [editNota, setEditNota]   = useState('')
  const [toast, setToast]         = useState(null)
  const [vistaAgrup, setVistaAgrup] = useState(true) // true=por empleado, false=lista cruda
  const showToast = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),2500) }

  // Cargar perfiles para el filtro
  useEffect(() => {
    getPerfiles().then(setPerfiles).catch(()=>{})
  }, [])

  const [errorBusq, setErrorBusq] = useState(null)

  // buscar acepta parámetros explícitos para evitar problemas de closure
  const buscar = (d=desde, h=hasta, cas=casetaSel, emp=empleadoSel) => {
    setLoading(true)
    setErrorBusq(null)
    // La api ya compensa timezone (+/-3h). Aquí pasamos el día en formato local.
    getFichajesAdmin(d+'T00:00:00', h+'T23:59:59', cas||null, emp||null)
      .then(data => {
        // Filtrar en cliente con hora local para excluir excedentes del margen
        const desdeLocal = new Date(d+'T00:00:00')
        const hastaLocal = new Date(h+'T23:59:59')
        setFichajes(data.filter(f => {
          const ts = new Date(f.timestamp)
          return ts >= desdeLocal && ts <= hastaLocal
        }))
      })
      .catch(e => { setErrorBusq(e.message); setFichajes([]) })
      .finally(()=>setLoading(false))
  }
  // Cargar al montar pasando los valores iniciales directamente (evita problema de closure)
  useEffect(()=>{
    buscar(_lunes.toISOString().slice(0,10), hoy.toISOString().slice(0,10), '', '')
  },[])

  const abrirEdicion = f => {
    setEditando(f)
    // Formatear timestamp para input datetime-local
    const d = new Date(f.timestamp)
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16)
    setEditTs(local)
    setEditNota(f.notas||'')
  }

  const guardarEdicion = async () => {
    try {
      await editarFichaje(editando.id, adminId, new Date(editTs).toISOString(), editNota)
      setFichajes(prev=>prev.map(f=>f.id===editando.id?{...f,timestamp:new Date(editTs).toISOString(),notas:editNota,editado:true}:f))
      setEditando(null); showToast('Fichaje editado ✓')
    } catch(e) { showToast('Error: '+e.message,'error') }
  }

  const eliminar = async f => {
    if(!window.confirm('¿Eliminar este fichaje?')) return
    try {
      await deleteFichaje(f.id)
      setFichajes(prev=>prev.filter(x=>x.id!==f.id)); showToast('Eliminado')
    } catch(e) { showToast(e.message,'error') }
  }

  // Agrupar fichajes por empleado y calcular turnos
  const porEmpleado = {}
  fichajes.forEach(f=>{
    const id = f.empleado_id
    if(!porEmpleado[id]) porEmpleado[id] = { nombre: f.perfiles?.nombre||'?', caseta: f.casetas?.nombre||'?', fichajes:[] }
    porEmpleado[id].fichajes.push(f)
  })
  const ahora = Date.now()
  Object.values(porEmpleado).forEach(emp=>{
    emp.fichajes.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp))
    emp.turnos = calcularTurnos(emp.fichajes)
    emp.totalMins = emp.turnos.filter(t=>!t.enCurso).reduce((s,t)=>s+t.minutosTrabajados,0)
    emp.totalDescanso = emp.turnos.filter(t=>!t.enCurso).reduce((s,t)=>s+t.minutosDescanso,0)
    // Solo marcar como "en curso" si la entrada fue hace menos de 16 horas
    // Evita que fichajes sin salida de días anteriores aparezcan como activos
    const tc = emp.turnos.find(t=>t.enCurso)
    emp.turnoEnCurso = tc && (ahora - new Date(tc.entrada.timestamp)) < 16*60*60*1000 ? tc : null
  })

  const totalMinsGlobal = Object.values(porEmpleado).reduce((s,e)=>s+e.totalMins,0)
  const totalDescGlobal = Object.values(porEmpleado).reduce((s,e)=>s+(e.turnos||[]).filter(t=>!t.enCurso).reduce((x,t)=>x+t.minutosDescanso,0),0)

  const fmtTs = ts => new Date(ts).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})

  return (
    <>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}

      {/* Filtros */}
      <div style={{display:'flex',gap:10,alignItems:'flex-end',marginBottom:16,flexWrap:'wrap'}}>
        <div className="fg" style={{margin:0}}><label>Desde</label>
          <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}/></div>
        <div className="fg" style={{margin:0}}><label>Hasta</label>
          <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}/></div>
        <div className="fg" style={{margin:0}}><label>Caseta</label>
          <select value={casetaSel} onChange={e=>setCasetaSel(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>
            <option value="">Todas</option>{casetas.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></div>
        <div className="fg" style={{margin:0}}><label>Empleado</label>
          <select value={empleadoSel} onChange={e=>setEmpleadoSel(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'8px 10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}>
            <option value="">Todos</option>{perfiles.filter(p=>p.rol==='EMPLEADO').map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></div>
        <button className="btn-add" onClick={()=>buscar(desde,hasta,casetaSel,empleadoSel)} style={{height:38}}>Buscar</button>
        {/* Toggle vista */}
        <div style={{display:'flex',gap:0,background:'var(--s2)',borderRadius:'var(--rs)',padding:3,marginLeft:'auto'}}>
          <button onClick={()=>setVistaAgrup(true)} style={{padding:'6px 12px',borderRadius:'var(--rs)',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.76rem',background:vistaAgrup?'var(--ac)':'transparent',color:vistaAgrup?'white':'var(--tx2)'}}>Por empleado</button>
          <button onClick={()=>setVistaAgrup(false)} style={{padding:'6px 12px',borderRadius:'var(--rs)',border:'none',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontWeight:600,fontSize:'.76rem',background:!vistaAgrup?'var(--ac)':'transparent',color:!vistaAgrup?'white':'var(--tx2)'}}>Lista fichajes</button>
        </div>
      </div>

      {/* Resumen global */}
      {!loading&&fichajes.length>0&&(
        <div className="ag" style={{marginBottom:20}}>
          <div className="sc"><div className="sv">{Object.keys(porEmpleado).length}</div><div className="sl2">Empleados</div></div>
          <div className="sc"><div className="sv">{fmtDuracion(totalMinsGlobal)}</div><div className="sl2">Horas trabajadas</div></div>
          <div className="sc"><div className="sv" style={{color:'var(--gold)'}}>{fmtDuracion(totalDescGlobal)}</div><div className="sl2">En descanso</div></div>
          <div className="sc"><div className="sv">{calcularTurnos(fichajes.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp))).filter(t=>!t.enCurso).length}</div><div className="sl2">Turnos completados</div></div>
          <div className="sc"><div className="sv" style={{color:'var(--green)'}}>{Object.values(porEmpleado).filter(e=>e.turnoEnCurso).length}</div><div className="sl2">Ahora trabajando</div></div>
        </div>
      )}

      {loading?<div className="loading-row"><div className="spin-sm"/>Cargando...</div>:(
        vistaAgrup ? (
          /* ── VISTA POR EMPLEADO ── */
          Object.entries(porEmpleado).length===0
            ? <div style={{textAlign:'center',color:'var(--tx2)',padding:40}}>Sin fichajes en este período</div>
            : Object.entries(porEmpleado).map(([empId,emp])=>(
            <div key={empId} style={{background:'var(--s2)',borderRadius:'var(--r)',padding:'14px 16px',marginBottom:14,border:'1px solid var(--bd)'}}>
              {/* Cabecera empleado — layout fijo en dos líneas */}
              <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:12}}>
                <div style={{flex:1,minWidth:0}}>
                  {/* Línea 1: nombre + caseta + dot estado */}
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'nowrap',overflow:'hidden'}}>
                    <span style={{fontWeight:700,fontSize:'1rem',whiteSpace:'nowrap'}}>{emp.nombre}</span>
                    <span style={{color:'var(--tx2)',fontSize:'.78rem',whiteSpace:'nowrap'}}>{emp.caseta}</span>
                    {emp.turnoEnCurso&&(
                      <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,display:'inline-block',
                        background:emp.turnoEnCurso.enDescanso?'var(--gold)':'var(--green)',
                        animation:'pulse 1.5s ease-in-out infinite'}}/>
                    )}
                  </div>
                  {/* Línea 2: badge de estado — siempre debajo */}
                  {emp.turnoEnCurso&&(
                    <div style={{marginTop:4}}>
                      {emp.turnoEnCurso.enDescanso
                        ?<span style={{background:'rgba(var(--gold-rgb),.15)',color:'var(--gold)',padding:'2px 9px',borderRadius:10,fontSize:'.7rem',fontWeight:700}}><i className="fi fi-rr-mug-hot"/> En descanso</span>
                        :<span style={{background:'rgba(var(--green-rgb),.15)',color:'var(--green)',padding:'2px 9px',borderRadius:10,fontSize:'.7rem',fontWeight:700}}>● Trabajando ahora</span>
                      }
                    </div>
                  )}
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.6rem',color:'var(--ac)',lineHeight:1}}>{fmtDuracion(emp.totalMins)}</div>
                  <div style={{fontSize:'.7rem',color:'var(--tx2)'}}>{emp.turnos.filter(t=>!t.enCurso).length} turnos</div>
                  {emp.totalDescanso>0&&<div style={{fontSize:'.7rem',color:'var(--gold)'}}><i className="fi fi-rr-mug-hot"/> {fmtDuracion(emp.totalDescanso)} descanso</div>}
                </div>
              </div>
              {/* Tabla de turnos */}
              <div className="tw" style={{marginBottom:0}}>
                <table>
                  <thead><tr><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Trabajado</th><th>Descanso</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {emp.turnos.slice().reverse().map((t,i)=>(
                      <tr key={i} style={{background:t.enCurso?'rgba(var(--green-rgb),.05)':t.enDescanso?'rgba(var(--gold-rgb),.05)':'transparent'}}>
                        <td style={{fontSize:'.8rem',color:'var(--tx2)'}}>{new Date(t.entrada.timestamp).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}</td>
                        <td>
                          <span style={{fontWeight:700,color:'var(--green)'}}>{new Date(t.entrada.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                          {t.entrada.editado&&<span style={{marginLeft:4,fontSize:'.65rem',color:'var(--gold)'}}><i className="fi fi-rr-pencil"/></span>}
                          {t.entrada.geo_ok===false&&<span title="Fichó fuera de la zona permitida" style={{marginLeft:4,fontSize:'.75rem',color:'var(--red)'}}><i className="fi fi-rr-map-marker"/><i className="fi fi-rr-triangle-warning"/></span>}
                          {t.entrada.geo_ok===true&&<span title="Ubicación verificada" style={{marginLeft:4,fontSize:'.75rem',color:'var(--green)',opacity:.6}}><i className="fi fi-rr-map-marker"/></span>}
                          {t.entrada.notas&&<div style={{fontSize:'.68rem',color:'var(--tx2)',fontStyle:'italic'}}>{t.entrada.notas}</div>}
                        </td>
                        <td>
                          {t.salida?(
                            <><span style={{fontWeight:700,color:'var(--red)'}}>{new Date(t.salida.timestamp).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>
                            {t.salida.notas&&<div style={{fontSize:'.68rem',color:'var(--tx2)',fontStyle:'italic'}}>{t.salida.notas}</div>}</>
                          ):<span style={{color:t.enDescanso?'var(--gold)':'var(--green)',fontSize:'.75rem',fontWeight:700}}>{t.enDescanso?<><i className="fi fi-rr-mug-hot"/> Descanso</>:'En curso'}</span>}
                        </td>
                        <td style={{fontWeight:700,color:t.enCurso?'var(--green)':'var(--ac)'}}>{fmtDuracion(t.minutosTrabajados)}</td>
                        <td style={{color:t.minutosDescanso>0?'var(--gold)':'var(--tx2)',fontSize:'.82rem'}}>
                          {t.minutosDescanso>0?<><i className="fi fi-rr-mug-hot"/> {fmtDuracion(t.minutosDescanso)}</>:<span style={{opacity:.4}}>—</span>}
                        </td>
                        <td><div className="acell">
                          <button className="btn-edit" onClick={()=>abrirEdicion(t.entrada)}><i className="fi fi-rr-pencil"/> Ent.</button>
                          {t.salida&&<button className="btn-edit" onClick={()=>abrirEdicion(t.salida)}><i className="fi fi-rr-pencil"/> Sal.</button>}
                          <button className="btn-del" onClick={()=>eliminar(t.entrada)}><i className="fi fi-rr-cross"/></button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          /* ── VISTA LISTA CRUDA ── */
          <div className="tw"><table>
            <thead><tr><th>Empleado</th><th>Caseta</th><th>Tipo</th><th>Fecha y hora</th><th>Notas</th><th>Acciones</th></tr></thead>
            <tbody>
              {fichajes.length===0?<tr><td colSpan={6} style={{textAlign:'center',color:'var(--tx2)',padding:20}}>Sin fichajes</td></tr>
                :fichajes.map(f=>(
                <tr key={f.id}>
                  <td style={{fontWeight:600}}>{f.perfiles?.nombre}</td>
                  <td style={{color:'var(--tx2)',fontSize:'.8rem'}}>{f.casetas?.nombre}</td>
                  <td>
                    <span style={{fontWeight:700,color:f.tipo==='ENTRADA'?'var(--green)':f.tipo==='SALIDA'?'var(--red)':f.tipo==='INICIO_DESCANSO'?'var(--gold)':'var(--blue)',background:f.tipo==='ENTRADA'?'rgba(var(--green-rgb),.1)':f.tipo==='SALIDA'?'rgba(var(--red-rgb),.1)':'rgba(var(--gold-rgb),.1)',padding:'2px 8px',borderRadius:10,fontSize:'.72rem'}}>{f.tipo.replace('_',' ')}</span>
                    {f.geo_ok===true&&<span title="Ubicación verificada" style={{marginLeft:4,fontSize:'.75rem',color:'var(--green)'}}><i className="fi fi-rr-map-marker"/></span>}
                    {f.geo_ok===false&&<span title="Fichaje fuera de zona" style={{marginLeft:4,fontSize:'.75rem',color:'var(--red)'}}><i className="fi fi-rr-map-marker"/><i className="fi fi-rr-triangle-warning"/></span>}
                  </td>
                  <td style={{fontSize:'.82rem'}}>{fmtTs(f.timestamp)}{f.editado&&<span style={{marginLeft:4,fontSize:'.65rem',color:'var(--gold)'}}><i className="fi fi-rr-pencil"/></span>}</td>
                  <td style={{color:'var(--tx2)',fontSize:'.78rem',fontStyle:'italic'}}>{f.notas||'—'}</td>
                  <td><div className="acell">
                    <button className="btn-edit" onClick={()=>abrirEdicion(f)}>Editar</button>
                    <button className="btn-del" onClick={()=>eliminar(f)}><i className="fi fi-rr-cross"/></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )
      )}

      {/* Modal edición fichaje */}
      {editando&&(
        <div className="mo">
          <div className="mc">
            <ModalClose onClose={() => setEditando(null)} />
            <div className="mt-modal"><i className="fi fi-rr-pencil"/> Editar Fichaje</div>
            <div style={{fontSize:'.8rem',color:'var(--tx2)',marginBottom:16}}>
              <strong>{fichajes.find(f=>f.id===editando.id)?.perfiles?.nombre||editando.perfiles?.nombre}</strong> · {editando.tipo}
            </div>
            <div className="fg">
              <label>Fecha y hora</label>
              <input type="datetime-local" value={editTs} onChange={e=>setEditTs(e.target.value)}
                style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif",fontSize:'.9rem'}}/>
            </div>
            <div className="fg">
              <label>Nota (opcional)</label>
              <input value={editNota} onChange={e=>setEditNota(e.target.value)} placeholder="Ej: ajuste manual, error de fichaje..."
                style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'var(--rs)',padding:'10px',color:'var(--tx)',fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <button className="btn-p" onClick={guardarEdicion}>✓ Guardar</button>
            <button className="btn-s" onClick={()=>setEditando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── GESTIÓN ALERTAS TELEGRAM ────────────────────────────────
const ALERTA_LABELS = {
  caja_cerrada_descuadre: { icon: <i className="fi fi-rr-coins"/>,           label: 'Caja cerrada con descuadre' },
  retirada_caja:          { icon: <i className="fi fi-rr-receipt"/>,           label: 'Retirada de efectivo en caja' },
  fichaje:                { icon: <i className="fi fi-rr-clock"/>,            label: 'Fichaje / Apertura de caja' },
  incidencia_pedido:      { icon: <i className="fi fi-rr-exclamation"/>,       label: 'Incidencia en pedido' },
  incidencia_ticket:      { icon: <i className="fi fi-rr-note"/>,             label: 'Incidencia en ticket de venta' },
  inventario_enviado:     { icon: <i className="fi fi-rr-clipboard-list"/>,   label: 'Inventario confirmado' },
  limite_polvora:         { icon: <i className="fi fi-rr-flame"/>,            label: 'Límite de pólvora cerca' },
  nuevo_pedido:           { icon: <i className="fi fi-rr-box"/>,              label: 'Nuevo pedido enviado' },
  login_usuario:          { icon: <i className="fi fi-rr-key"/>,              label: 'Login de usuario' },
  pedido_recibido:        { icon: <i className="fi fi-rr-check"/>,            label: 'Pedido recibido' },
  stock_agotado:          { icon: <i className="fi fi-rr-cross-circle"/>,     label: 'Producto agotado' },
  stock_bajo:             { icon: <i className="fi fi-rr-triangle-warning"/>, label: 'Stock bajo en producto' },
  devolucion:             { icon: <i className="fi fi-rr-undo"/>,             label: 'Devolución o compensación' },
  baja_producto:          { icon: <i className="fi fi-rr-box-open"/>,         label: 'Baja / rotura de producto' },
}

const ALERTA_GRUPOS = [
  { icon: 'fi-rr-briefcase', titulo: 'Caja & Fichajes',     tipos: ['caja_cerrada_descuadre', 'retirada_caja', 'fichaje'] },
  { icon: 'fi-rr-truck-side',titulo: 'Pedidos',             tipos: ['nuevo_pedido', 'pedido_recibido', 'incidencia_pedido'] },
  { icon: 'fi-rr-note',      titulo: 'Tickets, Devoluciones & Inventario', tipos: ['incidencia_ticket', 'devolucion', 'baja_producto', 'inventario_enviado'] },
  { icon: 'fi-rr-chart-histogram', titulo: 'Stock & Pólvora', tipos: ['stock_bajo', 'stock_agotado', 'limite_polvora'] },
  { icon: 'fi-rr-user',      titulo: 'Usuarios',            tipos: ['login_usuario'] },
]

function AlertaToggle({ activa, saving, onChange }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
      <span style={{fontSize:'.78rem',color: activa ? 'var(--green)' : 'var(--tx2)', fontWeight:600, minWidth:70, textAlign:'right'}}>
        {saving ? '…' : (activa ? 'Activada' : 'Desactivada')}
      </span>
      <div onClick={onChange} style={{
        width:38,height:20,borderRadius:10,cursor:'pointer',flexShrink:0,
        background: activa ? 'var(--green)' : 'var(--s3)',
        position:'relative',transition:'background .2s',
      }}>
        <div style={{
          position:'absolute',top:2,
          left: activa ? 20 : 2,
          width:16,height:16,borderRadius:'50%',
          background:'white',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.4)',
        }}/>
      </div>
    </div>
  )
}

function GestionAlertas() {
  const [alertas,     setAlertas]     = useState([])
  const [saving,      setSaving]      = useState({})
  const [savingAll,   setSavingAll]   = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    getAlertasConfig().then(d => { setAlertas(d); setLoading(false) })
  }, [])

  async function guardar(tipo, cambios) {
    setSaving(s => ({ ...s, [tipo]: true }))
    try {
      await updateAlertaConfig(tipo, cambios)
      setAlertas(prev => prev.map(a => a.tipo === tipo ? { ...a, ...cambios } : a))
    } finally {
      setSaving(s => ({ ...s, [tipo]: false }))
    }
  }

  async function toggleTodas(activa) {
    setSavingAll(true)
    try {
      await Promise.all(alertas.map(a => updateAlertaConfig(a.tipo, { activa })))
      setAlertas(prev => prev.map(a => ({ ...a, activa })))
    } finally {
      setSavingAll(false)
    }
  }

  if (loading) return <div style={{padding:32,textAlign:'center',color:'var(--tx2)'}}>Cargando…</div>

  const totalActivas   = alertas.filter(a => a.activa).length
  const todasActivas   = totalActivas === alertas.length
  const todasInactivas = totalActivas === 0
  const mapaAlertas    = Object.fromEntries(alertas.map(a => [a.tipo, a]))

  return (
    <div style={{maxWidth:720,margin:'0 auto'}}>

      {/* ── Cabecera ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:6}}>
        <div>
          <div className="stit" style={{marginBottom:4}}><i className="fi fi-rr-bell"/> Alertas Telegram</div>
          <div style={{fontSize:'.82rem',color:'var(--tx2)'}}>
            Configura qué eventos envían un mensaje al administrador por Telegram.
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span className="chip" style={{
            background: totalActivas > 0 ? 'rgba(var(--green-rgb),.15)' : 'var(--s2)',
            color: totalActivas > 0 ? 'var(--green)' : 'var(--tx2)',
            border: `1px solid ${totalActivas > 0 ? 'rgba(var(--green-rgb),.3)' : 'var(--bd)'}`,
          }}>
            {totalActivas}/{alertas.length} activas
          </span>
          <button
            onClick={() => toggleTodas(true)}
            disabled={savingAll || todasActivas}
            className="btn-o"
            style={{padding:'6px 14px',fontSize:'.8rem',opacity: (savingAll || todasActivas) ? .45 : 1}}
          >
            {savingAll ? '…' : 'Activar todas'}
          </button>
          <button
            onClick={() => toggleTodas(false)}
            disabled={savingAll || todasInactivas}
            style={{
              padding:'6px 14px',borderRadius:'var(--rs)',border:'1px solid var(--bd)',
              background:'var(--s1)',color:'var(--tx)',fontSize:'.8rem',cursor: todasInactivas ? 'default' : 'pointer',
              opacity: (savingAll || todasInactivas) ? .45 : 1,
            }}
          >
            {savingAll ? '…' : 'Desactivar todas'}
          </button>
        </div>
      </div>

      {/* ── Grupos de alertas ── */}
      <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:20}}>
        {ALERTA_GRUPOS.map(grupo => {
          const items = grupo.tipos.map(t => mapaAlertas[t]).filter(Boolean)
          if (!items.length) return null
          const activasGrupo = items.filter(a => a.activa).length
          return (
            <div key={grupo.titulo} className="iform" style={{padding:0,overflow:'hidden'}}>
              {/* Cabecera grupo */}
              <div style={{
                display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'12px 16px',borderBottom:'1px solid var(--bd)',
                background:'var(--s1)',
              }}>
                <span style={{fontWeight:700,fontSize:'.88rem',display:'flex',alignItems:'center',gap:8}}><i className={`fi ${grupo.icon}`}/>{grupo.titulo}</span>
                <span style={{fontSize:'.75rem',color: activasGrupo > 0 ? 'var(--green)' : 'var(--tx2)'}}>
                  {activasGrupo}/{items.length} activas
                </span>
              </div>

              {/* Filas de alerta */}
              <div style={{display:'flex',flexDirection:'column'}}>
                {items.map((a, idx) => {
                  const meta  = ALERTA_LABELS[a.tipo] || { icon: <i className="fi fi-rr-bell"/>, label: a.tipo }
                  const esStock = a.tipo === 'stock_bajo' || a.tipo === 'stock_agotado'
                  return (
                    <div key={a.tipo} style={{
                      borderTop: idx > 0 ? '1px solid var(--bd)' : 'none',
                      padding:'12px 16px',
                      borderLeft: `3px solid ${a.activa ? 'var(--green)' : 'transparent'}`,
                      transition:'border-color .2s',
                    }}>
                      {/* Fila principal */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <span style={{fontSize:'1.1rem',lineHeight:1}}>{meta.icon}</span>
                          <span style={{fontWeight:600,fontSize:'.88rem'}}>{meta.label}</span>
                        </div>
                        <AlertaToggle
                          activa={a.activa}
                          saving={saving[a.tipo]}
                          onChange={() => guardar(a.tipo, { activa: !a.activa })}
                        />
                      </div>

                      {/* Opciones de repetición */}
                      {a.activa && (
                        <div style={{
                          marginTop:10,paddingTop:10,borderTop:'1px solid var(--bd)',
                          display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',
                        }}>
                          <span style={{fontSize:'.75rem',color:'var(--tx2)'}}>Repetición:</span>
                          <div style={{display:'flex',background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:8,padding:2,gap:2}}>
                            {[['una_vez','Una vez'],['repetir','Con cooldown']].map(([val,lbl])=>(
                              <button key={val}
                                onClick={() => guardar(a.tipo, { modo_repeticion: val })}
                                style={{
                                  padding:'4px 12px',borderRadius:6,border:'none',cursor:'pointer',
                                  fontSize:'.74rem',fontWeight:600,fontFamily:"'DM Sans',sans-serif",
                                  background: a.modo_repeticion === val ? 'var(--ac)' : 'transparent',
                                  color: a.modo_repeticion === val ? 'white' : 'var(--tx2)',
                                  transition:'all .15s',
                                }}
                              >{lbl}</button>
                            ))}
                          </div>

                          {a.modo_repeticion === 'repetir' && (
                            <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:4}}>
                              <span style={{fontSize:'.76rem',color:'var(--tx2)'}}>Cooldown:</span>
                              <input
                                type="number" min={1} max={1440}
                                defaultValue={a.cooldown_minutos}
                                onBlur={e => {
                                  const val = parseInt(e.target.value, 10)
                                  if (!isNaN(val) && val > 0) guardar(a.tipo, { cooldown_minutos: val })
                                }}
                                style={{
                                  width:52,padding:'3px 6px',borderRadius:6,border:'1px solid var(--bd)',
                                  background:'var(--s2)',color:'var(--tx)',fontSize:'.76rem',textAlign:'center',
                                }}
                              />
                              <span style={{fontSize:'.76rem',color:'var(--tx2)'}}>min</span>
                            </div>
                          )}

                          {esStock && a.modo_repeticion === 'una_vez' && (
                            <span style={{fontSize:'.73rem',color:'var(--tx2)',fontStyle:'italic'}}>
                              <i className="fi fi-rr-info"/> Una vez por producto hasta que el stock se recupere
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminPanel({ perfil, casetas: casetasInit, onModoVenta }) {
  // Persistir tab activo — sobrevive a cambios de página
  const [tab,setTab]=useState(()=>sessionStorage.getItem('admin_tab')||'dashboard')
  const [casetas,setCasetas]=useState(casetasInit)
  const [ticketFiltro,setTicketFiltro]=useState(null)
  const [pedidosPend,setPedidosPend]=useState(0)
  const [showAdminMenu,setShowAdminMenu]=useState(false)
  const [showVentaPicker,setShowVentaPicker]=useState(false)

  // Contar pedidos pendientes para badge
  useEffect(()=>{
    getPedidos({}).then(peds=>{
      setPedidosPend(peds.filter(p=>p.estado==='PENDIENTE').length)
    }).catch(()=>{})
  },[])

  const cambiarTab=(k)=>{ setTab(k); sessionStorage.setItem('admin_tab',k) }
  const irATickets=dia=>{ setTicketFiltro({desde:dia,hasta:dia}); cambiarTab('tickets') }

  return(
    <div className="app">
      <div className="topbar">
        <div className="tl"><Logo style={{ height: 28 }} /></div>
        <div className="ti">
          <span style={{fontSize:'.8rem',color:'var(--tx2)'}} className="hide-mobile">{perfil.nombre}</span>
          <span className="badge ba hide-mobile">Admin</span>
          {/* Tab activo en móvil */}
          <span className="admin-tab-label">{TABS.find(([k])=>k===tab)?.[2]}</span>
          {onModoVenta&&<button className="btn-add hide-mobile" style={{padding:'6px 12px',fontSize:'.78rem'}} onClick={()=>setShowVentaPicker(true)}>Modo venta</button>}
          <span className="hide-mobile"><ThemeToggle /></span>
          <button className="btn-o topbar-salir" onClick={()=>supabase.auth.signOut()}>Salir</button>
          <button className="hamburger-btn" onClick={()=>setShowAdminMenu(v=>!v)}>
            <i className={`fi ${showAdminMenu?'fi-rr-cross':'fi-rr-menu-burger'}`}/>
          </button>
        </div>
      </div>

      {/* Drawer lateral admin */}
      {showAdminMenu&&(
        <div onClick={()=>setShowAdminMenu(false)}
          style={{position:'fixed',inset:0,zIndex:299,background:'rgba(0,0,0,.55)'}}/>
      )}
      <div className={`side-drawer${showAdminMenu?' side-drawer--open':''}`}>
        <div className="drawer-header">
          <div>
            <Logo style={{ height: 26, marginBottom: 6 }} />
            <div className="drawer-user-row">
              <span className="drawer-user">{perfil.nombre}</span>
              <span className="badge ba">Admin</span>
            </div>
          </div>
          <button className="drawer-close" onClick={()=>setShowAdminMenu(false)}><i className="fi fi-rr-cross"/></button>
        </div>
        {TABS.map(([k,ic,l])=>(
          <button key={k} className={`hamburger-item${tab===k?' hamburger-item--active':''}`}
            style={{position:'relative'}}
            onClick={()=>{cambiarTab(k);setShowAdminMenu(false)}}>
            <i className={`fi ${ic}`}/>{' '}{l}
            {k==='pedidos'&&pedidosPend>0&&(
              <span style={{marginLeft:'auto',background:'var(--red)',color:'white',borderRadius:10,padding:'1px 7px',fontSize:'.65rem',fontWeight:700}}>
                {pedidosPend}
              </span>
            )}
          </button>
        ))}
        <div className="drawer-sep"/>
        {onModoVenta&&(
          <button className="hamburger-item" style={{color:'var(--green)'}}
            onClick={()=>{setShowAdminMenu(false);setShowVentaPicker(true)}}>
            <i className="fi fi-rr-shopping-cart"/> Modo venta
          </button>
        )}
        <ThemeToggle variant="item" />
        <button className="hamburger-item" style={{color:'var(--tx2)'}}
          onClick={()=>{setShowAdminMenu(false);supabase.auth.signOut()}}>
          <i className="fi fi-rr-sign-out-alt"/> Cerrar sesión
        </button>
      </div>

      {/* Picker de caseta para Modo venta (el admin es global, elige dónde vender) */}
      {showVentaPicker&&(
        <div className="mo">
          <div className="mc">
            <ModalClose onClose={() => setShowVentaPicker(false)} />
            <div className="mt-modal"><i className="fi fi-rr-shopping-cart"/> Modo venta</div>
            <div style={{fontSize:'.85rem',color:'var(--tx2)',marginBottom:14}}>Elige en qué caseta vas a vender:</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {casetas.map(c=>{
                const inactiva=c.activo===false
                return(
                <button key={c.id} className="btn-s" disabled={inactiva}
                  style={{marginTop:0,textAlign:'left',padding:'12px 14px',display:'flex',alignItems:'center',gap:10,opacity:inactiva?.5:1,cursor:inactiva?'not-allowed':'pointer'}}
                  title={inactiva?'Caseta desactivada — actívala en Casetas para vender':undefined}
                  onClick={()=>{ if(inactiva) return; setShowVentaPicker(false);onModoVenta(c.id) }}>
                  <i className="fi fi-rr-shop" style={{color:inactiva?'var(--tx2)':'var(--ac)'}}/>
                  <span style={{fontWeight:700,color:inactiva?'var(--tx2)':'var(--tx)'}}>{c.nombre}</span>
                  {inactiva&&<span className="chip cr" style={{marginLeft:'auto',fontSize:'.68rem'}}>Inactiva</span>}
                </button>
              )})}
              {casetas.length===0&&<div style={{color:'var(--tx2)',fontSize:'.85rem'}}>No hay casetas configuradas.</div>}
            </div>
            <button className="btn-s" onClick={()=>setShowVentaPicker(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <WheelScrollDiv className="navtabs admin-navtabs">
        {TABS.map(([k,ic,l])=>(
          <button key={k} className={`ntab ${tab===k?'on':''}`} onClick={()=>cambiarTab(k)}
            style={{position:'relative',flexShrink:0}}>
            <i className={`fi ${ic}`}/>{' '}{l}
            {k==='pedidos'&&pedidosPend>0&&(
              <span style={{position:'absolute',top:4,right:2,background:'var(--red)',color:'white',borderRadius:'50%',width:16,height:16,fontSize:'.6rem',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,lineHeight:1}}>
                {pedidosPend}
              </span>
            )}
          </button>
        ))}
      </WheelScrollDiv>
      <div className="cnt">
        {tab==='dashboard'   && <Dashboard casetas={casetas}/>}
        {tab==='ventas'      && <PanelVentas casetas={casetas} onVerDia={irATickets}/>}
        {tab==='tickets'     && <PanelTickets casetas={casetas} filtroInicial={ticketFiltro}/>}
        {tab==='auditoria'   && <PanelAuditoria casetas={casetas}/>}
        {tab==='devoluciones'&& <PanelDevoluciones casetas={casetas}/>}
        {tab==='defectuosos' && <PanelDefectuosos casetas={casetas}/>}
        {tab==='pedidos'     && <PanelPedidos casetas={casetas} perfil={perfil} onPedidoAceptado={()=>setPedidosPend(n=>Math.max(0,n-1))}/>}
        {tab==='inventarios' && <PanelInventarios casetas={casetas}/>}
        {tab==='fichajes'     && <PanelFichajes casetas={casetas} adminId={perfil.id}/>}
        {tab==='productos'   && <GestionProductos/>}
        {tab==='stock'       && <GestionStock casetas={casetas}/>}
        {tab==='ofertas'     && <GestionOfertas/>}
        {tab==='casetas'     && <GestionCasetas casetas={casetas} setCasetas={setCasetas}/>}
        {tab==='usuarios'    && <GestionUsuarios casetas={casetas}/>}
        {tab==='alertas'     && <GestionAlertas/>}
      </div>
    </div>
  )
}
