// ─── GENERADOR DE TIQUES / FACTURAS (única fuente de verdad) ──────────────
// Antes este código estaba duplicado en EmpleadoPanel y AdminPanel con formatos
// divergentes. Ahora vive aquí y lo importan ambos.
// Logo del tique: vector en blanco y negro. La impresora térmica es de 1 bit
// (solo negro/blanco), así que un SVG de alto contraste sale nítido en pantalla
// y en papel. Va inline (?raw) para no depender de cargar una imagen externa.
import logoSVG from '../assets/logo_caballer_monoV2.svg?raw'

// Configuración fiscal de la empresa (emisor)
export const CONFIG_EMPRESA = {
  nombre:      'Caballer',
  razonSocial: 'Eventos 2014 BN CABALLER',
  direccion:   'C/ Literato Gabriel Miró, 58 1-1 · 46008 VALENCIA',
  cif:         'B97703342',
  telefono:    '',
  web:         '',
  textoLegal:  'Es imprescindible presentar el ticket para cualquier reclamación. Solo se aceptan devoluciones de artículos defectuosos, en cuyo caso será por otro igual o similar.',
  iva:         21,
}

const fmtE = n => Number(n || 0).toFixed(2) + '€'
const fmtFecha = d =>
  `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ` +
  `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`

// Escapar texto que viene de la API / usuario para no romper el HTML del tique
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))

// ─── CÓDIGO DE BARRAS (Code128 B) ─────────────────────────────
// Autónomo, sin dependencias: genera un SVG de barras a partir del número de
// ticket para poder localizarlo escaneándolo con una pistola láser.
const CODE128_PATTERNS = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112']

