// api/ofertas.js
import { supabase } from './_supabase.js'
import { requireAuth, cors, ok, err } from './_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    await requireAuth(req)
    const { data, error } = await supabase
      .from('ofertas')
      .select('*')
      .eq('activa', true)
      .order('producto_id')
    if (error) throw error
    ok(res, data)
  } catch (e) { err(res, e) }
}
