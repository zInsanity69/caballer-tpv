// api/auth/login.js
import { supabase } from '../_supabase.js'
import { cors, ok, err } from '../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { email, password } = req.body

    // Autenticar con Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw { status: 401, message: 'Credenciales incorrectas' }

    // Obtener perfil
    const { data: perfil, error: e2 } = await supabase
      .from('usuarios')
      .select('*, casetas(nombre)')
      .eq('id', data.user.id)
      .eq('activo', true)
      .single()

    if (e2 || !perfil) throw { status: 401, message: 'Usuario no encontrado o inactivo' }

    ok(res, {
      token: data.session.access_token,
      usuario: {
        id: perfil.id,
        nombre: perfil.nombre,
        email: perfil.email,
        rol: perfil.rol,
        caseta_id: perfil.caseta_id,
        caseta_nombre: perfil.casetas?.nombre,
      }
    })
  } catch (e) { err(res, e) }
}
