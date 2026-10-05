'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { storageClient } from '@/lib/supabase/storage';

export async function deletePlatformResource(id: string, kind: 'project' | 'environment') {
  if (!isUuid(id) || !['project', 'environment'].includes(kind)) return { error: 'Dati non validi.' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('platform_delete_resource', { target: id, kind });
  if (error) return { error: error.code === 'PGRST202' ? 'Applica la migrazione 008.' : 'Eliminazione non consentita o non riuscita.' };
  let warning: string | undefined;
  const paths = data as string[];
  if (paths.length) {
    try {
      const bucket = storageClient();
      for (let index = 0; index < paths.length; index += 100) {
        const result = await bucket.remove(paths.slice(index, index + 100));
        if (result.error) throw result.error;
      }
    } catch { warning = 'Dati eliminati; alcuni screenshot potrebbero essere rimasti nel bucket privato.'; }
  }
  revalidatePath('/dashboard', 'layout');
  return { warning };
}
