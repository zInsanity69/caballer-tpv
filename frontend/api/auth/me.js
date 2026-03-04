// api/auth/me.js
import { requireAuth, cors, ok, err } from '../_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    const usuario = await requireAuth(req)
    ok(res, usuario)
  } catch (e) { err(res, e) }
}
