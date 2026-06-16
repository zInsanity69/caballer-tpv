import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    // Cliente con anon key para verificar que quien llama es ADMIN
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseAnon.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: perfil } = await supabaseAnon
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (perfil?.rol !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Solo los administradores pueden eliminar usuarios' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { userId } = await req.json()
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Falta el id del usuario' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'No puedes eliminar tu propio usuario' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Cliente con service_role para borrar el usuario de Auth.
    // Al borrar auth.users, el perfil cae en cascada (on delete cascade) y las FKs
    // del histórico (cajas/tickets/retiradas/...) quedan en NULL (ON DELETE SET NULL),
    // conservando el nombre en las columnas *_nombre.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (delError) {
      // Si el usuario de Auth ya no existe, intentar borrar al menos el perfil
      const { error: perfilError } = await supabaseAdmin.from('perfiles').delete().eq('id', userId)
      if (perfilError) throw delError
    }

    return new Response(
      JSON.stringify({ ok: true, id: userId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
