import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}`;

  const pemKey = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');

  const binaryKey = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

async function sendFCM(token: string, accessToken: string, projectId: string): Promise<void> {
  await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: 'New Booking!',
            body: 'A new booking is available near you. Tap to open.',
          },
        },
      }),
    },
  );
}

Deno.serve(async (_req) => {
  try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT) as Record<string, string>;
    const projectId = serviceAccount.project_id;

    const { data: riders } = await supabase
      .from('profiles')
      .select('fcm_token')
      .eq('is_online', true)
      .eq('role', 'rider')
      .not('fcm_token', 'is', null);

    if (!riders?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const accessToken = await getAccessToken(serviceAccount);

    await Promise.all(
      riders.map(({ fcm_token }: { fcm_token: string }) =>
        sendFCM(fcm_token, accessToken, projectId)
      ),
    );

    return new Response(JSON.stringify({ sent: riders.length }), { status: 200 });
  } catch (err) {
    console.error('notify-new-booking error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
