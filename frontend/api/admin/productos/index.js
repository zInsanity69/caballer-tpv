// api/admin/productos/index.js — GET todos, POST crear
import { supabase } from '../../_supabase.js'
import { requireAdmin, cors, ok, err } from '../../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('productos').select('*').order('categoria').order('nombre')
      if (error) throw error
      return ok(res, data.map(p => ({ ...p, precio: parseFloat(p.precio) })))
    }

    if (req.method === 'POST') {
      const { nombre, precio, categoria, edad_minima, codigo_ean } = req.body
      const { data, error } = await supabase.from('productos').insert({ nombre, precio, categoria, edad_minima, codigo_ean }).select().single()
      if (error) throw error

      // Crear stock en todas las casetas
      const { data: casetas } = await supabase.from('casetas').select('id').eq('activa', true)
      if (casetas?.length) {
        await supabase.from('stock_por_caseta').insert(casetas.map(c => ({ producto_id: data.id, caseta_id: c.id, cantidad: 0 })))
      }
      return ok(res, { ...data, precio: parseFloat(data.precio) }, 201)
    }

    res.status(405).end()
  } catch (e) { err(res, e) }
}
