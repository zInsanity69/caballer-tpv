// ─── PUENTE CON EL AGENTE DE IMPRESIÓN LOCAL (Plan B, Linux) ───────────────
// En Linux el navegador no consigue imprimir en las térmicas de 80 mm (el driver
// CUPS no marca el papel). Aquí renderizamos el ticket a imagen y lo mandamos al
// agente local (print-agent/agente.py), que lo imprime en ESC/POS "raster" en
// crudo, saltándose el driver. En Windows el agente no está → se usa el navegador.
import html2canvas from 'html2canvas'

const AGENTE_URL = 'http://127.0.0.1:9911'
const ANCHO_DOTS = 576 // puntos de ancho de una térmica de 80 mm

// Estado cacheado: se comprueba al arrancar la app (comprobarAgente). Así
// imprimirTicket decide la vía de forma SÍNCRONA y no rompe el gesto del clic
// que necesita window.open en el método del navegador.
let agenteActivo = false
export function agenteEstaActivo() { return agenteActivo }
export async function comprobarAgente() {
  agenteActivo = await agenteDisponible()
  return agenteActivo
}

// ¿Está vivo el agente local? (rápido, con timeout; si no, false)
export async function agenteDisponible() {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 700)
    const r = await fetch(AGENTE_URL + '/status', { signal: c.signal, cache: 'no-store' })
    clearTimeout(t)
    return r.ok
  } catch { return false }
}

// SVG (string) → PNG data-URL, rasterizado a un ancho concreto (nítido).
// Se hace nativo (Image + canvas), que es fiable para un SVG suelto; así el
// logo y el código de barras salen seguro (html2canvas a veces falla con SVG).
export function svgToPng(svgString, renderW) {
  return new Promise((resolve) => {
    try {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const iw = img.naturalWidth || img.width || renderW
        const ih = img.naturalHeight || img.height || Math.round(renderW * 0.3)
        const w = renderW, h = Math.max(1, Math.round(w * (ih / iw)))
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        const ctx = cv.getContext('2d')
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(cv.toDataURL('image/png'))
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      img.src = url
    } catch { resolve(null) }
  })
}

// Canvas monocromo → bytes ESC/POS (GS v 0), en bandas para máxima compatibilidad.
function canvasAEscpos(canvas) {
  const w = canvas.width, h = canvas.height
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data
  const bpr = Math.ceil(w / 8)
  const raster = new Uint8Array(bpr * h)
  for (let y = 0; y < h; y++) {
    const row = y * bpr
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const a = px[i + 3]
      const lum = a < 8 ? 255 : (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114)
      if (lum < 128) raster[row + (x >> 3)] |= (0x80 >> (x & 7))
    }
  }
  const out = [0x1b, 0x40] // ESC @ init
  const BAND = 128
  for (let y0 = 0; y0 < h; y0 += BAND) {
    const bh = Math.min(BAND, h - y0)
    out.push(0x1d, 0x76, 0x30, 0x00, bpr & 0xff, (bpr >> 8) & 0xff, bh & 0xff, (bh >> 8) & 0xff)
    const off = y0 * bpr
    for (let k = 0; k < bh * bpr; k++) out.push(raster[off + k])
  }
  out.push(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00) // avance + corte
  return new Uint8Array(out)
}

// Renderiza el HTML del ticket a un canvas de ANCHO_DOTS de ancho.
async function ticketACanvas(html) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:80mm;height:10px;border:0;'
  document.body.appendChild(iframe)
  try {
    const doc = iframe.contentDocument
    doc.open(); doc.write(html); doc.close()
    // Esperar a que carguen las imágenes (logo/barcode PNG) y el layout
    await new Promise(res => {
      let n = 0
      const done = () => res()
      if (doc.readyState === 'complete') { setTimeout(done, 80); return }
      iframe.onload = () => setTimeout(done, 80)
      const iv = setInterval(() => { if (++n > 20 || doc.readyState === 'complete') { clearInterval(iv); setTimeout(done, 80) } }, 50)
    })
    const body = doc.body
    const cssW = body.scrollWidth || Math.round(iframe.clientWidth) || 302
    const scale = ANCHO_DOTS / cssW
    const canvas = await html2canvas(body, {
      backgroundColor: '#ffffff', scale, width: cssW, windowWidth: cssW, logging: false, useCORS: true,
    })
    return canvas
  } finally {
    document.body.removeChild(iframe)
  }
}

// Imprime el HTML del ticket a través del agente. Lanza error si falla.
export async function imprimirHtmlPorAgente(html) {
  const canvas = await ticketACanvas(html)
  const bytes = canvasAEscpos(canvas)
  const r = await fetch(AGENTE_URL + '/print', {
    method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream' },
  })
  const j = await r.json().catch(() => ({ ok: r.ok }))
  if (!j.ok) throw new Error(j.msg || 'El agente no pudo imprimir')
  return true
}
