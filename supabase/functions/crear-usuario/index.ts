import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Cliente con anon key para verificar que quien llama es ADMIN
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verificar que el usuario que llama es ADMIN
    const { data: { user } } = await supabaseAnon.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: corsHeaders })

    const { data: perfil } = await supabaseAnon
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (perfil?.rol !== 'ADMIN') {
      return new Response(JSON.stringify({ error: 'Solo los administradores pueden crear usuarios' }), { status: 403, headers: corsHeaders })
    }

    // Cliente con service_role para crear el usuario en Auth
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { nombre, email, password, rol, caseta_id } = await req.json()

    if (!nombre || !email || !password || !rol) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), { status: 400, headers: corsHeaders })
    }
    if (rol === 'EMPLEADO' && !caseta_id) {
      return new Response(JSON.stringify({ error: 'El empleado necesita una caseta asignada' }), { status: 400, headers: corsHeaders })
    }

    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // sin necesidad de confirmar email
    })
    if (authError) throw authError

    // 2. Crear perfil
    const { error: perfilError } = await supabaseAdmin
      .from('perfiles')
      .insert({
        id:        authData.user.id,
        nombre,
        rol,
        caseta_id: caseta_id || null,
        activo:    true,
      })
    if (perfilError) {
      // Si falla el perfil, borrar el usuario de Auth para no dejar huérfanos
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw perfilError
    }

    return new Response(
      JSON.stringify({ id: authData.user.id, nombre, email, rol, caseta_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
