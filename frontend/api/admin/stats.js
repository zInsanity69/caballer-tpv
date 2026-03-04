// api/admin/stats.js
import { supabase } from '../_supabase.js'
import { requireAdmin, cors, ok, err } from '../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAdmin(req)
    const hoy = new Date(); hoy.setHours(0,0,0,0)

    const [tickets, stockBajo, casetas, empleados, ofertas] = await Promise.all([
      supabase.from('tickets').select('total, metodo_pago').gte('created_at', hoy.toISOString()),
      supabase.from('stock_por_caseta').select('cantidad, productos(nombre), casetas(nombre)').lt('cantidad', 15).eq('productos.activo', true),
      supabase.from('casetas').select('id').eq('activa', true),
      supabase.from('usuarios').select('id').eq('rol', 'EMPLEADO').eq('activo', true),
      supabase.from('ofertas').select('id').eq('activa', true),
    ])

    const total_hoy = (tickets.data || []).reduce((s, t) => s + parseFloat(t.total), 0)

    const stock_critico = (stockBajo.data || [])
      .filter(s => s.productos && s.casetas)
      .map(s => ({ nombre: s.productos.nombre, caseta_nombre: s.casetas.nombre, cantidad: s.cantidad }))
      .sort((a, b) => a.cantidad - b.cantidad)
      .slice(0, 10)

    ok(res, {
      total_hoy,
      tickets_hoy: tickets.data?.length || 0,
      stock_bajo: stockBajo.data?.length || 0,
      casetas_activas: casetas.data?.length || 0,
      empleados_activos: empleados.data?.length || 0,
      ofertas_activas: ofertas.data?.length || 0,
      stock_critico,
    })
  } catch (e) { err(res, e) }
}
