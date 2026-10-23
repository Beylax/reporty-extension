'use server';
import { isOAuthAuthorizationId } from '@/lib/mcp/return-path';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { appOrigin } from '@/lib/supabase/config';

export async function decideMcpConsent(authorizationId: string, projectId: string, approve: boolean) {
  if (!isOAuthAuthorizationId(authorizationId) || (approve && !isUuid(projectId)) || typeof approve !== 'boolean') return { error: 'Richiesta non valida.' };
  const { supabase, userId } = await requireUser();
  // Resolve client/user on the server; never trust client identity from the form.
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) return { error: 'Richiesta scaduta o non disponibile. Riavvia il collegamento da Codex.' };
  if ('redirect_url' in details) return { redirect: details.redirect_url };
  if (details.user.id !== userId) return { error: 'Account non corrispondente alla richiesta.' };
  if (approve) {
    const { error: grantError } = await supabase.rpc('authorize_mcp_connection', {
      client: details.client.id, client_label: details.client.name || 'Client MCP', target: projectId, resource_url: `${appOrigin()}/api/mcp`,
    });
    if (grantError) return { error: grantError.code === '22023' ? 'Questo client è già collegato a un altro progetto. Revoca prima il collegamento dalle impostazioni di quel progetto.' : 'Impossibile autorizzare il progetto. Verifica la configurazione MCP del database.' };
  }
  const decision = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (decision.error || !decision.data) return { error: 'Autorizzazione non riuscita. Riprova o riavvia il collegamento da Codex.' };
  return { redirect: decision.data.redirect_url };
}
