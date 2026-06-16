// ─── REGLAS LEGALES DE NEC POR DIVISIÓN (ITC nº 17, RD 989/2015) ──────────
// Única fuente de verdad de los topes legales. Si cambia la normativa, se toca aquí.
//
// En punto de venta al público solo se permiten 1.3 y 1.4.
//   · 1.3G  -> máximo 20% del NEC reglamentado de la caseta.
//   · 1.4G/1.4S -> el resto (sin subtope propio, solo el total).
//   · 1.1/1.2 -> raras; tope combinado ~10% (tipo M) / ~15% (tipo N). Usamos 10% conservador.
//   · Venta máxima por comprador: 10 kg NEC.

export const DIVISIONES = ['1.1G', '1.2G', '1.3G', '1.4G', '1.4S']

// % máximo del NEC total de la caseta que puede ser de cada división (las no listadas: sin subtope)
export const TOPES_PCT = {
  '1.3G': 0.20,
  '1.1G': 0.10,
  '1.2G': 0.10,
}

// Venta máxima por comprador (kg NEC)
export const MAX_NEC_COMPRADOR = 10

/**
 * Evalúa el cumplimiento de NEC por división.
 * @param {object} porDivision  { '1.3G': kg, '1.4G': kg, ... }
 * @param {number} limiteKg     NEC total permitido en la caseta
 * @returns {{ total, limite, pctTotal, totalExcedido, divisiones: Array }}
 *   divisiones: [{ division, kg, maxKg, pct, excedido }]
 */
export function evaluarNEC(porDivision = {}, limiteKg = 0) {
  const total = Object.values(porDivision).reduce((s, k) => s + (k || 0), 0)
  const divisiones = Object.entries(TOPES_PCT).map(([division, pctMax]) => {
    const kg = porDivision[division] || 0
    const maxKg = limiteKg * pctMax
    return {
      division,
      kg,
      maxKg,
      pctMax,
      pct: maxKg > 0 ? (kg / maxKg) * 100 : 0,
      excedido: kg > maxKg + 1e-9,
    }
  }).filter(d => d.kg > 0 || d.division === '1.3G') // siempre mostramos 1.3G; el resto solo si hay
  return {
    total,
    limite: limiteKg,
    pctTotal: limiteKg > 0 ? (total / limiteKg) * 100 : 0,
    totalExcedido: total > limiteKg + 1e-9,
    divisiones,
  }
}
