// api/caja/cerrar.js
import { supabase } from '../_supabase.js'
import { requireAuth, cors, ok, err } from '../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()
  try {
    await requireAuth(req)
    const { caja_id, contado } = req.body

    const { error } = await supabase
      .from('cajas')
      .update({ estado: 'cerrada', cerrado_en: new Date().toISOString(), contado_cierre: contado })
      .eq('id', caja_id)

    if (error) throw error
    ok(res, { ok: true })
  } catch (e) { err(res, e) }
}
