// api/admin/ventas.js
import { supabase } from '../_supabase.js'
import { requireAdmin, cors, ok, err } from '../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        id, metodo_pago, total, created_at,
        usuarios(nombre),
        casetas(nombre),
        ticket_items(cantidad)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    const ventas = (data || []).map(v => ({
      id: v.id,
      metodo_pago: v.metodo_pago,
      total: parseFloat(v.total),
      created_at: v.created_at,
      empleado_nombre: v.usuarios?.nombre,
      caseta_nombre: v.casetas?.nombre,
      num_items: (v.ticket_items || []).reduce((s, i) => s + i.cantidad, 0),
    }))
    ok(res, ventas)
  } catch (e) { err(res, e) }
}
