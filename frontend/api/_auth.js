// api/_auth.js — verifica JWT y devuelve usuario
import { supabase } from './_supabase.js'

export async function requireAuth(req) {
  const auth = req.headers['authorization'] || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) throw { status: 401, message: 'No autorizado' }

  // Verificar token con Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw { status: 401, message: 'Token inválido o expirado' }

  // Obtener perfil del usuario
  const { data: perfil, error: e2 } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', user.id)
    .eq('activo', true)
    .single()

  if (e2 || !perfil) throw { status: 401, message: 'Usuario no encontrado o inactivo' }
  return perfil
}

export async function requireAdmin(req) {
  const user = await requireAuth(req)
  if (user.rol !== 'ADMIN') throw { status: 403, message: 'Acceso solo para administradores' }
  return user
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
}

export function ok(res, data, status = 200) {
  res.status(status).json(data)
}

export function err(res, e) {
  const status = e.status || 500
  const message = e.message || 'Error interno del servidor'
  console.error('[API Error]', message, e)
  res.status(status).json({ error: message })
}
