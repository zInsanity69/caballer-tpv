// api/admin/usuarios/[id].js
import { supabase } from '../../_supabase.js'
import { requireAdmin, cors, ok, err } from '../../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)
    const id = req.query.id

    if (req.method === 'PUT') {
      const { nombre, email, password, rol, caseta_id } = req.body
      const updates = { nombre, email, rol, caseta_id: caseta_id || null }
      const { data, error } = await supabase.from('usuarios').update(updates).eq('id', id).select().single()
      if (error) throw error

      // Cambiar contraseña si se proporcionó
      if (password) {
        await supabase.auth.admin.updateUserById(id, { password })
      }
      return ok(res, data)
    }

    if (req.method === 'PATCH') {
      const { activo } = req.body
      const { data, error } = await supabase.from('usuarios').update({ activo }).eq('id', id).select().single()
      if (error) throw error
      // También en auth si se desactiva
      if (!activo) await supabase.auth.admin.updateUserById(id, { ban_duration: '876600h' })
      else await supabase.auth.admin.updateUserById(id, { ban_duration: 'none' })
      return ok(res, data)
    }

    res.status(405).end()
  } catch (e) { err(res, e) }
}
