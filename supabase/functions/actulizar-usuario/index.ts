import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    // Verificar que quien llama es ADMIN
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await supabaseAnon.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: perfil } = await supabaseAnon.from('perfiles').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Solo los administradores pueden modificar usuarios' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Cliente admin con service_role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { userId, email, password } = await req.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId obligatorio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!email && !password) {
      return new Response(JSON.stringify({ error: 'Indica al menos email o contraseña nueva' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Construir los cambios a aplicar en Auth
    const cambiosAuth: { email?: string; password?: string } = {}
    if (email?.trim())    cambiosAuth.email    = email.trim()
    if (password?.trim()) cambiosAuth.password = password.trim()

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, cambiosAuth)
    if (authError) throw authError

    return new Response(
      JSON.stringify({ ok: true, mensaje: 'Usuario actualizado correctamente' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
