'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';

export async function saveReviewLink(_previous: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const projectId = String(form.get('projectId') ?? '');
  const environmentId = String(form.get('environmentId') ?? '');
  if (!isUuid(projectId) || !isUuid(environmentId)) return { error: 'Seleziona un ambiente valido.' };
  const { supabase } = await requireUser();
  const regenerate = form.get('regenerate') === 'true';
  const { error } = await supabase.rpc('save_project_review_link', { target: projectId, environment: environmentId, regenerate });
  if (error) return { error: 'Salvataggio non riuscito. Verifica di aver applicato la migrazione 011.' };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: regenerate ? 'Link rigenerato. Il precedente e i relativi accessi ospite sono stati revocati.' : 'Link e ambiente di avvio salvati.' };
}
