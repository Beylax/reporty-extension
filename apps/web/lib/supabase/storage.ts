import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export function storageClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Configura SUPABASE_SECRET_KEY sul backend per gli screenshot.');
  return createClient(supabaseConfig().url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from('screenshots');
}
