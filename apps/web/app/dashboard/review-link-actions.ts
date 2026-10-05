'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';

export async function saveReviewLink(_previous: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const projectId = String(form.get('projectId') ?? '');
  const environmentId = String(form.get('environmentId') ?? '');
  if (!isUuid(projectId) || !isUuid(environmentId)) return { error: 'Seleziona un ambiente valido.' };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('regenerate_environment_review_link', { environment: environmentId });
  if (error) return { error: 'Salvataggio non riuscito. Verifica di aver applicato la migrazione 013.' };
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: 'Link dell’ambiente rigenerato. Il precedente e i relativi accessi ospite sono stati revocati.' };
}
