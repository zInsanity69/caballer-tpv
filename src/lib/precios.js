// Calcula el precio total de una línea aplicando packs exactos.
// Las ofertas se aplican de mayor a menor pack (greedy).
// El resto que no completa ningún pack va a precio normal.
//
// Ejemplo: oferta 4x5€ y 10x10€. Cliente lleva 22 unidades.
//   → 2 packs de 10 = 20u a 10€/pack = 20€
//   → 2 restantes a precio normal (1€/u) = 2€
//   → Total: 22€  (en vez de 44€ a precio normal)

export function calcularPrecio(productoId, cantidad, precioBase, ofertas) {
  const ofertasProducto = (ofertas || [])
    .filter(o => o.producto_id === productoId && o.activa !== false)
    .sort((a, b) => b.cantidad_pack - a.cantidad_pack) // mayor primero

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
      const coste = nPacks * oferta.precio_pack
      total += coste
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
    total: redondear(total),
    desglose: hayOferta ? desglose : null,
  }
}

export function calcularTotalTicket(items, ofertas) {
  return items.reduce((sum, item) => {
    const { total } = calcularPrecio(item.id, item.cantidad, item.precio, ofertas)
    return sum + total
  }, 0)
}

function redondear(n) {
  return Math.round(n * 100) / 100
}

export const fmt = n =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

export const fmtSinSimbolo = n =>
  n.toFixed(2).replace('.', ',')
