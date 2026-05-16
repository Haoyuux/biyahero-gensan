import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const errand = payload.record;

    if (!errand || errand.status !== 'pending') {
      return new Response('skip', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Notify riders with an approved vehicle matching the errand's vehicle_type
    const vehicleTypeMap: Record<string, string> = { moto: 'Motorcycle', tricycle: 'Tricycle' };
    const requiredVehicleType = vehicleTypeMap[errand.vehicle_type] ?? null;

    let riderIds: string[] = [];
    if (requiredVehicleType) {
      const { data: vehicleRiders } = await supabase
        .from('vehicles')
        .select('rider_id')
        .eq('vehicle_type', requiredVehicleType)
        .eq('status', 'approved');
      riderIds = (vehicleRiders ?? []).map((v: any) => v.rider_id);
    }

    let query = supabase
      .from('profiles')
      .select('expo_push_token')
      .in('role', ['rider', 'team_leader'])
      .eq('is_online', true)
      .not('expo_push_token', 'is', null);

    if (riderIds.length > 0) {
      query = query.in('id', riderIds);
    }

    const { data: riders } = await query;
    if (!riders?.length) return new Response('no riders', { status: 200 });

    const typeLabel: Record<string, string> = { buy: 'Buy Something', pickup_deliver: 'Pick Up & Deliver', other: 'Other Errand' };
    const messages = riders.map((r: any) => ({
      to: r.expo_push_token as string,
      title: `📦 Errand Request — ${typeLabel[errand.errand_type] ?? 'Errand'}`,
      body: `₱${errand.fare} · ${errand.pickup_label} → ${errand.dropoff_label}`,
      data: { errandId: errand.id, type: 'new_errand' },
      sound: 'default',
      priority: 'high',
      channelId: 'ride-requests',
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' }, status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
  }
});
