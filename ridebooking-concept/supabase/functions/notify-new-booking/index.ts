import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FIREBASE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!) as Record<string, string>;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && now < tokenCache.exp - 60) return tokenCache.token;

  const payload = {
    iss: FIREBASE_SERVICE_ACCOUNT.client_email,
    sub: FIREBASE_SERVICE_ACCOUNT.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signingInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}`;

  const pemKey = FIREBASE_SERVICE_ACCOUNT.private_key
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

  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

  const jwt = `${signingInput}.${btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  tokenCache = { token: tokenData.access_token as string, exp: now + 3600 };
  return tokenCache.token;
}

async function sendFCM(
  token: string,
  accessToken: string,
  projectId: string,
): Promise<'success' | 'unregistered' | 'error'> {
  const res = await fetch(
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

  if (res.ok) return 'success';

  const body = await res.json().catch(() => ({}));
  const status = body?.error?.status as string | undefined;
  return status === 'UNREGISTERED' ? 'unregistered' : 'error';
}

Deno.serve(async (_req) => {
  try {
    const projectId = FIREBASE_SERVICE_ACCOUNT.project_id;

    const { data: riders } = await supabase
      .from('profiles')
      .select('id, fcm_token')
      .eq('is_online', true)
      .eq('role', 'rider')
      .not('fcm_token', 'is', null);

    if (!riders?.length) {
      return new Response(JSON.stringify({ attempted: 0, succeeded: 0, failed: 0 }), { status: 200 });
    }

    const accessToken = await getAccessToken();

    const results = await Promise.all(
      riders.map(async ({ id, fcm_token }: { id: string; fcm_token: string }) => {
        const result = await sendFCM(fcm_token, accessToken, projectId);
        if (result === 'unregistered') {
          await supabase.from('profiles').update({ fcm_token: null }).eq('id', id);
        }
        return result;
      }),
    );

    const succeeded = results.filter((r) => r === 'success').length;
    const failed = results.length - succeeded;

    return new Response(
      JSON.stringify({ attempted: riders.length, succeeded, failed }),
      { status: 200 },
    );
  } catch (err) {
    console.error('notify-new-booking error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
