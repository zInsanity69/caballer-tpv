// api/admin/usuarios/index.js
import { supabase } from '../../_supabase.js'
import { requireAdmin, cors, ok, err } from '../../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('usuarios').select('id, nombre, email, rol, caseta_id, activo, created_at').order('rol').order('nombre')
      if (error) throw error
      return ok(res, data)
    }

    if (req.method === 'POST') {
      const { nombre, email, password, rol, caseta_id } = req.body

      // Crear usuario en Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true
      })
      if (authErr) throw { status: 400, message: authErr.message }

      // Crear perfil en tabla usuarios
      const { data, error } = await supabase.from('usuarios')
        .insert({ id: authData.user.id, nombre, email, rol, caseta_id: caseta_id || null })
        .select().single()
      if (error) throw error

      return ok(res, data, 201)
    }

    res.status(405).end()
  } catch (e) { err(res, e) }
}
