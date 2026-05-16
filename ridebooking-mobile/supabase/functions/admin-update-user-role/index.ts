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

const SETTABLE_ROLES = ['user', 'rider', 'team_leader', 'admin']

async function verifyAdminRole(authHeader: string): Promise<string | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!data || !['admin', 'super_admin'].includes(data.role)) return null
  return user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const adminId = await verifyAdminRole(authHeader)
    if (!adminId) return json({ error: 'Forbidden' }, 403)

    const { userId, role } = await req.json()
    if (!userId || !SETTABLE_ROLES.includes(role)) {
      return json({ error: 'Invalid parameters' }, 400)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await admin.from('profiles').update({ role }).eq('id', userId)
    if (error) throw error
    return json({ success: true })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
