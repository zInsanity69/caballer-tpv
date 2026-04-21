import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BOT_TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const CHAT_ID      = Deno.env.get('TELEGRAM_CHAT_ID')

    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const jwtPayload = decodeJwtPayload(jwt)
    if (!jwtPayload?.sub) return json({ error: 'Token inválido' }, 401)
    if (typeof jwtPayload.exp === 'number' && jwtPayload.exp < Math.floor(Date.now() / 1000)) {
      return json({ error: 'Token expirado' }, 401)
    }

    const { tipo, mensaje, producto_id, caseta_id } = await req.json()
    if (!tipo || !mensaje) return json({ error: 'Faltan tipo o mensaje' }, 400)

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: config, error: configError } = await supabaseAdmin
      .from('alertas_config')
      .select('*')
      .eq('tipo', tipo)
      .single()

    if (configError) return json({ error: `Error leyendo config: ${configError.message}` }, 500)
    if (!config)     return json({ skipped: true, motivo: 'tipo no existe en alertas_config' })
    if (!config.activa) return json({ skipped: true, motivo: 'alerta inactiva' })

    // Anti-spam para alertas de stock (por producto+caseta)
    const esStock = tipo === 'stock_bajo' || tipo === 'stock_agotado'
    if (esStock && producto_id && caseta_id) {
      if (config.modo_repeticion === 'una_vez') {
        const { data: yaEnviada } = await supabaseAdmin
          .from('alertas_stock_enviadas')
          .select('producto_id')
          .eq('producto_id', producto_id)
          .eq('caseta_id', caseta_id)
          .eq('tipo', tipo)
          .maybeSingle()
        if (yaEnviada) return json({ skipped: true, motivo: 'ya enviada (una_vez)' })
      } else if (config.modo_repeticion === 'repetir' && config.ultimo_envio) {
        const cooldownMs = (config.cooldown_minutos ?? 30) * 60 * 1000
        if (Date.now() - new Date(config.ultimo_envio).getTime() < cooldownMs) {
          return json({ skipped: true, motivo: 'cooldown activo' })
        }
      }
    } else if (!esStock && config.modo_repeticion === 'repetir' && config.ultimo_envio) {
      const cooldownMs = (config.cooldown_minutos ?? 30) * 60 * 1000
      if (Date.now() - new Date(config.ultimo_envio).getTime() < cooldownMs) {
        return json({ skipped: true, motivo: 'cooldown activo' })
      }
    }

    if (!BOT_TOKEN || !CHAT_ID) {
      return json({ error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados' }, 500)
    }

    const telegramRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text: mensaje, parse_mode: 'HTML' }),
      }
    )

    if (!telegramRes.ok) {
      const errBody = await telegramRes.text()
      return json({ error: `Telegram error: ${errBody}` }, 502)
    }

    const ahora = new Date().toISOString()
    if (esStock && producto_id && caseta_id) {
      await supabaseAdmin.from('alertas_stock_enviadas').upsert(
        { producto_id, caseta_id, tipo, enviado_en: ahora },
        { onConflict: 'producto_id,caseta_id,tipo' }
      )
    }
    await supabaseAdmin.from('alertas_config').update({ ultimo_envio: ahora }).eq('tipo', tipo)

    return json({ ok: true })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, 500)
  }
})
