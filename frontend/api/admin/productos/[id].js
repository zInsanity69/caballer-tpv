// api/admin/productos/[id].js — PUT editar, PATCH toggle, DELETE eliminar
import { supabase } from '../../_supabase.js'
import { requireAdmin, cors, ok, err } from '../../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)
    const id = parseInt(req.query.id)

    if (req.method === 'PUT') {
      const { nombre, precio, categoria, edad_minima, codigo_ean, activo } = req.body
      const { data, error } = await supabase.from('productos').update({ nombre, precio, categoria, edad_minima, codigo_ean, activo }).eq('id', id).select().single()
      if (error) throw error
      return ok(res, { ...data, precio: parseFloat(data.precio) })
    }

    if (req.method === 'PATCH') {
      const { activo } = req.body
      const { data, error } = await supabase.from('productos').update({ activo }).eq('id', id).select().single()
      if (error) throw error
      return ok(res, data)
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('productos').delete().eq('id', id)
      if (error) throw error
      return ok(res, { ok: true })
    }

    res.status(405).end()
  } catch (e) { err(res, e) }
}
