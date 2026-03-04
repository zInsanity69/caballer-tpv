// api/admin/ofertas/[id].js
import { supabase } from '../../_supabase.js'
import { requireAdmin, cors, ok, err } from '../../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)
    const id = parseInt(req.query.id)

    if (req.method === 'PUT') {
      const { producto_id, etiqueta, cantidad_pack, precio_pack } = req.body
      const { data, error } = await supabase.from('ofertas').update({ producto_id, etiqueta, cantidad_pack, precio_pack }).eq('id', id).select().single()
      if (error) throw error
      return ok(res, { ...data, precio_pack: parseFloat(data.precio_pack) })
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('ofertas').delete().eq('id', id)
      if (error) throw error
      return ok(res, { ok: true })
    }

    res.status(405).end()
  } catch (e) { err(res, e) }
}
