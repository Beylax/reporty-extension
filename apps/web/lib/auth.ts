import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims || data.claims.is_anonymous || data.claims.client_id || data.claims.reporty_mcp_connection) redirect('/login');
  return { supabase, userId: data.claims.sub, email: String(data.claims.email ?? '') };
}
