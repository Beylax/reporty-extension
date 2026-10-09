import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase/config';

export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configurazione mancante: ${name}.`);
  return value;
}
export function automationDb() {
  return createClient(supabaseConfig().url, required('SUPABASE_AUTOMATION_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
export function automationReady() {
  return ['ANTHROPIC_API_KEY', 'ANTHROPIC_AGENT_ID', 'ANTHROPIC_ENVIRONMENT_ID', 'SUPABASE_AUTOMATION_KEY', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'CRON_SECRET'].every(name => Boolean(process.env[name]));
}
