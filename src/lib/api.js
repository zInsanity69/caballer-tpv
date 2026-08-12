import { supabase } from './supabase.js'

// ─── AUTH ────────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  // Pasar el token directamente para evitar race condition con getSession()
  triggerAlerta('login_usuario', `🔐 <b>Login detectado</b>\n${email}`, {}, data.session?.access_token)
  return data
}
export async function logout() { await supabase.auth.signOut() }

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('perfiles').select('*, casetas(id, nombre, pedidos_auto_activos, hora_corte_pedidos)').eq('id', userId).single()
  if (error) throw error
  return data
}

// ─── PRODUCTOS ───────────────────────────────────────────────
export async function getProductos(soloActivos = true) {
  let q = supabase.from('productos').select('*').order('categoria').order('nombre')
  if (soloActivos) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw error
  return data
}

// Un EAN puede mapear a varios productos (variantes de color o colisiones entre
// proveedores), así que devolvemos SIEMPRE una lista. El escáner decide: 0 → no
// encontrado, 1 → directo, >1 → panel para elegir.
export async function getProductosByEan(ean) {
  const { data, error } = await supabase
    .from('productos').select('*').eq('codigo_ean', ean).eq('activo', true).order('nombre')
  if (error) return []
  return data ?? []
}

export async function upsertProducto(producto) {
  const { data, error } = await supabase
    .from('productos').upsert(producto, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data
}

export async function toggleProducto(id, activo) {
  const { error } = await supabase.from('productos').update({ activo }).eq('id', id)
  if (error) throw error
}

export async function deleteProducto(id) {
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) throw error
}

// Lista maestra de categorías (tabla categorias). Si falla, cae a las de los productos.
export async function getCategorias() {
  const { data, error } = await supabase.from('categorias').select('nombre').order('nombre')
  if (error || !data) {
    const { data: prods } = await supabase.from('productos').select('categoria').eq('activo', true)
    return [...new Set((prods || []).map(p => p.categoria).filter(Boolean))].sort()
  }
  return data.map(c => c.nombre)
}

export async function crearCategoria(nombre) {
  const n = (nombre || '').trim()
  if (!n) return
  const { error } = await supabase.from('categorias').insert({ nombre: n })
  if (error && error.code !== '23505') throw error // 23505 = ya existe, ignorar
}

export async function renombrarCategoria(viejo, nuevo) {
  const nv = (nuevo || '').trim()
  if (!nv || nv === viejo) return
  const { error: e1 } = await supabase.from('categorias').update({ nombre: nv }).eq('nombre', viejo)
  if (e1) throw e1
  // Propagar el cambio a todos los productos que la usaban
  const { error: e2 } = await supabase.from('productos').update({ categoria: nv }).eq('categoria', viejo)
  if (e2) throw e2
}

export async function eliminarCategoria(nombre) {
  // No borrar si hay productos usándola
  const { count } = await supabase.from('productos').select('id', { count: 'exact', head: true }).eq('categoria', nombre)
  if (count && count > 0) throw new Error(`No se puede borrar: ${count} producto(s) usan esta categoría`)
  const { error } = await supabase.from('categorias').delete().eq('nombre', nombre)
  if (error) throw error
}

// ─── STOCK ───────────────────────────────────────────────────
// Solo productos activos (para TPV y panel stock)
export async function getStockCaseta(casetaId) {
  const { data, error } = await supabase
    .from('stock')
    .select('producto_id, cantidad, productos!inner(activo)')
    .eq('caseta_id', casetaId)
    .eq('productos.activo', true)
  if (error) throw error
  return Object.fromEntries(data.map(s => [s.producto_id, s.cantidad]))
}

// Todos los productos (para inventario y admin)
export async function getStockCasetaCompleto(casetaId) {
  const { data, error } = await supabase
    .from('stock').select('producto_id, cantidad').eq('caseta_id', casetaId)
  if (error) throw error
  return Object.fromEntries(data.map(s => [s.producto_id, s.cantidad]))
}

export async function setStock(productoId, casetaId, cantidad) {
  const { error } = await supabase
    .from('stock')
    .upsert({ producto_id: productoId, caseta_id: casetaId, cantidad }, { onConflict: 'producto_id,caseta_id' })
  if (error) throw error
}

export async function ajustarStock(productoId, casetaId, delta) {
  const { data: row } = await supabase
    .from('stock')
    .select('cantidad, stock_minimo, productos(nombre, gramos_polvora), casetas(nombre)')
    .eq('producto_id', productoId).eq('caseta_id', casetaId).maybeSingle()
  const actual = row?.cantidad ?? 0
  const minimo = row?.stock_minimo ?? 0
  const nueva = Math.max(0, actual + delta)
  await setStock(productoId, casetaId, nueva)

  const nombreProd   = row?.productos?.nombre  || 'Producto'
  const nombreCaseta = row?.casetas?.nombre    || ''

  // Limpiar anti-spam si el stock volvió a la normalidad
  if (nueva > minimo && actual <= minimo) limpiarAlertaStock(productoId, casetaId)

  if (nueva <= 0 && actual > 0) {
    triggerAlerta('stock_agotado',
      `🚨 <b>AGOTADO:</b> ${nombreProd} en ${nombreCaseta}`,
      { producto_id: productoId, caseta_id: casetaId })
  } else if (minimo > 0 && nueva > 0 && nueva <= minimo) {
    triggerAlerta('stock_bajo',
      `⚠️ <b>Stock bajo:</b> ${nombreProd} en ${nombreCaseta}\nQuedan <b>${nueva}</b> ud. (mínimo: ${minimo})`,
      { producto_id: productoId, caseta_id: casetaId })
  }

  // Alerta pólvora si el producto la contiene
  if (row?.productos?.gramos_polvora > 0) {
    _checkPolvoraAlerta(casetaId, nombreCaseta)
  }

  return nueva
}

async function _checkPolvoraAlerta(casetaId, nombreCaseta) {
  try {
    const [kgActual, limite] = await Promise.all([getKgPolvora(casetaId), getLimitePolvora(casetaId)])
    if (limite > 0) {
      const pct = Math.round((kgActual / limite) * 100)
      if (pct >= 90) {
        triggerAlerta('limite_polvora',
          `💥 <b>Límite de pólvora al ${pct}%</b> en ${nombreCaseta}\n${kgActual.toFixed(2)} kg / ${limite} kg`)
      }
    }
  } catch (_) { /* silencioso */ }
}

