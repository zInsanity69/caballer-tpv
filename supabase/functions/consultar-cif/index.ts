import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Coge el primer valor no vacío de una lista de posibles nombres de campo
const pick = (obj: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    // Verificar que quien llama está autenticado (cualquier rol puede facturar)
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await supabaseAnon.auth.getUser()
    if (!user) return json({ ok: false, error: 'No autenticado' }, 401)

    const { cif } = await req.json()
    const nif = String(cif || '').trim().toUpperCase()
    if (!nif) return json({ ok: false, error: 'Falta el CIF' }, 400)

    const apiKey = Deno.env.get('APISPAIN_API_KEY')
    if (!apiKey) return json({ ok: false, error: 'API no configurada (falta APISPAIN_API_KEY)' }, 200)

    // Endpoint configurable por si cambia la API (sin redeploy).
    const baseUrl = Deno.env.get('APISPAIN_BASE_URL') || 'https://api.apispain.es/v1'
    const pathTpl = Deno.env.get('APISPAIN_CIF_PATH') || '/borme/empresas/{cif}'
    const url = baseUrl.replace(/\/+$/, '') + pathTpl.replace('{cif}', encodeURIComponent(nif))

    let resp: Response
    try {
      resp = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } })
    } catch (e) {
      return json({ ok: false, error: 'No se pudo contactar con la API: ' + e.message }, 200)
    }
    if (!resp.ok) {
      return json({ ok: false, error: `API devolvió ${resp.status}` }, 200)
    }

    const raw = await resp.json().catch(() => null)
    // La respuesta puede venir como objeto, {data:{}} o array → normalizar a un objeto
    let d: Record<string, unknown> = {}
    if (Array.isArray(raw)) d = raw[0] || {}
    else if (raw && typeof raw === 'object') d = (raw.data as Record<string, unknown>) || raw

    const razonSocial = pick(d, ['denominacion', 'denominacion_social', 'razon_social', 'razonSocial', 'nombre', 'name'])
    const provincia   = pick(d, ['provincia', 'province'])
    const domicilio   = pick(d, ['domicilio', 'domicilio_social', 'direccion', 'direccion_fiscal', 'address'])
    const cp          = pick(d, ['codigo_postal', 'cp', 'postal_code'])
    const localidad   = pick(d, ['localidad', 'municipio', 'poblacion', 'city'])
    const cifResp     = pick(d, ['nif', 'cif']) || nif

    // Componer una dirección legible con lo que haya
    const direccion = [domicilio, [cp, localidad].filter(Boolean).join(' '), provincia]
      .filter(Boolean).join(', ')

    if (!razonSocial && !direccion) {
      return json({ ok: false, error: 'No se encontraron datos para ese CIF' }, 200)
    }
    return json({ ok: true, razonSocial, cif: cifResp, direccion })

  } catch (e) {
    return json({ ok: false, error: e.message }, 200)
  }
})
