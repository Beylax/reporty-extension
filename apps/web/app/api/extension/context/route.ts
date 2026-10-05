import { createClient } from '@/lib/supabase/server';
import { validToken } from '@/lib/invitation-token';

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!validToken(token)) return Response.json({ error: 'Session required' }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('extension_context', { secret: token });
  if (error) return Response.json({ error: 'Session expired or revoked' }, { status: error.code === '42501' ? 401 : 503 });
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!validToken(token)) return new Response(null, { status: 401 });
  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_extension_session', { secret: token });
  return new Response(null, { status: error ? 503 : 204 });
}