// ─── KILOS PÓLVORA ───────────────────────────────────────────
export async function getKgPolvora(casetaId) {
  const { data, error } = await supabase
    .from('stock')
    .select('cantidad, productos(gramos_polvora)')
    .eq('caseta_id', casetaId)
    .gt('cantidad', 0)
  if (error) return 0
  const gramos = (data || []).reduce((s, row) => {
    const g = row.productos?.gramos_polvora || 0
    return s + (row.cantidad * g)
  }, 0)
  return gramos / 1000
}

export async function getLimitePolvora(casetaId) {
  const { data } = await supabase.from('casetas').select('limite_kg_polvora').eq('id', casetaId).single()
  return data?.limite_kg_polvora ?? 10
}

// NEC desglosado por división de riesgo (1.3G/1.4G/...) para el control legal.
// Devuelve kg por división + total + lo que esté "sin clasificar" (producto sin division).
export async function getNECDetalle(casetaId) {
  const { data, error } = await supabase
    .from('stock')
    .select('cantidad, productos(gramos_polvora, division)')
    .eq('caseta_id', casetaId)
    .gt('cantidad', 0)
  if (error) return { total: 0, porDivision: {}, sinClasificar: 0 }
  const porDivision = {}
  let sinClasificar = 0
  for (const row of (data || [])) {
    const g = row.productos?.gramos_polvora || 0
    if (g <= 0) continue
    const kg = (row.cantidad * g) / 1000
    const div = row.productos?.division
    if (div) porDivision[div] = (porDivision[div] || 0) + kg
    else sinClasificar += kg
  }
  const total = Object.values(porDivision).reduce((s, k) => s + k, 0) + sinClasificar
  return { total, porDivision, sinClasificar }
}

