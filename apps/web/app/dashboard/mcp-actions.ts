'use server';
import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';

export async function revokeMcpConnection(connectionId: string) {
  if (!isUuid(connectionId)) return { error: 'Collegamento non valido.' };
  const { supabase, userId } = await requireUser();
  const { data: connection, error } = await supabase.from('mcp_connections').select('id,client_id,project_id,revoked_at').eq('id', connectionId).eq('user_id', userId).maybeSingle();
  if (error || !connection) return { error: 'Collegamento non disponibile.' };
  if (connection.revoked_at) {
    const active = await supabase.from('mcp_connections').select('id').eq('user_id', userId).eq('client_id', connection.client_id).is('revoked_at', null).maybeSingle();
    if (active.error) return { error: 'Impossibile verificare il collegamento attivo.' };
    if (active.data) return { error: 'Questo client è collegato a un altro progetto. Gestisci il collegamento attivo dalle impostazioni di quel progetto.' };
  }
  // Revoke at the data boundary first. Access tokens stop working immediately.
  const revoked = await supabase.rpc('revoke_mcp_connection', { connection: connectionId });
  if (revoked.error) return { error: 'Impossibile revocare il collegamento.' };
  let warning: string | undefined;
  try {
    const oauth = await supabase.auth.oauth.revokeGrant({ clientId: connection.client_id });
    if (oauth.error) warning = 'Accesso Reporty revocato. Non è stato possibile completare la revoca della sessione OAuth: riprova la revoca prima di collegare nuovamente questo client.';
  } catch { warning = 'Accesso Reporty revocato. Riprova la revoca per terminare anche la sessione OAuth.'; }
  revalidatePath(`/dashboard/projects/${connection.project_id}`);
  return { success: true, warning };
}
