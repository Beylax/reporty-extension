import { createClient } from '@/lib/supabase/server';
import { validToken } from '@/lib/invitation-token';
import { isUuid, validateName } from '@reporty/shared';

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!validToken(token)) return Response.json({ error: 'Session required' }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('renew_extension_session', { secret: token });
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

export async function POST(request: Request) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!validToken(secret)) return Response.json({ error: 'Sessione richiesta.' }, { status: 401 });
  let input: { environmentId: string; name?: string };
  try {
    const body = await request.json();
    if (!isUuid(body?.environmentId)) throw new Error();
    input = { environmentId: body.environmentId, ...(Object.hasOwn(body, 'name') ? { name: validateName(body.name, 80) } : {}) };
  } catch { return Response.json({ error: 'Ambiente o nome non valido.' }, { status: 400 }); }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reviewer_identity', { secret, target: input.environmentId, guest_name: input.name ?? null });
  if (error) return Response.json({ error: error.code === '42501' ? 'Accesso non consentito o revocato.' : 'Impossibile aggiornare il nome.' }, { status: error.code === '42501' ? 403 : 400 });
  return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}
