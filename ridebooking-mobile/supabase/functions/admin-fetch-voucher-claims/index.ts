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

    const { voucherId } = await req.json()
    if (!voucherId) return json({ error: 'Missing voucherId' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Fetch all user_vouchers rows for this voucher (all statuses)
    const { data: uvRows, error: uvError } = await admin
      .from('user_vouchers')
      .select('id, user_id, voucher_id, status, added_at, used_at, ride_id')
      .eq('voucher_id', voucherId)
      .order('added_at', { ascending: false })

    if (uvError) throw uvError

    // Fetch all rides that used this voucher
    const { data: rideRows, error: rideError } = await admin
      .from('rides')
      .select('id, user_id, fare, voucher_discount, completed_at, pickup_label, voucher_discount_paid, status')
      .eq('voucher_id', voucherId)
      .order('completed_at', { ascending: false })

    if (rideError) throw rideError

    // Fetch profiles for all user IDs found
    const uvUserIds = (uvRows ?? []).map((r: any) => r.user_id)
    const rideUserIds = (rideRows ?? []).map((r: any) => r.user_id)
    const allUserIds = [...new Set([...uvUserIds, ...rideUserIds])]

    let profiles: any[] = []
    if (allUserIds.length) {
      const { data } = await admin
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', allUserIds)
      profiles = data ?? []
    }

    return json({ uvRows: uvRows ?? [], rideRows: rideRows ?? [], profiles })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
