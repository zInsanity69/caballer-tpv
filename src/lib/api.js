import { supabase } from './supabase.js'

// ─── AUTH ────────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}
export async function logout() { await supabase.auth.signOut() }

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('perfiles').select('*, casetas(id, nombre)').eq('id', userId).single()
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

export async function getProductoByEan(ean) {
  const { data, error } = await supabase
    .from('productos').select('*').eq('codigo_ean', ean).eq('activo', true).single()
  if (error) return null
  return data
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

export async function getCategorias() {
  const { data, error } = await supabase.from('productos').select('categoria').eq('activo', true)
  if (error) return []
  return [...new Set(data.map(p => p.categoria))].sort()
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

// ─── OFERTAS ─────────────────────────────────────────────────
export async function getOfertas() {
  const { data, error } = await supabase
    .from('ofertas').select('*').eq('activa', true).order('producto_id').order('cantidad_pack')
  if (error) throw error
  return data
}

export async function upsertOferta(oferta) {
  const { data, error } = await supabase
    .from('ofertas').upsert(oferta, { onConflict: 'id' }).select().single()
  if (error) throw error
  return data
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

// ─── USUARIOS / PERFILES ─────────────────────────────────────
export async function getPerfiles() {
  const { data, error } = await supabase
    .from('perfiles').select('*, casetas(nombre)').order('nombre')
  if (error) throw error
  return data
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

export async function updatePerfil(id, cambios) {
  const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
  if (error) throw error
}

// ─── CAJA ────────────────────────────────────────────────────
export async function getCajaAbierta(casetaId) {
  const { data, error } = await supabase
    .from('cajas').select('*, perfiles!abierta_por(nombre)')
    .eq('caseta_id', casetaId).eq('estado', 'ABIERTA').maybeSingle()
  if (error) throw error
  return data
}

export async function abrirCaja(casetaId, empleadoId, aperturaDinero) {
  const existente = await getCajaAbierta(casetaId)
  if (existente) return existente
  const { data, error } = await supabase
    .from('cajas').insert({ caseta_id: casetaId, abierta_por: empleadoId, apertura_dinero: aperturaDinero })
    .select().single()
  if (error) throw error
  return data
}

export async function cerrarCaja(cajaId, empleadoId, dineroContado) {
  const { error } = await supabase.from('cajas')
    .update({ estado: 'CERRADA', cerrada_por: empleadoId, cerrada_en: new Date().toISOString(), dinero_contado: dineroContado })
    .eq('id', cajaId)
  if (error) throw error
}

export async function getResumenCaja(cajaId) {
  const { data, error } = await supabase
    .from('tickets').select('metodo_pago, total, empleado_id, perfiles(nombre)').eq('caja_id', cajaId)
  if (error) throw error
  return data
}

// ─── TICKETS ─────────────────────────────────────────────────
export async function crearTicket(payload) {
  const { data, error } = await supabase.rpc('crear_ticket', {
    p_caja_id:     payload.cajaId,
    p_caseta_id:   payload.casetaId,
    p_empleado_id: payload.empleadoId,
    p_metodo_pago: payload.metodoPago,
    p_total:       payload.total,
    p_dinero_dado: payload.dineroDado,
    p_cambio:      payload.cambio,
    p_items:       payload.items,
  })
  if (error) throw error
  return data
}

export async function getTicketsTurno(cajaId) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*, ticket_items(id, producto_id, nombre_producto, precio_unitario, cantidad, total_linea, con_oferta), perfiles(nombre)')
    .eq('caja_id', cajaId).order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function getTicketsPorRango(casetaId, desde, hasta) {
  const { data, error } = await supabase
    .from('tickets')
    .select('*, ticket_items(id, cantidad, total_linea, nombre_producto, producto_id, precio_unitario), perfiles(nombre), casetas(nombre)')
    .eq('caseta_id', casetaId).gte('creado_en', desde).lte('creado_en', hasta)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function getTicketsAdmin(desde, hasta, casetaId) {
  let q = supabase.from('tickets')
    .select('*, ticket_items(id, cantidad, total_linea, nombre_producto, producto_id, precio_unitario), casetas(nombre), perfiles(nombre)')
    .order('creado_en', { ascending: false }).limit(200)
  if (desde) q = q.gte('creado_en', desde)
  if (hasta) q = q.lte('creado_en', hasta)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function deleteTicket(id) {
  const { error } = await supabase.from('tickets').delete().eq('id', id)
  if (error) throw error
}

// Editar ticket: reemplaza items y recalcula total
export async function updateTicket(ticketId, nuevoTotal, nuevosItems) {
  const { error: e1 } = await supabase.from('ticket_items').delete().eq('ticket_id', ticketId)
  if (e1) throw e1
  if (nuevosItems.length > 0) {
    const items = nuevosItems.map(i => ({
      ticket_id:       ticketId,
      producto_id:     i.producto_id,
      nombre_producto: i.nombre || i.nombre_producto,
      precio_unitario: i.precio || i.precio_unitario,
      cantidad:        i.cantidad,
      total_linea:     i.total_linea,
      con_oferta:      i.con_oferta || false,
    }))
    const { error: e2 } = await supabase.from('ticket_items').insert(items)
    if (e2) throw e2
  }
  const { error: e3 } = await supabase.from('tickets').update({ total: nuevoTotal }).eq('id', ticketId)
  if (e3) throw e3
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
    .select('*, casetas(nombre), perfiles(nombre), pedido_items(id, cantidad, cantidad_recibida, notas_item, productos(id, nombre, categoria))')
    .order('creado_en', { ascending: false })
  if (filtros.casetaId) q = q.eq('caseta_id', filtros.casetaId)
  if (filtros.estado)   q = q.eq('estado', filtros.estado)
  if (filtros.activos)  q = q.in('estado', ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO'])
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function crearPedido(casetaId, empleadoId, items, notas = '') {
  const { data: pedido, error: e1 } = await supabase.from('pedidos')
    .insert({ caseta_id: casetaId, empleado_id: empleadoId, notas, estado: 'PENDIENTE' })
    .select().single()
  if (e1) throw e1
  const filas = items.map(i => ({ pedido_id: pedido.id, producto_id: i.producto_id, cantidad: i.cantidad }))
  const { error: e2 } = await supabase.from('pedido_items').insert(filas)
  if (e2) throw e2
  return pedido
}

export async function updatePedido(pedidoId, cambios) {
  const { error } = await supabase.from('pedidos')
    .update({ ...cambios, actualizado_en: new Date().toISOString() }).eq('id', pedidoId)
  if (error) throw error
}

export async function updatePedidoItems(pedidoId, items) {
  const { error: e1 } = await supabase.from('pedido_items').delete().eq('pedido_id', pedidoId)
  if (e1) throw e1
  const filas = items.map(i => ({ pedido_id: pedidoId, producto_id: i.producto_id, cantidad: i.cantidad }))
  const { error: e2 } = await supabase.from('pedido_items').insert(filas)
  if (e2) throw e2
}

export async function confirmarRecepcionPedido(pedidoId, casetaId, itemsRecibidos, notas = '') {
  // Guarda cantidades recibidas e incidencias por item
  for (const item of itemsRecibidos) {
    await supabase.from('pedido_items')
      .update({ cantidad_recibida: item.cantidad_recibida, notas_item: item.notas_item || null })
      .eq('id', item.id)
  }

  const hayIncidencia = itemsRecibidos.some(i =>
    (i.notas_item && i.notas_item.trim() !== '') ||
    i.cantidad_recibida !== i.cantidad
  )

  await supabase.from('pedidos').update({
    estado: hayIncidencia ? 'INCIDENCIA' : 'RECIBIDO',
    notas: notas || null,
    actualizado_en: new Date().toISOString(),
  }).eq('id', pedidoId)

  // Sumar stock recibido
  for (const item of itemsRecibidos) {
    const cant = item.cantidad_recibida ?? item.cantidad
    if (cant <= 0) continue
    const { data: existing } = await supabase.from('stock')
      .select('cantidad').eq('producto_id', item.producto_id).eq('caseta_id', casetaId).maybeSingle()
    if (existing) {
      await supabase.from('stock')
        .update({ cantidad: existing.cantidad + cant })
        .eq('producto_id', item.producto_id).eq('caseta_id', casetaId)
    } else {
      await supabase.from('stock').insert({ producto_id: item.producto_id, caseta_id: casetaId, cantidad: cant })
    }
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

export async function crearInventario(casetaId, empleadoId, items) {
  const { data: inv, error: e1 } = await supabase.from('inventarios')
    .insert({ caseta_id: casetaId, empleado_id: empleadoId, estado: 'BORRADOR' })
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

export async function confirmarInventario(inventarioId) {
  const { error } = await supabase.rpc('aplicar_inventario', { p_inventario_id: inventarioId })
  if (error) throw error
}

// ─── STATS ADMIN ─────────────────────────────────────────────
export async function getStatsAdmin() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const [ticketsRes, stockBajoRes, stockCeroRes, productosRes, casetasRes] = await Promise.all([
    supabase.from('tickets').select('total, metodo_pago, casetas(nombre)').gte('creado_en', hoy.toISOString()),
    supabase.from('stock').select('cantidad, productos!inner(nombre, categoria, activo), casetas(id, nombre)')
      .eq('productos.activo', true).gt('cantidad', 0).lt('cantidad', 10),
    supabase.from('stock').select('cantidad, productos!inner(nombre, categoria, activo), casetas(id, nombre)')
      .eq('productos.activo', true).eq('cantidad', 0),
    supabase.from('productos').select('id, nombre, categoria').eq('activo', true),
    supabase.from('casetas').select('id, nombre'),
  ])
  const { data: stockTodo } = await supabase.from('stock').select('producto_id, caseta_id')
  const stockSet = new Set((stockTodo || []).map(s => `${s.producto_id}__${s.caseta_id}`))
  const casetas = casetasRes.data || []
  const productos = productosRes.data || []
  const sinFila = []
  for (const p of productos) {
    for (const c of casetas) {
      if (!stockSet.has(`${p.id}__${c.id}`)) {
        sinFila.push({ cantidad: 0, productos: { nombre: p.nombre, categoria: p.categoria }, casetas: { id: c.id, nombre: c.nombre } })
      }
    }
  }
  return {
    tickets:   ticketsRes.data || [],
    stockBajo: stockBajoRes.data || [],
    stockCero: [...(stockCeroRes.data || []), ...sinFila],
  }
}

export async function getVentasPorDia(casetaId, año, mes) {
  const desde = new Date(año, mes - 1, 1).toISOString()
  const hasta = new Date(año, mes, 0, 23, 59, 59).toISOString()
  let q = supabase.from('tickets').select('total, metodo_pago, creado_en')
    .gte('creado_en', desde).lte('creado_en', hasta)
  if (casetaId) q = q.eq('caseta_id', casetaId)
  const { data, error } = await q
  if (error) throw error
  const porDia = {}
  ;(data || []).forEach(t => {
    const dia = t.creado_en.slice(0, 10)
    if (!porDia[dia]) porDia[dia] = { efectivo: 0, tarjeta: 0, tickets: 0 }
    porDia[dia].tickets++
    if (t.metodo_pago === 'efectivo') porDia[dia].efectivo += t.total
    else porDia[dia].tarjeta += t.total
  })
  return porDia
}
