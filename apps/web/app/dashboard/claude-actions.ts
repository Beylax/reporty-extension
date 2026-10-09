'use server';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { automationReady } from '@/lib/automation/config';
import { reconcileTask } from '@/lib/automation/worker';

export async function assignClaude(issueId: string) {
  const { supabase } = await requireUser();
  if (!isUuid(issueId)) return { error: 'Segnalazione non valida.' };
  if (!automationReady()) return { error: 'Configura GitHub e Claude sul server prima di assegnare un task.' };
  const { data, error } = await supabase.rpc('start_claude_task', { target: issueId });
  if (error) return { error: error.code === '55000' ? 'Claude sta già lavorando a questa segnalazione.' : 'Collega una repository all’ambiente e verifica che il database sia aggiornato.' };
  after(async () => { try { await reconcileTask(data); } catch { /* Persisted queue is retried by the reconciler. */ } });
  revalidatePath('/dashboard', 'layout');
  return { id: data as string };
}
