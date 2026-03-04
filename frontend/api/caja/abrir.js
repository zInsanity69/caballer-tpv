// api/caja/abrir.js
import { supabase } from '../_supabase.js'
import { requireAuth, cors, ok, err } from '../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const usuario = await requireAuth(req)
    const { caseta_id, apertura } = req.body

    // Verificar que no haya caja abierta
    const { data: existe } = await supabase
      .from('cajas')
      .select('id')
      .eq('caseta_id', caseta_id)
      .eq('estado', 'abierta')
      .maybeSingle()

    if (existe) throw { status: 409, message: 'Ya hay una caja abierta en esta caseta' }

    const { data, error } = await supabase
      .from('cajas')
      .insert({ caseta_id, abierto_por: usuario.id, apertura: apertura || 0 })
      .select()
      .single()

    if (error) throw error

    // Devolver en formato vista_caja_activa
    ok(res, {
      caja_id: data.id,
      caseta_id: data.caseta_id,
      apertura: data.apertura,
      abierto_en: data.abierto_en,
      abierto_por: usuario.nombre,
      num_tickets: 0,
      total_efectivo: 0,
      total_tarjeta: 0,
      total_ventas: 0,
    })
  } catch (e) { err(res, e) }
}
