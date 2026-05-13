import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const ride = payload.record;

    if (!ride || ride.status !== 'pending') {
      return new Response('skip', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // All online riders (and team leaders) who have a push token
    const { data: riders } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .in('role', ['rider', 'team_leader'])
      .eq('is_online', true)
      .not('expo_push_token', 'is', null);

    if (!riders?.length) {
      return new Response('no online riders', { status: 200 });
    }

    const tokens = riders.map((r) => r.expo_push_token as string);

    const messages = tokens.map((token) => ({
      to: token,
      title: '🏍️ New Ride Request!',
      body: `₱${ride.fare} · ${ride.pickup_label ?? 'Pickup'} → ${ride.dropoff_label ?? 'Dropoff'}`,
      data: { rideId: ride.id, type: 'new_ride' },
      sound: 'default',
      priority: 'high',
      channelId: 'ride-requests',
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
