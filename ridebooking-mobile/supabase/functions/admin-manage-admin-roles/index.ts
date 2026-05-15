// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function verifySuperAdmin(authHeader: string): Promise<string | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!data || data.role !== 'super_admin') return null
  return user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const adminId = await verifySuperAdmin(authHeader)
    if (!adminId) return json({ error: 'Forbidden — super_admin only' }, 403)

    const body = await req.json()
    const { action } = body
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (action === 'create') {
      const { name, description, modules } = body
      if (!name || !Array.isArray(modules)) return json({ error: 'Invalid parameters' }, 400)
      const { data, error } = await admin.from('admin_roles').insert({ name, description: description ?? null, modules }).select().single()
      if (error) throw error
      return json(data)
    }

    if (action === 'update') {
      const { id, name, description, modules } = body
      if (!id) return json({ error: 'Missing id' }, 400)
      const { error } = await admin.from('admin_roles').update({ name, description, modules }).eq('id', id)
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) return json({ error: 'Missing id' }, 400)
      const { error } = await admin.from('admin_roles').delete().eq('id', id)
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'assign') {
      const { userId, roleIds } = body
      if (!userId || !Array.isArray(roleIds)) return json({ error: 'Invalid parameters' }, 400)
      const { error } = await admin.from('profiles').update({ admin_role_ids: roleIds }).eq('id', userId)
      if (error) throw error
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