export function barcodeSVG(text, { moduleWidth = 2, height = 60 } = {}) {
  const clean = String(text ?? '').replace(/[^\x20-\x7E]/g, '')
  if (!clean) return ''
  const values = [104]           // Start Code B
  let sum = 104
  for (let i = 0; i < clean.length; i++) {
    const v = clean.charCodeAt(i) - 32
    values.push(v)
    sum += v * (i + 1)
  }
  values.push(sum % 103)         // checksum
  values.push(106)               // stop
  let x = 0, rects = ''
  for (const v of values) {
    const pattern = CODE128_PATTERNS[v]
    let bar = true
    for (const ch of pattern) {
      const w = parseInt(ch, 10) * moduleWidth
      if (bar) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`
      x += w
      bar = !bar
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}" fill="#000" shape-rendering="crispEdges">${rects}</svg>`
}

/**
 * Genera el HTML imprimible de un tique o factura.
 * @param {object} datos  { items, total, metodo, cambio, dineroDado, descuento, descuentoPct, caseta, perfil, fecha, ticketNum }
 * @param {object} [opts] { esFactura: boolean, cliente: { razonSocial, cif, direccion } }
 */
export function generarTicketHTML(datos, opts = {}) {
  // Permite que esFactura/cliente vengan en las opciones (venta nueva) o en los
  // propios datos del ticket (reimpresión desde historial/admin).
  const esFactura = opts.esFactura ?? datos.esFactura ?? false
  const cliente = opts.cliente ?? datos.cliente ?? null
  const {
    items = [], total = 0, metodo, cambio = 0, dineroDado = 0,
    pagoEfectivo = 0, pagoTarjeta = 0,
    descuento = 0, descuentoPct = 0, fecha = new Date(), ticketNum = '',
  } = datos

  const barcode = ticketNum ? barcodeSVG(ticketNum) : ''
  const ahorroOfertas = items.reduce((s, i) => s + (i.precio * i.cantidad - i.total_linea), 0)
  const iva = CONFIG_EMPRESA.iva / 100
  const baseImponible = total / (1 + iva)
  const cuotaIva = total - baseImponible
  const totalNEC = items.reduce((s, i) => s + (i.gramos_polvora || 0) * i.cantidad, 0)

  // Bloque de empresa: tique normal = solo emisor; factura = emisor | cliente
  const bloqueEmpresa = esFactura ? `
  <div class="factura-titulo">FACTURA</div>
  <div class="dos-col">
    <div class="col-emisor">
      <div class="col-tit">EMISOR</div>
      <div>${esc(CONFIG_EMPRESA.razonSocial)}</div>
      <div>${esc(CONFIG_EMPRESA.direccion)}</div>
      <div>CIF: ${esc(CONFIG_EMPRESA.cif)}</div>
    </div>
    <div class="col-cliente">
      <div class="col-tit">CLIENTE</div>
      <div>${esc(cliente?.razonSocial || '')}</div>
      <div>${esc(cliente?.direccion || '')}</div>
      <div>CIF: ${esc(cliente?.cif || '')}</div>
    </div>
  </div>` : `
  <div class="empresa">
    <div>${esc(CONFIG_EMPRESA.razonSocial)}</div>
    <div class="light">${esc(CONFIG_EMPRESA.direccion)}</div>
    <div class="light">CIF: ${esc(CONFIG_EMPRESA.cif)}</div>
  </div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=80mm">
<title>${esFactura ? 'Factura' : 'Ticket'} ${esc(ticketNum)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 14px;
    font-weight: bold;       /* TODO EN BOLD por defecto */
    width: 80mm;
    max-width: 80mm;
    color: #000;
    background: #fff;
    padding: 2mm 2mm 0 2mm; /* Sin padding inferior = sin espacio en blanco al final */
    line-height: 1;
  }

  /* ── SEPARADORES ── */
  .sep-solid { border: none; border-top: 2px solid #000; margin: 5px 3px; }
  .sep-dash  { border: none; border-top: 1px dashed #000; margin: 5px 3px; }

  /* ── LOGO ── */
  .logo     { text-align: center; margin: 2px 0 1px; }
  .logo svg { display: block; margin: 0 auto; width: 28mm; max-width: 100%; height: auto;
              -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── EMPRESA ── */
  .empresa        { text-align: center; font-size: 13px; font-weight: bold; line-height: 1.2; }

  /* ── FACTURA: dos columnas emisor | cliente ── */
  .factura-titulo { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 2px; margin: 1px 0 3px; }
  .dos-col        { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; font-weight: bold; line-height: 1.25; }
  .dos-col > div  { flex: 1; min-width: 0; word-break: break-word; }
  .col-cliente    { text-align: right; }
  .col-tit        { font-size: 10px; text-decoration: underline; margin-bottom: 1px; }

  /* ── NÚMERO / FECHA ── */
  .num-fecha { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin: 2px 0; }

  /* ── CABECERA COLUMNAS ── */
  .col-header {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: bold;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
    margin-bottom: 5px;
  }

  /* ── ITEMS ── */
  .item        { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-bottom: 2px; }
  .item-uds    { width: 20px; text-align: center; flex-shrink: 0; }
  .item-nombre { flex: 1; min-width: 0; padding: 0 3px; word-break: break-word; }
  .item-precio { width: 58px; text-align: right; flex-shrink: 0; font-size: 12px; }
  .item-sep    { width: 5px; flex-shrink: 0; } /* ← Espacio entre Precio y Subt */
  .item-total  { width: 58px; text-align: right; flex-shrink: 0; font-size: 12px; }

  /* ── DESGLOSE ── */
  .desglose       { font-size: 13px; font-weight: bold; margin: 2px 0; }
  .desglose .fila { display: flex; justify-content: space-between; padding: 1px 0; font-size: 12px; }

  /* ── TOTAL ── */
  .total-line { display: flex; justify-content: space-between; font-size: 19px; font-weight: bold; margin: 3px 0; }

  /* ── PAGO ── */
  .pago   { font-size: 13px; font-weight: bold; text-align: center; margin: 2px 0; }
  .cambio { font-size: 14px; font-weight: bold; text-align: center; margin: 2px 0; }

  /* ── CÓDIGO DE BARRAS ── */
  .barcode      { text-align: center; margin: 6px 0 2px; }
  .barcode svg  { width: 60mm; max-width: 92%; height: 13mm;
                  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .barcode-num  { font-size: 12px; font-weight: bold; letter-spacing: 2px; margin-top: 1px; }

  /* ── TEXTO LEGAL ── */
  .legal { font-size: 11px; font-weight: bold; text-align: center; line-height: 1.35; margin-top: 3px; }

  /* ── GLOSARIO ── */
  .glosario {
    font-size: 11px;
    font-weight: bold;
    margin-top: 4px;
    border-top: 1px dashed #000;
    padding-top: 3px;
    line-height: 1;
    margin-bottom: 0;
  }

  @media print {
    body { padding: 1mm 1mm 0 1mm; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>

  <!-- LOGO (blanco y negro) -->
  <div class="logo">${logoSVG}</div>
  <hr class="sep-solid">

  <!-- EMPRESA / FACTURA -->
  ${bloqueEmpresa}
  <hr class="sep-dash">

  <!-- NÚMERO Y FECHA -->
  <div class="num-fecha">
    <span>${esc(ticketNum)}</span>
    <span>${fmtFecha(fecha)}</span>
  </div>
  <hr class="sep-dash">

  <!-- CABECERA PRODUCTOS -->
  <div class="col-header">
    <span style="width:20px;text-align:center">Uds</span>
    <span style="flex:1;padding-left:3px">Producto</span>
    <span style="width:58px;text-align:right;font-size:12px">Precio</span>
    <span class="item-sep"></span>
    <span style="width:58px;text-align:right;font-size:12px">Subt</span>
  </div>

  <!-- ITEMS -->
  ${items.map(i => `
  <div class="item">
    <span class="item-uds">${i.cantidad}</span>
    <span class="item-nombre">${esc(i.nombre)}${i.regalo ? ' (REGALO)' : (i.precio * i.cantidad > i.total_linea ? ' *' : '')}</span>
    <span class="item-precio">${fmtE(i.precio)}</span>
    <span class="item-sep"></span>
    <span class="item-total">${fmtE(i.total_linea)}</span>
  </div>`).join('')}

  <hr class="sep-dash">

  ${ahorroOfertas > 0.005 ? `<div class="desglose"><div class="fila"><span>* Ahorro ofertas:</span><span>-${fmtE(ahorroOfertas)}</span></div></div>` : ''}
  ${descuento > 0 ? `<div class="desglose"><div class="fila"><span>Descuento (${descuentoPct}%):</span><span>-${fmtE(descuento)}</span></div></div>` : ''}

  <!-- DESGLOSE FISCAL -->
  <div class="desglose">
    <div>Desglose TOTAL:</div>
    <div class="fila"><span>B.I.:</span><span>${fmtE(baseImponible)}</span></div>
    <div class="fila"><span>I.V.A. (${CONFIG_EMPRESA.iva}%):</span><span>${fmtE(cuotaIva)}</span></div>
    <div class="fila"><span>N.E.C.:</span><span>${totalNEC.toFixed(2)}g</span></div>
  </div>
  <hr class="sep-solid">

  <!-- TOTAL -->
  <div class="total-line">
    <span>TOTAL:</span>
    <span>${fmtE(total)}</span>
  </div>
  <hr class="sep-solid">

  <!-- PAGO -->
  <div class="pago">Forma de pago: ${metodo === 'efectivo' ? 'Efectivo' : metodo === 'tarjeta' ? 'Tarjeta' : 'Mixto'}</div>
  ${metodo === 'mixto' ? `<div class="cambio">Efectivo: ${fmtE(pagoEfectivo)} · Tarjeta: ${fmtE(pagoTarjeta)}</div>` : ''}
  ${metodo === 'efectivo' && dineroDado > 0 ? `<div class="cambio">Entregado: ${fmtE(dineroDado)}</div><div class="cambio">Cambio: ${fmtE(cambio)}</div>` : ''}
  <div class="pago">I.V.A. incluido</div>
  ${datos.perfil?.nombre ? `<div class="pago">Le atendió: ${esc(datos.perfil.nombre)}</div>` : ''}
  <hr class="sep-dash">

  <!-- CÓDIGO DE BARRAS (localizar el ticket con la pistola) -->
  ${barcode ? `<div class="barcode">${barcode}<div class="barcode-num">${esc(ticketNum)}</div></div>` : ''}

  <!-- TEXTO LEGAL -->
  <div class="legal">${esc(CONFIG_EMPRESA.textoLegal)}</div>

  <!-- GLOSARIO -->
  <div class="glosario">
    <div>Subt.* : Subtotal</div>
    <div>B.I.* : Base Imponible</div>
    <div>N.E.C.* : Contenido Neto Explosivo</div>
  </div>

</body>
</html>`
}

/**
 * Abre una ventana e imprime el tique/factura.
 * @param {object} datos  ver generarTicketHTML
 * @param {object} [opts] { esFactura, cliente, autoPrint }
 */
export function imprimirTicket(datos, opts = {}) {
  // Por defecto se imprime directo: al pulsar "imprimir" la orden sale sola a la
  // impresora conectada sin que el usuario tenga que pulsar nada más.
  const autoPrint = opts.autoPrint ?? true
  const html = generarTicketHTML(datos, opts)
  const ventana = window.open('', '_blank', 'width=400,height=700,scrollbars=yes')
  if (!ventana) {
    alert('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para esta página.')
    return
  }
  // Inyectamos el disparador DENTRO del documento: el evento `load` espera a que
  // el logo (imagen) termine de cargar antes de lanzar la impresión, evitando
  // tiques sin logo o impresiones que no llegan a dispararse.
  const printScript = autoPrint ? `
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 150)
    })
    window.onafterprint = function () { window.close() }
  <\/script>` : ''
  ventana.document.write(html.replace('</body>', printScript + '</body>'))
  ventana.document.close()
}

/**
 * Normaliza una fila de ticket de BD (con ticket_items) al `datos` que consumen
 * generarTicketHTML / imprimirTicket. Reutilizado por los historiales de empleado y admin.
 */
export function ticketRowToDatos(row, { caseta = null, productos = [] } = {}) {
  const items = (row.ticket_items || []).map(i => ({
    nombre:         i.nombre_producto,
    cantidad:       i.cantidad,
    precio:         i.precio_unitario,
    total_linea:    i.total_linea,
    regalo:         i.detalle_oferta === 'REGALO' || (i.precio_unitario === 0 && i.total_linea === 0),
    gramos_polvora: i.productos?.gramos_polvora
      ?? productos.find(p => p.id === i.producto_id)?.gramos_polvora
      ?? 0,
  }))
  return {
    items,
    total:       row.total,
    metodo:      row.metodo_pago,
    cambio:      row.cambio || 0,
    dineroDado:  row.dinero_dado || 0,
    pagoEfectivo: row.pago_efectivo || 0,
    pagoTarjeta:  row.pago_tarjeta || 0,
    descuento:   0,
    descuentoPct: 0,
    caseta:      caseta || (row.casetas ? { ...row.casetas } : null),
    perfil:      row.perfiles || (row.empleado_nombre ? { nombre: row.empleado_nombre } : null),
    fecha:       new Date(row.creado_en),
    ticketNum:   row.numero_ticket || `TVN-${String(row.id).slice(-6).toUpperCase()}`,
    esFactura:   !!row.factura,
    cliente:     row.factura ? { razonSocial: row.cliente_nombre || '', cif: row.cliente_cif || '', direccion: row.cliente_direccion || '' } : null,
  }
}
