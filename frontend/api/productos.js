// api/productos.js
import { supabase } from './_supabase.js'
import { requireAuth, cors, ok, err } from './_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAuth(req)
    const caseta_id = parseInt(req.query.caseta_id)
    if (!caseta_id) throw { status: 400, message: 'caseta_id requerido' }

    const { data, error } = await supabase
      .from('productos')
      .select(`
        id, nombre, precio, categoria, edad_minima, codigo_ean, activo,
        stock_por_caseta!inner(cantidad)
      `)
      .eq('activo', true)
      .eq('stock_por_caseta.caseta_id', caseta_id)
      .order('categoria')
      .order('nombre')

    if (error) throw error

    const productos = data.map(p => ({
      id: p.id,
      nombre: p.nombre,
      precio: parseFloat(p.precio),
      categoria: p.categoria,
      edad_minima: p.edad_minima,
      codigo_ean: p.codigo_ean,
      activo: p.activo,
      stock_caseta: p.stock_por_caseta[0]?.cantidad ?? 0,
    }))

    ok(res, productos)
  } catch (e) { err(res, e) }
}
