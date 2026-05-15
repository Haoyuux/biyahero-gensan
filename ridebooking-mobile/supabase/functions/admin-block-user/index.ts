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

async function verifyAdminRole(authHeader: string): Promise<{ adminId: string; adminName: string } | null> {
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data } = await admin.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!data || !['admin', 'super_admin'].includes(data.role)) return null
  return { adminId: user.id, adminName: data.full_name ?? 'Admin' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = await verifyAdminRole(authHeader)
    if (!caller) return json({ error: 'Forbidden' }, 403)

    const { action, userId, reason } = await req.json()
    if (!userId || !['block', 'unblock'].includes(action)) {
      return json({ error: 'Invalid parameters' }, 400)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const updates = action === 'block'
      ? {
          is_blocked: true,
          block_reason: reason ?? null,
          blocked_by: caller.adminName,
          blocked_at: new Date().toISOString(),
        }
      : {
          is_blocked: false,
          block_reason: null,
          blocked_by: null,
          blocked_at: null,
        }

    const { error } = await admin.from('profiles').update(updates).eq('id', userId)
    if (error) throw error
    return json({ success: true })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
