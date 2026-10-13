import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export function storageServiceClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Configura SUPABASE_SECRET_KEY sul backend per gli screenshot.');
  return createClient(supabaseConfig().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function storageClient(bucket = 'screenshots') { return storageServiceClient().storage.from(bucket); }

/** Attachment paths have a reserved prefix; screenshot paths keep their existing format. */
export async function removeStoredFiles(paths: string[]) {
  const failures: unknown[] = [];
  for (const bucket of ['screenshots','attachments']) {
    const selected = paths.filter(path => path.startsWith('attachments/') === (bucket === 'attachments'));
    for (let index = 0; index < selected.length; index += 100) {
      try {
        const { error } = await storageClient(bucket).remove(selected.slice(index,index + 100));
        if (error) failures.push(error);
      } catch (error) { failures.push(error); }
    }
  }
  if (failures.length) throw new Error('Pulizia dei file incompleta.');
}
