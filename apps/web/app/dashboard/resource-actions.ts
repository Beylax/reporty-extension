'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { removeStoredFiles } from '@/lib/supabase/storage';

export async function deletePlatformResource(id: string, kind: 'project' | 'environment') {
  if (!isUuid(id) || !['project', 'environment'].includes(kind)) return { error: 'Dati non validi.' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('platform_delete_resource', { target: id, kind });
  if (error) return { error: error.code === 'PGRST202' ? 'Verifica lo schema del database.' : 'Eliminazione non consentita o non riuscita.' };
  let warning: string | undefined;
  const paths = data as string[];
  if (paths.length) {
    try {
      await removeStoredFiles(paths);
    } catch { warning = 'Dati eliminati; alcuni file potrebbero essere rimasti nei bucket privati.'; }
  }
  revalidatePath('/dashboard', 'layout');
  return { warning };
}
