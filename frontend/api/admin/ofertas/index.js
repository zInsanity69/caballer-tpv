// api/admin/ofertas/index.js
import { supabase } from '../../_supabase.js'
import { requireAdmin, cors, ok, err } from '../../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('ofertas').select('*').order('producto_id')
      if (error) throw error
      return ok(res, data.map(o => ({ ...o, precio_pack: parseFloat(o.precio_pack) })))
    }

    if (req.method === 'POST') {
      const { producto_id, etiqueta, cantidad_pack, precio_pack } = req.body
      const { data, error } = await supabase.from('ofertas').insert({ producto_id, etiqueta, cantidad_pack, precio_pack }).select().single()
      if (error) throw error
      return ok(res, { ...data, precio_pack: parseFloat(data.precio_pack) }, 201)
    }

    res.status(405).end()
  } catch (e) { err(res, e) }
}
