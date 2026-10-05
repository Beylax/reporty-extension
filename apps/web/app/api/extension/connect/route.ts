import { createClient } from '@/lib/supabase/server';
import { newToken, validToken } from '@/lib/invitation-token';

export async function POST(request: Request) {
  let code: unknown;
  try { ({ code } = await request.json()); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  if (typeof code !== 'string' || !validToken(code)) return Response.json({ error: 'Invalid code' }, { status: 400 });
  const supabase = await createClient();
  const token = newToken();
  const { error } = await supabase.rpc('redeem_extension_handoff', { secret: code, session_secret: token });
  if (error) return Response.json({ error: 'Connection expired or revoked' }, { status: 401 });
  return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
