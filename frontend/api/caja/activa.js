// api/caja/activa.js
import { supabase } from '../_supabase.js'
import { requireAuth, cors, ok, err } from '../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAuth(req)
    const caseta_id = parseInt(req.query.caseta_id)
    if (!caseta_id) throw { status: 400, message: 'caseta_id requerido' }

    const { data, error } = await supabase
      .from('vista_caja_activa')
      .select('*')
      .eq('caseta_id', caseta_id)
      .maybeSingle()

    if (error) throw error
    ok(res, data) // null si no hay caja abierta
  } catch (e) { err(res, e) }
}
