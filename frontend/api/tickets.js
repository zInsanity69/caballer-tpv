// api/tickets.js
import { supabase } from './_supabase.js'
import { requireAuth, cors, ok, err } from './_auth.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const usuario = await requireAuth(req)
    const { caseta_id, caja_id, metodo_pago, total, cambio, items } = req.body

    if (!items?.length) throw { status: 400, message: 'El ticket no tiene artículos' }

    // 1. Descontar stock atómicamente (función SQL con bloqueo de fila)
    const stockItems = items.map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad }))
    const { error: stockErr } = await supabase.rpc('descontar_stock', {
      p_caseta_id: caseta_id,
      p_items: stockItems
    })
    if (stockErr) throw { status: 409, message: stockErr.message || 'Stock insuficiente' }

    // 2. Crear ticket
    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .insert({ caseta_id, caja_id, empleado_id: usuario.id, metodo_pago, total, cambio })
      .select()
      .single()
    if (tErr) throw tErr

    // 3. Insertar items del ticket
    const ticketItems = items.map(i => ({
      ticket_id: ticket.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unit: i.precio_unit,
      precio_total: i.precio_total,
      con_oferta: i.con_oferta || false,
    }))
    const { error: iErr } = await supabase.from('ticket_items').insert(ticketItems)
    if (iErr) throw iErr

    ok(res, { ticket_id: ticket.id, ok: true })
  } catch (e) { err(res, e) }
}
