import { createClient } from '@/lib/supabase/server';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims || auth.claims.is_anonymous) return Response.json({ error: 'Sessione richiesta.' }, { status: 401, headers });
  const { data, error } = await supabase.rpc('notification_operation', { secret: null, target: null, operation: 'notifications', payload: {} });
  return error
    ? Response.json({ error: 'Impossibile caricare le notifiche.' }, { status: 500, headers })
    : Response.json({ data }, { headers });
}
