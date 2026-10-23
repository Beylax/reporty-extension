import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { validMcpClaims } from './claims';
import { appOrigin, supabaseConfig } from '@/lib/supabase/config';

export function protectedResourceMetadata() {
  return { resource: `${appOrigin()}/api/mcp`, authorization_servers: [`${supabaseConfig().url}/auth/v1`], scopes_supported: ['openid'], bearer_methods_supported: ['header'], resource_name: 'Reporty — sola lettura' };
}
export function authenticationRequired() {
  return Response.json({ error: 'Autorizzazione MCP richiesta o revocata.' }, { status: 401, headers: {
    'WWW-Authenticate': `Bearer resource_metadata="${appOrigin()}/.well-known/oauth-protected-resource/api/mcp", scope="openid"`,
    'Cache-Control': 'private, no-store',
  } });
}
export async function authenticateMcp(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 16000) return null;
  const { url, key } = supabaseConfig();
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !validMcpClaims(data?.claims, `${url}/auth/v1`, `${appOrigin()}/api/mcp`)) return null;
  } catch { return null; }
  // This checks project, user, client, immutable session binding and revocation in DB.
  const check = await supabase.rpc('mcp_read', { operation: 'project', payload: {} });
  if (check.error && check.error.code !== '42501') throw new Error('MCP database unavailable');
  if (check.error || !check.data) return null;
  return supabase;
}
