'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { storageClient } from '@/lib/supabase/storage';

export async function mutateReport(environmentId: string, operation: string, payload: { id: string; body?: string; status?: string }) {
  const { supabase } = await requireUser();
  if (!isUuid(environmentId) || !isUuid(payload.id) || !['reply', 'edit', 'status', 'delete'].includes(operation)) return { error: 'Dati non validi.' };
  const { data, error } = await supabase.rpc('report_operation', { secret: null, target: environmentId, operation, payload });
  if (error) return { error: 'Operazione non riuscita. Verifica i permessi e riprova.' };
  if (operation === 'delete' && data?.screenshot_path) {
    try { await storageClient().remove([data.screenshot_path]); } catch { /* The report remains deleted. */ }
  }
  revalidatePath('/dashboard');
  return { success: true };
}

export async function getReportThread(environmentId: string, id: string) {
  const { supabase } = await requireUser();
  if (!isUuid(environmentId) || !isUuid(id)) return { error: 'Dati non validi.' };
  const { data, error } = await supabase.rpc('report_operation', { secret: null, target: environmentId, operation: 'thread', payload: { id } });
  return error ? { error: 'Segnalazione non disponibile.' } : { data };
}
