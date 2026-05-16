import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { errand_id } = await req.json();
    if (!errand_id) return new Response(JSON.stringify({ error: 'errand_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: errand, error: fetchError } = await adminClient
      .from('errands')
      .select('id, user_id, rider_id, status')
      .eq('id', errand_id)
      .single();

    if (fetchError || !errand) return new Response(JSON.stringify({ error: 'Errand not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (errand.user_id !== user.id && errand.rider_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (['cancelled', 'completed'].includes(errand.status)) {
      return new Response(JSON.stringify({ success: true, already_terminal: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { error: updateError } = await adminClient
      .from('errands')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', errand_id);

    if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