// ─── OFERTAS ─────────────────────────────────────────────────
export async function getOfertas(soloActivas = true) {
  let q = supabase.from('ofertas').select('*').order('producto_id').order('cantidad_pack')
  if (soloActivas) q = q.eq('activa', true)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function upsertOferta(oferta) {
  const { data, error } = await supabase
    .from('ofertas').upsert(oferta, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data
}

export async function updateOferta(id, cambios) {
  const { error } = await supabase.from('ofertas').update(cambios).eq('id', id)
  if (error) throw error
}

export async function deleteOferta(id) {
  const { error } = await supabase.from('ofertas').delete().eq('id', id)
  if (error) throw error
}

// ─── CASETAS ─────────────────────────────────────────────────
export async function getCasetas() {
  const { data, error } = await supabase.from('casetas').select('*').order('nombre')
  if (error) throw error
  return data
}

export async function upsertCaseta(caseta) {
  const { data, error } = await supabase
    .from('casetas').upsert(caseta, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data
}

export async function deleteCaseta(id) {
  const { error } = await supabase.from('casetas').delete().eq('id', id)
  if (error) throw error
}

export async function updateCaseta(id, cambios) {
  const { error } = await supabase.from('casetas').update(cambios).eq('id', id)
  if (error) throw error
}

export async function updateAllPedidosAuto(activos) {
  const { error } = await supabase.from('casetas').update({ pedidos_auto_activos: activos })
    .neq('id', '00000000-0000-0000-0000-000000000000') // aplica a todas
  if (error) throw error
}

// ─── USUARIOS / PERFILES ─────────────────────────────────────
export async function getPerfiles() {
  const { data, error } = await supabase
    .from('perfiles').select('*, casetas(nombre)').order('nombre')
  if (error) throw error
  return data
}

export async function getPerfilesEmpleados() {
  const { data, error } = await supabase
    .from('perfiles').select('*, casetas(nombre)').eq('rol', 'EMPLEADO').order('nombre')
  if (error) throw error
  return data
}

// Auditoría de ediciones/borrados de tickets (solo admin por RLS)
export async function getAuditoriaTickets(casetaId = null) {
  let q = supabase
    .from('ticket_auditoria')
    .select('*, perfiles(nombre), casetas(nombre)')
    .order('creado_en', { ascending: false })
    .limit(300)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  return data
}

// ─── DEVOLUCIONES / DEFECTUOSOS / BAJAS ───────────────────────
export async function registrarDevolucion(cab, items, ctx = null) {
  const { data, error } = await supabase.rpc('registrar_devolucion', { p_cab: cab, p_items: items })
  if (error) throw error
  const caseta = ctx?.nombreCaseta ? ` · ${ctx.nombreCaseta}` : ''
  const quien  = ctx?.nombreEmpleado ? ` · ${ctx.nombreEmpleado}` : ''
  const resumen = (items || []).map(i => `${i.nombre_producto} ×${i.cantidad}`).join(', ')
  if (cab.tipo === 'BAJA') {
    triggerAlerta('baja_producto', `📦 <b>Baja / rotura de producto</b>${caseta}${quien}\n${resumen}`)
  } else {
    const reemb = (+cab.importe_reembolsado > 0) ? `\nReembolso: <b>${(+cab.importe_reembolsado).toFixed(2)}€</b>` : ''
    triggerAlerta('devolucion', `↩️ <b>${cab.tipo === 'COMPENSACION' ? 'Compensación (defectuoso)' : 'Devolución'}</b>${caseta}${quien}${reemb}\n${resumen}`)
  }
  return data
}

export async function getDevoluciones(casetaId = null) {
  let q = supabase.from('devoluciones')
    .select('*, perfiles(nombre), casetas(nombre), devolucion_items(*)')
    .order('creado_en', { ascending: false })
    .limit(300)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getDefectuosos(casetaId = null) {
  let q = supabase.from('devolucion_items')
    .select('*, devoluciones!inner(id, caseta_id, tipo, creado_en, casetas(nombre))')
    .in('movimiento', ['DEVUELTO_DEFECTUOSO', 'BAJA'])
    .order('creado_en', { foreignTable: 'devoluciones', ascending: false })
  if (casetaId) q = q.eq('devoluciones.caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function updateReclamacionItem(itemId, estado) {
  const { error } = await supabase.from('devolucion_items').update({ reclamacion: estado }).eq('id', itemId)
  if (error) throw error
}

export async function getTicketPorNumero(casetaId, numero) {
  const raw = String(numero || '').trim()
  if (!raw) return null
  // Los escáneres con distribución de teclado distinta pueden convertir el guión
  // en otro carácter (p.ej. ALZ-00003 → ALZ'00003). Normalizamos: cualquier
  // separador no alfanumérico se trata como comodín en la búsqueda.
  const pattern = raw.toUpperCase().replace(/[^A-Z0-9]+/g, '%')
  const { data, error } = await supabase.from('tickets')
    .select('*, numero_ticket, ticket_items(id, producto_id, nombre_producto, precio_unitario, cantidad, total_linea)')
    .eq('caseta_id', casetaId).ilike('numero_ticket', pattern).limit(1)
  if (error) throw error
  return data && data[0] ? data[0] : null
}

export async function updateTicketNota(ticketId, notas, ctx = null) {
  const { error } = await supabase.from('tickets').update({ notas }).eq('id', ticketId)
  if (error) throw error
  // Solo alerta cuando se añade una nota (incidencia), no cuando se limpia
  if (notas) {
    const caseta = ctx?.nombreCaseta  || ''
    const ticket = ctx?.numeroTicket  ? ` #${ctx.numeroTicket}` : ''
    triggerAlerta('incidencia_ticket',
      `📝 <b>Incidencia en ticket${ticket}</b>${caseta ? ` · ${caseta}` : ''}\n${notas}`)
  }
}

export async function crearUsuario({ nombre, email, password, rol, caseta_id }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ nombre, email, password, rol, caseta_id }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error creando usuario')
  return data
}

export async function actualizarCredenciales(userId, { email, password }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/actualizar-usuario`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ userId, email: email || null, password: password || null }),
    }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error actualizando credenciales')
  return data
}

export async function updatePerfil(id, cambios) {
  const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
  if (error) throw error
}

export async function eliminarPerfil(id) {
  // Borrado real vía Edge Function (service role): elimina el usuario de auth.users,
  // que en cascada borra el perfil. Las FKs del histórico (cajas/tickets/...) quedan
  // en NULL (ON DELETE SET NULL) conservando el nombre en las columnas *_nombre.
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eliminar-usuario`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ userId: id }),
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Error eliminando usuario')
  return data
}

// ─── CONSULTA DE EMPRESA POR CIF (apispain.es) ───────────────
// Devuelve { ok, razonSocial, cif, direccion } para rellenar la factura.
// Si la API falla, ok:false y la UI permite rellenar a mano.
export async function consultarCif(cif) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/consultar-cif`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ cif: (cif || '').trim().toUpperCase() }),
      }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) return { ok: false, error: data.error || 'No encontrado' }
    return { ok: true, razonSocial: data.razonSocial || '', cif: data.cif || cif, direccion: data.direccion || '' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ─── CAJA ────────────────────────────────────────────────────
export async function getCajaAbierta(casetaId) {
  const { data, error } = await supabase
    .from('cajas').select('*, perfiles!abierta_por(nombre)')
    .eq('caseta_id', casetaId).eq('estado', 'ABIERTA').maybeSingle()
  if (error) throw error
  return data
}

export async function getCajasAbiertas() {
  const { data, error } = await supabase
    .from('cajas')
    .select('id, apertura_dinero, caseta_id, casetas(nombre), tickets(metodo_pago, total, pago_efectivo, pago_tarjeta)')
    .eq('estado', 'ABIERTA')
  if (error) throw error
  const cajas = data || []

  // Cargamos retiradas por separado para no romper si la tabla aún no existe
  const retiradaPorCaja = {}
  try {
    const ids = cajas.map(c => c.id)
    if (ids.length > 0) {
      const { data: rets } = await supabase
        .from('retiradas_caja').select('caja_id, cantidad').in('caja_id', ids)
      ;(rets || []).forEach(r => {
        retiradaPorCaja[r.caja_id] = (retiradaPorCaja[r.caja_id] || 0) + (r.cantidad || 0)
      })
    }
  } catch (_) { /* tabla aún no existe, ignorar */ }

  // Devoluciones en efectivo (salen de la caja, se restan igual que las retiradas)
  const devolucionPorCaja = {}
  try {
    const ids = cajas.map(c => c.id)
    if (ids.length > 0) {
      const { data: devs } = await supabase
        .from('devoluciones').select('caja_id, importe_reembolsado')
        .eq('tipo', 'DEVOLUCION').eq('metodo', 'efectivo').in('caja_id', ids)
      ;(devs || []).forEach(d => {
        devolucionPorCaja[d.caja_id] = (devolucionPorCaja[d.caja_id] || 0) + (d.importe_reembolsado || 0)
      })
    }
  } catch (_) { /* tabla aún no existe, ignorar */ }

  return cajas.map(c => {
    const ventasEfectivo = (c.tickets || []).reduce((s, t) => s + (t.pago_efectivo ?? (t.metodo_pago === 'efectivo' ? t.total : 0)), 0)
    const totalRetiradas = retiradaPorCaja[c.id] || 0
    const totalDevoluciones = devolucionPorCaja[c.id] || 0
    return {
      casetaNombre: c.casetas?.nombre || '?',
      casetaId: c.caseta_id,
      apertura: c.apertura_dinero || 0,
      ventasEfectivo,
      totalRetiradas,
      totalDevoluciones,
      // totalEfectivo = ventas del día − retiradas − devoluciones (sin apertura, que no es dinero ganado hoy)
      totalEfectivo: ventasEfectivo - totalRetiradas - totalDevoluciones,
      numTickets: (c.tickets || []).length,
    }
  })
}

// Devoluciones en efectivo de una caja concreta (para el cierre)
export async function getDevolucionesEfectivoCaja(cajaId) {
  try {
    const { data, error } = await supabase
      .from('devoluciones').select('importe_reembolsado')
      .eq('caja_id', cajaId).eq('tipo', 'DEVOLUCION').eq('metodo', 'efectivo')
    if (error) throw error
    return (data || []).reduce((s, d) => s + (d.importe_reembolsado || 0), 0)
  } catch (_) { return 0 }
}

export async function getRetiradas(cajaId) {
  const { data, error } = await supabase
    .from('retiradas_caja')
    .select('*, empleado_nombre, perfiles(nombre)')
    .eq('caja_id', cajaId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getRetiradasHoy() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('retiradas_caja')
    .select('*, empleado_nombre, perfiles(nombre), casetas(nombre)')
    .gte('creado_en', hoy.toISOString())
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data || []
}

export async function registrarRetirada(cajaId, casetaId, empleadoId, cantidad, motivo, ctx = null) {
  const { error } = await supabase
    .from('retiradas_caja')
    .insert({ caja_id: cajaId, caseta_id: casetaId, empleado_id: empleadoId, cantidad, motivo: motivo || null })
  if (error) throw error
  const nombre = ctx?.nombreEmpleado || ''
  const caseta = ctx?.nombreCaseta  || ''
  triggerAlerta('retirada_caja',
    `💸 <b>Retirada de caja</b>${caseta ? ` en ${caseta}` : ''}${nombre ? ` por ${nombre}` : ''}\nImporte: <b>${cantidad.toFixed(2)}€</b>${motivo ? `\nMotivo: ${motivo}` : ''}`)
}

export async function abrirCaja(casetaId, empleadoId, aperturaDinero, ctx = null) {
  const existente = await getCajaAbierta(casetaId)
  if (existente) return existente
  const { data, error } = await supabase
    .from('cajas').insert({ caseta_id: casetaId, abierta_por: empleadoId, apertura_dinero: aperturaDinero })
    .select().single()
  if (error) throw error
  // Recargar con join de perfiles para tener el nombre de quien abrió
  const cajaCon = await getCajaAbierta(casetaId)
  const nombre = ctx?.nombreEmpleado || ''
  const caseta = ctx?.nombreCaseta  || ''
  triggerAlerta('fichaje', `🏪 <b>Caja abierta</b>${caseta ? ` en ${caseta}` : ''}${nombre ? ` por ${nombre}` : ''}`)
  return cajaCon || data
}

export async function cerrarCaja(cajaId, empleadoId, dineroContado, ctx = null) {
  const { error } = await supabase.from('cajas')
    .update({ estado: 'CERRADA', cerrada_por: empleadoId, cerrada_en: new Date().toISOString(), dinero_contado: dineroContado })
    .eq('id', cajaId)
  if (error) throw error
  if (ctx?.esperado !== undefined) {
    const descuadre = dineroContado - ctx.esperado
    if (Math.abs(descuadre) > 0.01) {
      const caseta = ctx.nombreCaseta || ''
      const signo  = descuadre > 0 ? '+' : ''
      triggerAlerta('caja_cerrada_descuadre',
        `💰 <b>Descuadre de caja</b>${caseta ? ` en ${caseta}` : ''}\nEsperado: <b>${ctx.esperado.toFixed(2)}€</b> · Contado: <b>${dineroContado.toFixed(2)}€</b> · Diferencia: <b>${signo}${descuadre.toFixed(2)}€</b>`)
    }
  }
}

export async function getResumenCaja(cajaId) {
  const { data, error } = await supabase
    .from('tickets').select('metodo_pago, total, pago_efectivo, pago_tarjeta, empleado_id, perfiles(nombre)').eq('caja_id', cajaId)
  if (error) throw error
  return data
}

// ─── TICKETS ─────────────────────────────────────────────────
export async function crearTicket(payload) {
  // Llama a la función RPC que genera el número secuencial y crea el ticket
  const { data: ticketId, error } = await supabase.rpc('crear_ticket', {
    p_caja_id:     payload.cajaId,
    p_caseta_id:   payload.casetaId,
    p_empleado_id: payload.empleadoId,
    p_metodo_pago: payload.metodoPago,
    p_total:       payload.total,
    p_dinero_dado: payload.dineroDado,
    p_cambio:      payload.cambio,
    p_items:       payload.items,
    p_pago_efectivo: payload.pagoEfectivo ?? null,
    p_pago_tarjeta:  payload.pagoTarjeta ?? null,
  })
  if (error) throw error
  // Recuperar el número de ticket asignado
  const { data: ticket } = await supabase
    .from('tickets')
    .select('id, numero_ticket')
    .eq('id', ticketId)
    .single()

  // Comprobar alertas de stock para los productos vendidos
  _checkStockAlertasTicket(payload.casetaId, payload.items.map(i => i.producto_id))

  return ticket || { id: ticketId, numero_ticket: ticketId?.slice(-8).toUpperCase() }
}

// Guarda los datos del cliente de una factura sobre el ticket (para poder reimprimirla)
export async function guardarFacturaCliente(ticketId, cliente) {
  if (!ticketId) return
  const { error } = await supabase.from('tickets').update({
    factura: true,
    cliente_nombre:    cliente?.razonSocial || null,
    cliente_cif:       cliente?.cif || null,
    cliente_direccion: cliente?.direccion || null,
  }).eq('id', ticketId)
  if (error) throw error
}

async function _checkStockAlertasTicket(casetaId, productoIds) {
  try {
    const { data: rows } = await supabase
      .from('stock')
      .select('cantidad, stock_minimo, producto_id, productos(nombre, gramos_polvora), casetas(nombre)')
      .in('producto_id', productoIds)
      .eq('caseta_id', casetaId)
    if (!rows) return
    let hayPolvora = false
    let nombreCaseta = ''
    for (const row of rows) {
      const minimo = row.stock_minimo ?? 0
      const nombre = row.productos?.nombre || 'Producto'
      nombreCaseta = row.casetas?.nombre || ''
      if (row.productos?.gramos_polvora > 0) hayPolvora = true
      if (row.cantidad <= 0) {
        triggerAlerta('stock_agotado',
          `🚨 <b>AGOTADO:</b> ${nombre} en ${nombreCaseta}`,
          { producto_id: row.producto_id, caseta_id: casetaId })
      } else if (minimo > 0 && row.cantidad <= minimo) {
        triggerAlerta('stock_bajo',
          `⚠️ <b>Stock bajo:</b> ${nombre} en ${nombreCaseta}\nQuedan <b>${row.cantidad}</b> ud. (mínimo: ${minimo})`,
          { producto_id: row.producto_id, caseta_id: casetaId })
      } else if (minimo > 0 && row.cantidad > minimo) {
        limpiarAlertaStock(row.producto_id, casetaId)
      }
    }
    if (hayPolvora && nombreCaseta) _checkPolvoraAlerta(casetaId, nombreCaseta)
  } catch (_) { /* silencioso */ }
}

export async function getTicketsTurno(cajaId) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*, numero_ticket, ticket_items(id, producto_id, nombre_producto, precio_unitario, cantidad, total_linea, con_oferta, productos(gramos_polvora)), perfiles(nombre)')
    .eq('caja_id', cajaId).order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function getTicketsPorRango(casetaId, desde, hasta) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*, ticket_items(id, cantidad, total_linea, nombre_producto, producto_id, precio_unitario, productos(gramos_polvora)), perfiles(nombre), casetas(nombre, direccion)')
    .eq('caseta_id', casetaId).gte('creado_en', desde).lte('creado_en', hasta)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function getTicketsAdmin(desde, hasta, casetaId) {
  let q = supabase.from('tickets')
    .select('*, numero_ticket, ticket_items(id, cantidad, total_linea, nombre_producto, producto_id, precio_unitario, productos(gramos_polvora)), casetas(nombre, direccion), perfiles(nombre)')
    .order('creado_en', { ascending: false }).limit(200)
  if (desde) q = q.gte('creado_en', desde)
  if (hasta) q = q.lte('creado_en', hasta)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function deleteTicket(id) {
  const { error } = await supabase.rpc('cancelar_ticket', { p_ticket_id: id })
  if (error) throw error
}

// Editar ticket: ajusta stock de forma atómica (devuelve lo anterior, descuenta lo nuevo)
export async function updateTicket(ticketId, nuevoTotal, nuevosItems) {
  const items = nuevosItems.map(i => ({
    producto_id:     i.producto_id,
    nombre_producto: i.nombre || i.nombre_producto,
    precio_unitario: +(i.precio ?? i.precio_unitario),
    cantidad:        i.cantidad,
    total_linea:     i.total_linea,
    con_oferta:      i.con_oferta || false,
    detalle_oferta:  i.detalle_oferta || null,
  }))
  const { error } = await supabase.rpc('actualizar_ticket', {
    p_ticket_id:    ticketId,
    p_nuevo_total:  nuevoTotal,
    p_nuevos_items: items,
  })
  if (error) throw error
}

export async function getTicketsHoy(casetaId) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const { data, error } = await supabase.from('tickets').select('*, perfiles(nombre)')
    .eq('caseta_id', casetaId).gte('creado_en', hoy.toISOString()).order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

// ─── FAVORITOS (localStorage) ─────────────────────────────────
export function getFavoritos() {
  try { return JSON.parse(localStorage.getItem('tpv_favoritos') || '[]') } catch { return [] }
}
export function toggleFavorito(productoId) {
  const favs = getFavoritos()
  const idx = favs.indexOf(productoId)
  if (idx >= 0) favs.splice(idx, 1); else favs.unshift(productoId)
  localStorage.setItem('tpv_favoritos', JSON.stringify(favs.slice(0, 20)))
  return favs
}

// ─── PEDIDOS ─────────────────────────────────────────────────
export async function getPedidos(filtros = {}) {
  let q = supabase.from('pedidos')
    .select('*, casetas(nombre), perfiles(nombre), pedido_items(id, producto_id, cantidad, cantidad_recibida, notas_item, origen, productos(id, nombre, categoria, empresa, fardo, envases_por_caja))')
    .order('creado_en', { ascending: false })
  if (filtros.casetaId) q = q.eq('caseta_id', filtros.casetaId)
  if (filtros.estado)   q = q.eq('estado', filtros.estado)
  if (filtros.activos)  q = q.in('estado', ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO'])
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function crearPedido(casetaId, empleadoId, items, notas = '', ctx = null) {
  const { data: pedido, error: e1 } = await supabase.from('pedidos')
    .insert({ caseta_id: casetaId, empleado_id: empleadoId, notas, estado: 'PENDIENTE' })
    .select().single()
  if (e1) throw e1
  const filas = items.map(i => ({ pedido_id: pedido.id, producto_id: i.producto_id, cantidad: i.cantidad, origen: i.origen || 'manual' }))
  const { error: e2 } = await supabase.from('pedido_items').insert(filas)
  if (e2) {
    if (e2.code === '42703') {
      // columna origen no existe aún — reintenta sin ella
      const filasSin = items.map(i => ({ pedido_id: pedido.id, producto_id: i.producto_id, cantidad: i.cantidad }))
      const { error: e3 } = await supabase.from('pedido_items').insert(filasSin)
      if (e3) throw e3
    } else throw e2
  }
  const caseta  = ctx?.nombreCaseta  || ''
  const nombre  = ctx?.nombreEmpleado || ''
  triggerAlerta('nuevo_pedido',
    `📦 <b>Nuevo pedido enviado</b>${caseta ? ` en ${caseta}` : ''}${nombre ? ` por ${nombre}` : ''}\n${items.length} producto(s) solicitado(s)`)
  return pedido
}

export async function getStockMinimos(casetaId) {
  const { data, error } = await supabase
    .from('stock').select('producto_id, stock_minimo').eq('caseta_id', casetaId)
  if (error) return {}
  return Object.fromEntries((data || []).map(s => [s.producto_id, s.stock_minimo || 0]))
}

export async function setStockMinimo(productoId, casetaId, minimo) {
  const { error } = await supabase.from('stock')
    .upsert({ producto_id: productoId, caseta_id: casetaId, stock_minimo: minimo }, { onConflict: 'producto_id,caseta_id' })
  if (error) throw error
}

export async function updatePedido(pedidoId, cambios, ctx = null) {
  const { error } = await supabase.from('pedidos')
    .update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', pedidoId)
  if (error) throw error
  if (cambios.estado === 'INCIDENCIA') {
    const caseta = ctx?.nombreCaseta || ''
    triggerAlerta('incidencia_pedido',
      `🚨 <b>Incidencia en pedido</b>${caseta ? ` de ${caseta}` : ''}\n${cambios.notas || ''}`.trim())
  }
}

export async function updatePedidoItems(pedidoId, items) {
  const { error: e1 } = await supabase.from('pedido_items').delete().eq('pedido_id', pedidoId)
  if (e1) throw e1
  const filas = items.map(i => ({ pedido_id: pedidoId, producto_id: i.producto_id, cantidad: i.cantidad }))
  const { error: e2 } = await supabase.from('pedido_items').insert(filas)
  if (e2) throw e2
}

// Aplica al stock un producto del pedido en el momento de revisarlo (recepción
// progresiva). `delta` es la diferencia respecto a lo ya aplicado para ese item
// y puede ser negativo (corrección). Devuelve el stock resultante (o null si no
// hubo cambio). También persiste la cantidad recibida y la nota del item.
export async function recibirItemPedido(itemId, productoId, casetaId, delta, cantidadRecibida, notas = null) {
  let nuevaCantidad = null
  if (delta !== 0) {
    const { data, error } = await supabase.rpc('ajustar_stock', {
      p_producto_id: productoId,
      p_caseta_id:   casetaId,
      p_delta:       delta,
    })
    if (error) throw error
    nuevaCantidad = data
  }
  const { error: e2 } = await supabase.from('pedido_items')
    .update({ cantidad_recibida: cantidadRecibida, notas_item: notas || null })
    .eq('id', itemId)
  if (e2) throw e2
  return nuevaCantidad
}

export async function confirmarRecepcionPedido(pedidoId, casetaId, itemsRecibidos, notas = '', ctx = null) {
  // El stock ya se fue aplicando producto a producto al revisarlos
  // (recepción progresiva, ver recibirItemPedido). Aquí solo persistimos los
  // datos por si quedó algo sin guardar, fijamos el estado y avisamos.
  for (const item of itemsRecibidos) {
    await supabase.from('pedido_items')
      .update({ cantidad_recibida: item.cantidad_recibida, notas_item: item.notas_item || null })
      .eq('id', item.id)
  }

  const hayIncidencia =
    (notas && notas.trim() !== '') ||
    itemsRecibidos.some(i =>
      (i.notas_item && i.notas_item.trim() !== '') ||
      (i.cantidad_recibida !== undefined && i.cantidad_recibida !== i.cantidad)
    )

  await supabase.from('pedidos').update({
    estado: hayIncidencia ? 'INCIDENCIA' : 'RECIBIDO',
    notas: notas || null,
    actualizado_en: new Date().toISOString(),
  }).eq('id', pedidoId)

  const caseta = ctx?.nombreCaseta  || ''
  const nombre = ctx?.nombreEmpleado || ''
  if (hayIncidencia) {
    triggerAlerta('incidencia_pedido',
      `🚨 <b>Incidencia en recepción de pedido</b>${caseta ? ` en ${caseta}` : ''}${nombre ? ` (${nombre})` : ''}`)
  } else {
    triggerAlerta('pedido_recibido',
      `✅ <b>Pedido recibido</b>${caseta ? ` en ${caseta}` : ''}${nombre ? ` por ${nombre}` : ''}`)
  }
}

// ─── INVENTARIOS ─────────────────────────────────────────────
export async function getInventarios(casetaId) {
  let q = supabase.from('inventarios')
    .select('*, perfiles(nombre), inventario_items(*, productos(nombre, categoria))')
    .order('creado_en', { ascending: false })
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q.limit(20)
  if (error) throw error
  return data || []
}

export async function crearInventario(casetaId, empleadoId, items, esFinal = false) {
  const { data: inv, error: e1 } = await supabase.from('inventarios')
    .insert({ caseta_id: casetaId, empleado_id: empleadoId, estado: 'BORRADOR', es_final: esFinal })
    .select().single()
  if (e1) throw e1

  const stockActual = await getStockCasetaCompleto(casetaId)
  const filas = items.map(i => ({
    inventario_id:    inv.id,
    producto_id:      i.producto_id,
    cantidad_real:    i.cantidad_real,
    cantidad_teorica: stockActual[i.producto_id] ?? 0,
    diferencia:       i.cantidad_real - (stockActual[i.producto_id] ?? 0),
  }))
  const { error: e2 } = await supabase.from('inventario_items').insert(filas)
  if (e2) throw e2
  return inv
}

export async function confirmarInventario(inventarioId, ctx = null, esFinal = false) {
  const rpc = esFinal ? 'aplicar_inventario_final' : 'aplicar_inventario'
  const { error } = await supabase.rpc(rpc, { p_inventario_id: inventarioId })
  if (error) throw error
  const caseta = ctx?.nombreCaseta  || ''
  const nombre = ctx?.nombreEmpleado || ''
  triggerAlerta('inventario_enviado',
    `📋 <b>Inventario ${esFinal ? 'final confirmado (caseta vaciada)' : 'confirmado'}</b>${caseta ? ` en ${caseta}` : ''}${nombre ? ` por ${nombre}` : ''}`)
}

// Ajuste de stock con registro (auditado). delta positivo suma, negativo resta.
export async function ajustarStockAuditado(productoId, casetaId, delta, motivo = null) {
  const { data, error } = await supabase.rpc('ajustar_stock_auditado', {
    p_producto_id: productoId, p_caseta_id: casetaId, p_delta: delta, p_motivo: motivo || null,
  })
  if (error) throw error
  return data
}

export async function getStockAuditoria(casetaId = null) {
  let q = supabase.from('stock_auditoria')
    .select('*, perfiles(nombre), casetas(nombre)')
    .order('creado_en', { ascending: false })
    .limit(300)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  return data
}

// ─── STATS ADMIN ─────────────────────────────────────────────
export async function getStatsAdmin() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  // Stock bajo/agotado: SOLO productos que la caseta gestiona (con stock_mínimo
  // configurado) y SOLO casetas activas. «Bajo» = por debajo de su mínimo;
  // «Agotado» = a 0. Los productos sin mínimo no alertan (la caseta no los sigue).
  const sel = 'cantidad, stock_minimo, producto_id, productos!inner(nombre, categoria, activo), casetas!inner(id, nombre, activo)'
  const [ticketsRes, stockBajoRes, stockCeroRes] = await Promise.all([
    supabase.from('tickets').select('total, metodo_pago, pago_efectivo, pago_tarjeta, casetas(nombre)').gte('creado_en', hoy.toISOString()),
    supabase.from('stock').select(sel)
      .eq('productos.activo', true).eq('casetas.activo', true).gt('stock_minimo', 0).gt('cantidad', 0),
    supabase.from('stock').select(sel)
      .eq('productos.activo', true).eq('casetas.activo', true).gt('stock_minimo', 0).lte('cantidad', 0),
  ])
  // «Bajo»: por debajo del mínimo (la comparación entre columnas se filtra aquí).
  const stockBajo = (stockBajoRes.data || []).filter(r => r.cantidad < r.stock_minimo)
  const stockCero = stockCeroRes.data || []

  // Devoluciones de hoy (reembolsos) — restan a las ventas. Guardado por si la
  // tabla aún no existe (migración sin aplicar).
  let devolucionesHoy = 0
  try {
    const { data: devs } = await supabase.from('devoluciones')
      .select('importe_reembolsado').eq('tipo', 'DEVOLUCION').gte('creado_en', hoy.toISOString())
    devolucionesHoy = (devs || []).reduce((s, d) => s + (d.importe_reembolsado || 0), 0)
  } catch (_) { /* tabla aún no existe */ }

  return {
    tickets:   ticketsRes.data || [],
    stockBajo,
    stockCero,
    devolucionesHoy,
  }
}

export async function getVentasPorDia(casetaId, año, mes) {
  const desde = new Date(año, mes - 1, 1).toISOString()
  const hasta = new Date(año, mes, 0, 23, 59, 59).toISOString()
  let q = supabase.from('tickets').select('total, metodo_pago, pago_efectivo, pago_tarjeta, creado_en')
    .gte('creado_en', desde).lte('creado_en', hasta)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  const porDia = {}
  ;(data || []).forEach(t => {
    const dia = t.creado_en.slice(0, 10)
    if (!porDia[dia]) porDia[dia] = { efectivo: 0, tarjeta: 0, tickets: 0 }
    porDia[dia].tickets++
    porDia[dia].efectivo += (t.pago_efectivo ?? (t.metodo_pago === 'efectivo' ? t.total : 0))
    porDia[dia].tarjeta  += (t.pago_tarjeta  ?? (t.metodo_pago === 'tarjeta'  ? t.total : 0))
  })
  return porDia
}


// ─── GEOLOCALIZACIÓN ──────────────────────────────────────────

// Fórmula Haversine — distancia en metros entre dos coordenadas
function haversineMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000 // radio tierra en metros
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Obtener ubicación actual del navegador
// Devuelve { lat, lng, precision } o lanza error con mensaje claro
export function obtenerUbicacion() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no soporta geolocalización. Usa Chrome o Safari actualizado.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat:       pos.coords.latitude,
        lng:       pos.coords.longitude,
        precision: Math.round(pos.coords.accuracy),
      }),
      err => {
        const msgs = {
          1: 'Has denegado el acceso a la ubicación. Ve a los ajustes del navegador y permite la ubicación para esta página.',
          2: 'No se pudo obtener tu ubicación. Asegúrate de tener el GPS activado.',
          3: 'Tiempo de espera agotado al obtener la ubicación. Inténtalo de nuevo.',
        }
        reject(new Error(msgs[err.code] || 'Error de geolocalización desconocido.'))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  })
}

// Verificar si una ubicación está dentro del radio de una caseta
// Devuelve { permitido, distancia, mensaje }
export function verificarUbicacion(lat, lng, caseta) {
  if (!caseta.geo_activo || !caseta.latitud || !caseta.longitud) {
    return { permitido: true, distancia: null, mensaje: null }
  }
  const distancia = Math.round(haversineMetros(lat, lng, caseta.latitud, caseta.longitud))
  const radio = caseta.radio_metros || 200
  if (distancia <= radio) {
    return { permitido: true, distancia, mensaje: `✓ Ubicación verificada (${distancia}m de la caseta)` }
  }
  return {
    permitido: false,
    distancia,
    mensaje: `Estás a ${distancia}m de la caseta. Debes estar a menos de ${radio}m para fichar.`,
  }
}

// ─── FICHAJES ─────────────────────────────────────────────────
export async function getUltimoFichaje(empleadoId) {
  const { data, error } = await supabase
    .from('fichajes')
    .select('tipo, timestamp')
    .eq('empleado_id', empleadoId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data
}

export async function fichar(empleadoId, casetaId, tipo, notas = '', geoData = null, ctx = null) {
  const fila = {
    empleado_id: empleadoId,
    caseta_id:   casetaId,
    tipo,
    notas:       notas || null,
  }
  // Añadir datos de geolocalización si se proporcionan
  if (geoData) {
    fila.latitud    = geoData.lat
    fila.longitud   = geoData.lng
    fila.precision_m = geoData.precision
    fila.geo_ok     = geoData.geo_ok
  }
  const { data, error } = await supabase
    .from('fichajes')
    .insert(fila)
    .select()
    .single()
  if (error) throw error
  const nombre = ctx?.nombreEmpleado || ''
  const caseta = ctx?.nombreCaseta  || ''
  const tipoLabel = { ENTRADA: '🟢 Entrada', SALIDA: '🔴 Salida', INICIO_DESCANSO: '☕ Inicio descanso', FIN_DESCANSO: '✅ Fin descanso' }[tipo] || tipo
  triggerAlerta('fichaje',
    `⏱️ <b>${tipoLabel}</b>${nombre ? ` · ${nombre}` : ''}${caseta ? ` en ${caseta}` : ''}`)
  return data
}

export async function getFichajesEmpleado(empleadoId, desde, hasta) {
  let q = supabase
    .from('fichajes')
    .select('*')
    .eq('empleado_id', empleadoId)
    .order('timestamp', { ascending: true })
  // Compensar timezone España (UTC+1/+2): ampliar rango en la query
  // El filtro final lo hace el cliente (calcularTurnos agrupa por día local)
  if (desde) {
    const d = new Date(desde); d.setHours(d.getHours() - 3)
    q = q.gte('timestamp', d.toISOString())
  }
  if (hasta) {
    const h = new Date(hasta); h.setHours(h.getHours() + 3)
    q = q.lte('timestamp', h.toISOString())
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getFichajesAdmin(desde, hasta, casetaId, empleadoId) {
  // Select simple sin JOIN para evitar problemas de RLS en tablas relacionadas
  let q = supabase
    .from('fichajes')
    .select('id, empleado_id, caseta_id, tipo, timestamp, notas, editado, editado_por')
    .order('timestamp', { ascending: false })

  // Compensar timezone España (UTC+1/+2): ampliar ±3h y filtrar en cliente
  if (desde) {
    const d = new Date(desde); d.setHours(d.getHours() - 3)
    q = q.gte('timestamp', d.toISOString())
  }
  if (hasta) {
    const h = new Date(hasta); h.setHours(h.getHours() + 3)
    q = q.lte('timestamp', h.toISOString())
  }
  if (casetaId)   q = q.eq('caseta_id', casetaId)
  if (empleadoId) q = q.eq('empleado_id', empleadoId)

  const { data, error } = await q
  if (error) throw error

  // Enriquecer con perfiles y casetas por separado para evitar RLS en JOIN
  const fichajes = data || []
  if (fichajes.length === 0) return []

  // Obtener perfiles y casetas únicos
  const empIds = [...new Set(fichajes.map(f => f.empleado_id))]
  const casIds = [...new Set(fichajes.map(f => f.caseta_id))]

  const [{ data: perfs }, { data: cases }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre').in('id', empIds),
    supabase.from('casetas').select('id, nombre').in('id', casIds),
  ])

  const perfilMap  = Object.fromEntries((perfs||[]).map(p => [p.id, p]))
  const casetaMap  = Object.fromEntries((cases||[]).map(c => [c.id, c]))

  return fichajes.map(f => ({
    ...f,
    perfiles: perfilMap[f.empleado_id] || { nombre: '?' },
    casetas:  casetaMap[f.caseta_id]   || { nombre: '?' },
  }))
}

export async function editarFichaje(fichajeId, adminId, nuevoTimestamp, notas) {
  const { error } = await supabase
    .from('fichajes')
    .update({
      timestamp:  nuevoTimestamp,
      notas:      notas || null,
      editado:    true,
      editado_por: adminId,
    })
    .eq('id', fichajeId)
  if (error) throw error
}

export async function deleteFichaje(fichajeId) {
  const { error } = await supabase.from('fichajes').delete().eq('id', fichajeId)
  if (error) throw error
}

// Obtener empleados activos (fichados) en una caseta ahora mismo
// Sirve para saber si un empleado puede salir sin cerrar caja
export async function getEmpleadosActivosCaseta(casetaId, empleadoId) {
  // Traer el último fichaje de cada empleado de esa caseta hoy
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const { data, error } = await supabase
    .from('fichajes')
    .select('empleado_id, tipo, timestamp')
    .eq('caseta_id', casetaId)
    .gte('timestamp', new Date(hoy.getTime() - 3*60*60*1000).toISOString()) // -3h timezone
    .order('timestamp', { ascending: false })
  if (error) return []

  // Agrupar por empleado — quedarnos con el último fichaje de cada uno
  const porEmpleado = {}
  for (const f of (data || [])) {
    if (!porEmpleado[f.empleado_id]) porEmpleado[f.empleado_id] = f
  }

  // Filtrar los que siguen activos (ENTRADA o FIN_DESCANSO o INICIO_DESCANSO)
  // y excluir al empleado actual
  const activos = Object.entries(porEmpleado)
    .filter(([empId, f]) => empId !== empleadoId && f.tipo !== 'SALIDA')
    .map(([empId]) => empId)

  return activos
}

// Calcular estado actual a partir del último fichaje
// Posibles estados: 'libre' | 'trabajando' | 'descanso'
export function calcularEstado(ultimoFichaje) {
  if (!ultimoFichaje) return 'libre'
  switch (ultimoFichaje.tipo) {
    case 'ENTRADA':       return 'trabajando'
    case 'INICIO_DESCANSO': return 'descanso'
    case 'FIN_DESCANSO':  return 'trabajando'
    case 'SALIDA':        return 'libre'
    default:              return 'libre'
  }
}

// Calcular turnos completos con descansos a partir de array de fichajes ordenados por timestamp ASC
// Devuelve array de turnos: { entrada, salida, descansos[], minutosTrabajados, minutosDescanso, enCurso, enDescanso }
export function calcularTurnos(fichajes) {
  const sorted = [...fichajes].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  const turnos = []
  let turnoActual = null   // { entrada, descansos: [], inicioDescansoActual }

  for (const f of sorted) {
    switch (f.tipo) {
      case 'ENTRADA':
        // Nuevo turno — si había uno abierto sin salida lo cerramos como en curso
        if (turnoActual) {
          turnos.push(_cerrarTurno(turnoActual, null))
        }
        turnoActual = { entrada: f, descansos: [], inicioDescansoActual: null }
        break

      case 'INICIO_DESCANSO':
        if (turnoActual && !turnoActual.inicioDescansoActual) {
          turnoActual.inicioDescansoActual = f
        }
        break

      case 'FIN_DESCANSO':
        if (turnoActual && turnoActual.inicioDescansoActual) {
          const mins = (new Date(f.timestamp) - new Date(turnoActual.inicioDescansoActual.timestamp)) / 60000
          turnoActual.descansos.push({
            inicio: turnoActual.inicioDescansoActual,
            fin: f,
            minutos: mins,
          })
          turnoActual.inicioDescansoActual = null
        }
        break

      case 'SALIDA':
        if (turnoActual) {
          // Si había descanso sin cerrar, lo cerramos con la salida
          if (turnoActual.inicioDescansoActual) {
            turnoActual.descansos.push({
              inicio: turnoActual.inicioDescansoActual,
              fin: f,
              minutos: (new Date(f.timestamp) - new Date(turnoActual.inicioDescansoActual.timestamp)) / 60000,
            })
            turnoActual.inicioDescansoActual = null
          }
          turnos.push(_cerrarTurno(turnoActual, f))
          turnoActual = null
        }
        break
    }
  }

  // Turno aún abierto
  if (turnoActual) {
    turnos.push(_cerrarTurno(turnoActual, null))
  }

  return turnos
}

function _cerrarTurno(turnoActual, salida) {
  const ahora = new Date()
  const finReal = salida ? new Date(salida.timestamp) : ahora
  const minutosTotales = (finReal - new Date(turnoActual.entrada.timestamp)) / 60000

  // Sumar minutos de descanso ya cerrados
  let minutosDescanso = turnoActual.descansos.reduce((s, d) => s + d.minutos, 0)

  // Descanso aún abierto (sin FIN_DESCANSO)
  const enDescanso = !!turnoActual.inicioDescansoActual
  let descansoEnCurso = null
  if (enDescanso && turnoActual.inicioDescansoActual) {
    const minsDesc = (ahora - new Date(turnoActual.inicioDescansoActual.timestamp)) / 60000
    minutosDescanso += minsDesc
    descansoEnCurso = { inicio: turnoActual.inicioDescansoActual, minutos: minsDesc }
  }

  const minutosTrabajados = Math.max(0, minutosTotales - minutosDescanso)

  return {
    entrada:          turnoActual.entrada,
    salida:           salida,
    descansos:        turnoActual.descansos,
    descansoEnCurso,
    enCurso:          !salida,
    enDescanso,
    minutosTotales,
    minutosTrabajados,
    minutosDescanso,
  }
}

export function fmtDuracion(minutos) {
  if (!minutos && minutos !== 0) return '—'
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── ALERTAS TELEGRAM ────────────────────────────────────────

export async function triggerAlerta(tipo, mensaje, extra = {}, accessToken = null) {
  try {
    let token = accessToken
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      token = session.access_token
    }
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notificar-telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ tipo, mensaje, ...extra }),
    })
  } catch (_) { /* silencioso, no interrumpe el flujo principal */ }
}

export async function getAlertasConfig() {
  const { data } = await supabase.from('alertas_config').select('*').order('tipo')
  return data || []
}

export async function updateAlertaConfig(tipo, cambios) {
  const { error } = await supabase.from('alertas_config').update(cambios).eq('tipo', tipo)
  if (error) throw error
}

// Borra el registro de "ya enviada" para un producto cuando su stock se recupera
export async function limpiarAlertaStock(productoId, casetaId) {
  try {
    await supabase
      .from('alertas_stock_enviadas')
      .delete()
      .eq('producto_id', productoId)
      .eq('caseta_id', casetaId)
  } catch (_) { /* silencioso */ }
}
