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

async function verifyAdminRole(authHeader: string): Promise<{ adminId: string } | null> {
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
  return { adminId: user.id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = await verifyAdminRole(authHeader)
    if (!caller) return json({ error: 'Forbidden' }, 403)

    const { action, userVoucherId, rideId } = await req.json()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (action === 'removeUserVoucher') {
      if (!userVoucherId) return json({ error: 'Missing userVoucherId' }, 400)
      const { error } = await admin.from('user_vouchers').delete().eq('id', userVoucherId)
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'markDiscountPaid') {
      if (!rideId) return json({ error: 'Missing rideId' }, 400)
      const { error } = await admin
        .from('rides')
        .update({
          voucher_discount_paid: true,
          voucher_discount_paid_at: new Date().toISOString(),
          voucher_discount_paid_by: caller.adminId,
        })
        .eq('id', rideId)
      if (error) throw error
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
