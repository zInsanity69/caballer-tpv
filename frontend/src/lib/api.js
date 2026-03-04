// lib/api.js — Todas las llamadas al backend Vercel API
const BASE = '/api'

async function req(method, path, body) {
  const token = localStorage.getItem('tpv_token')
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

export const api = {
  // AUTH
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  me:    ()                 => req('GET',  '/auth/me'),

  // CATALOGO
  productos: (casetaId) => req('GET', `/productos?caseta_id=${casetaId}`),
  ofertas:   ()         => req('GET', '/ofertas'),

  // CAJA
  cajaActiva:  (casetaId) => req('GET',  `/caja/activa?caseta_id=${casetaId}`),
  abrirCaja:   (casetaId, apertura) => req('POST', '/caja/abrir', { caseta_id: casetaId, apertura }),
  cerrarCaja:  (cajaId, contado)    => req('POST', '/caja/cerrar', { caja_id: cajaId, contado }),

  // VENTAS
  crearTicket: (payload) => req('POST', '/tickets', payload),

  // ADMIN
  admin: {
    stats:           ()             => req('GET',  '/admin/stats'),
    productos:       ()             => req('GET',  '/admin/productos'),
    crearProducto:   (p)            => req('POST', '/admin/productos', p),
    editarProducto:  (id, p)        => req('PUT',  `/admin/productos/${id}`, p),
    toggleProducto:  (id, activo)   => req('PATCH',`/admin/productos/${id}`, { activo }),
    eliminarProducto:(id)           => req('DELETE',`/admin/productos/${id}`),

    ofertas:         ()             => req('GET',  '/admin/ofertas'),
    crearOferta:     (o)            => req('POST', '/admin/ofertas', o),
    editarOferta:    (id, o)        => req('PUT',  `/admin/ofertas/${id}`, o),
    eliminarOferta:  (id)           => req('DELETE',`/admin/ofertas/${id}`),

    usuarios:        ()             => req('GET',  '/admin/usuarios'),
    crearUsuario:    (u)            => req('POST', '/admin/usuarios', u),
    editarUsuario:   (id, u)        => req('PUT',  `/admin/usuarios/${id}`, u),
    toggleUsuario:   (id, activo)   => req('PATCH',`/admin/usuarios/${id}`, { activo }),

    casetas:         ()             => req('GET',  '/admin/casetas'),
    ventasRecientes: ()             => req('GET',  '/admin/ventas'),
  }
}
