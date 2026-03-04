import { supabase } from './supabase.js'

// ─── AUTH ────────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*, casetas(id, nombre)')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

// ─── PRODUCTOS ───────────────────────────────────────────────
export async function getProductos() {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .order('categoria')
    .order('nombre')
  if (error) throw error
  return data
}

export async function getProductoByEan(ean) {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('codigo_ean', ean)
    .eq('activo', true)
    .single()
  if (error) return null
  return data
}

export async function upsertProducto(producto) {
  const { data, error } = await supabase
    .from('productos')
    .upsert(producto, { onConflict: 'id' })
    .select()
    .single()
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

// ─── STOCK ───────────────────────────────────────────────────
export async function getStockCaseta(casetaId) {
  const { data, error } = await supabase
    .from('stock')
    .select('producto_id, cantidad')
    .eq('caseta_id', casetaId)
  if (error) throw error
  // Devolver como map { producto_id -> cantidad }
  return Object.fromEntries(data.map(s => [s.producto_id, s.cantidad]))
}

export async function setStock(productoId, casetaId, cantidad) {
  const { error } = await supabase
    .from('stock')
    .upsert({ producto_id: productoId, caseta_id: casetaId, cantidad }, { onConflict: 'producto_id,caseta_id' })
  if (error) throw error
}

// ─── OFERTAS ─────────────────────────────────────────────────
export async function getOfertas() {
  const { data, error } = await supabase
    .from('ofertas')
    .select('*')
    .eq('activa', true)
    .order('producto_id')
    .order('cantidad_pack')
  if (error) throw error
  return data
}

export async function upsertOferta(oferta) {
  const { data, error } = await supabase
    .from('ofertas')
    .upsert(oferta, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteOferta(id) {
  const { error } = await supabase.from('ofertas').delete().eq('id', id)
  if (error) throw error
}

// ─── CASETAS ─────────────────────────────────────────────────
export async function getCasetas() {
  const { data, error } = await supabase
    .from('casetas')
    .select('*')
    .order('nombre')
  if (error) throw error
  return data
}

// ─── USUARIOS / PERFILES ─────────────────────────────────────
export async function getPerfiles() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*, casetas(nombre)')
    .order('nombre')
  if (error) throw error
  return data
}

export async function crearUsuario(email, password, perfil) {
  // Crear usuario en Auth (solo admins via service role, aquí usamos signUp con confirmación)
  const { data: authData, error: authError } = await supabase.auth.admin
    ? await supabase.auth.admin.createUser({ email, password, email_confirm: true })
    : { data: null, error: new Error('Necesitas service_role key para crear usuarios') }

  if (authError) throw authError

  const userId = authData.user.id
  const { error: perfilError } = await supabase
    .from('perfiles')
    .insert({ id: userId, ...perfil })
  if (perfilError) throw perfilError
  return userId
}

export async function updatePerfil(id, cambios) {
  const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
  if (error) throw error
}

// ─── CAJA ────────────────────────────────────────────────────
export async function getCajaAbierta(casetaId) {
  const { data, error } = await supabase
    .from('cajas')
    .select('*, perfiles!abierta_por(nombre)')
    .eq('caseta_id', casetaId)
    .eq('estado', 'ABIERTA')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function abrirCaja(casetaId, empleadoId, aperturaDinero) {
  // Verificar que no haya ya una caja abierta
  const existente = await getCajaAbierta(casetaId)
  if (existente) return existente

  const { data, error } = await supabase
    .from('cajas')
    .insert({
      caseta_id: casetaId,
      abierta_por: empleadoId,
      apertura_dinero: aperturaDinero,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cerrarCaja(cajaId, empleadoId, dineroContado) {
  const { error } = await supabase
    .from('cajas')
    .update({
      estado: 'CERRADA',
      cerrada_por: empleadoId,
      cerrada_en: new Date().toISOString(),
      dinero_contado: dineroContado,
    })
    .eq('id', cajaId)
  if (error) throw error
}

export async function getResumenCaja(cajaId) {
  const { data, error } = await supabase
    .from('tickets')
    .select('metodo_pago, total, empleado_id, perfiles(nombre)')
    .eq('caja_id', cajaId)
  if (error) throw error
  return data
}

// ─── TICKETS ─────────────────────────────────────────────────
export async function crearTicket(payload) {
  // Usa la función SQL que hace todo en una transacción atómica
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
  return data // ticket_id
}

export async function getTicketsHoy(casetaId) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('tickets')
    .select('*, perfiles(nombre)')
    .eq('caseta_id', casetaId)
    .gte('creado_en', hoy.toISOString())
    .order('creado_en', { ascending: false })
  if (error) throw error
  return data
}

export async function getTicketsAdmin() {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('tickets')
    .select('*, casetas(nombre), perfiles(nombre)')
    .gte('creado_en', hoy.toISOString())
    .order('creado_en', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

// ─── STATS ADMIN ─────────────────────────────────────────────
export async function getStatsAdmin() {
  const hoy = new Date(); hoy.setHours(0,0,0,0)

  const [ticketsRes, stockBajoRes] = await Promise.all([
    supabase
      .from('tickets')
      .select('total, metodo_pago, casetas(nombre)')
      .gte('creado_en', hoy.toISOString()),
    supabase
      .from('stock')
      .select('cantidad, productos(nombre, categoria), casetas(nombre)')
      .lt('cantidad', 10),
  ])

  return {
    tickets: ticketsRes.data || [],
    stockBajo: stockBajoRes.data || [],
  }
}
