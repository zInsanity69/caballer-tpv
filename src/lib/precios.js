// ─── LÓGICA DE PRECIOS Y OFERTAS ─────────────────────────────
//
// Tipos de oferta:
//   'pack'      → N unidades del mismo producto por X€
//   'combinada' → mezcla de productos distintos por X€
//
// Las ofertas pack se aplican greedy (mayor primero).
// El resto sin cubrir va a precio normal.

export function calcularPrecio(productoId, cantidad, precioBase, ofertas) {
  const ofertasProducto = (ofertas || [])
    .filter(o => o.producto_id === productoId && o.activa !== false && o.tipo !== 'combinada')
    .sort((a, b) => b.cantidad_pack - a.cantidad_pack)

  if (!ofertasProducto.length) {
    return { total: redondear(precioBase * cantidad), desglose: null }
  }

  let restante = cantidad
  let total = 0
  const desglose = []

  for (const oferta of ofertasProducto) {
    if (restante <= 0) break
    const nPacks = Math.floor(restante / oferta.cantidad_pack)
    if (nPacks > 0) {
      const unidades = nPacks * oferta.cantidad_pack
      const coste    = nPacks * oferta.precio_pack
      total   += coste
      restante -= unidades
      desglose.push({
        tipo: 'pack',
        etiqueta: oferta.etiqueta,
        packs: nPacks,
        unidades,
        coste,
        precioU: oferta.precio_pack / oferta.cantidad_pack,
      })
    }
  }

  if (restante > 0) {
    const coste = redondear(restante * precioBase)
    total += coste
    desglose.push({
      tipo: 'normal',
      etiqueta: 'Precio normal',
      packs: null,
      unidades: restante,
      coste,
      precioU: precioBase,
    })
  }

  const hayOferta = desglose.some(d => d.tipo === 'pack')
  return {
    total:    redondear(total),
    desglose: hayOferta ? desglose : null,
  }
}

export function calcularTotalTicket(items, ofertas) {
  // Cantidades disponibles por producto (se irán consumiendo con las combinadas)
  const restante = new Map(items.map(i => [i.id, i.cantidad]))

  let total = 0

  // 1. Aplicar ofertas combinadas consumiendo unidades.
  //    Cada combinada se aplica tantas veces como permitan las cantidades y
  //    consume los productos para que no se cuenten dos veces.
  const combinadas = (ofertas || []).filter(o => o.tipo === 'combinada' && o.activa !== false)
  for (const oferta of combinadas) {
    const veces = vecesAplicables(oferta, restante)
    if (veces <= 0) continue
    for (const req of oferta.productos_requeridos) {
      restante.set(req.producto_id, (restante.get(req.producto_id) || 0) - req.cantidad * veces)
    }
    total += oferta.precio_pack * veces
  }

  // 2. Las unidades restantes se cobran con sus ofertas pack / precio normal.
  for (const item of items) {
    const q = restante.get(item.id) || 0
    if (q <= 0) continue
    const { total: t } = calcularPrecio(item.id, q, item.precio, ofertas)
    total += t
  }

  return redondear(total)
}

// Nº de veces que una oferta combinada puede aplicarse dadas las cantidades
// disponibles. `cantidades` puede ser un Map(producto_id -> cantidad) o la lista
// de items del ticket.
export function vecesAplicables(oferta, cantidades) {
  const reqs = oferta.productos_requeridos
  if (!reqs || !reqs.length) return 0
  const disp = cantidades instanceof Map
    ? cantidades
    : new Map((cantidades || []).map(i => [i.id, i.cantidad]))
  let veces = Infinity
  for (const req of reqs) {
    veces = Math.min(veces, Math.floor((disp.get(req.producto_id) || 0) / req.cantidad))
  }
  return Number.isFinite(veces) ? veces : 0
}

// Detecta ofertas combinadas que aplican al ticket actual (al menos 1 vez)
export function detectarOfertasCombinadas(items, ofertas) {
  const combinadas = (ofertas || []).filter(o => o.tipo === 'combinada' && o.activa !== false)
  return combinadas.filter(oferta => vecesAplicables(oferta, items) > 0)
}

function redondear(n) {
  return Math.round(n * 100) / 100
}

export const fmt = n =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

export const fmtSinSimbolo = n =>
  n.toFixed(2).replace('.', ',')
