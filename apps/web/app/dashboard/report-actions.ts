'use server';

import { revalidatePath } from 'next/cache';
import { bulkReportRequestSchema, isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { executeBulkReports } from '@/lib/bulk-reports';
import { storageClient } from '@/lib/supabase/storage';

export async function mutateReport(environmentId: string, operation: string, payload: { id: string; body?: string; status?: string; priority?: string }) {
  const { supabase } = await requireUser();
  if (!isUuid(environmentId) || !isUuid(payload.id) || !['reply', 'edit', 'status', 'priority', 'delete'].includes(operation)) return { error: 'Dati non validi.' };
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

export async function mutateReportsBulk(input: unknown) {
  const { supabase } = await requireUser();
  const parsed = bulkReportRequestSchema.safeParse(input);
  if (!parsed.success) return { error: 'Dati non validi per le azioni in blocco.' };
  const request = parsed.data;
  const projects = new Set<string>();
  const result = await executeBulkReports(request, async (target, payload) => {
    const response = await supabase.rpc('report_operation', { secret: null, target: target.environmentId, operation: request.operation, payload });
    if (!response.error && response.data?.project_id) projects.add(response.data.project_id);
    return response;
  }, async path => {
    const { error } = await storageClient().remove([path]);
    if (error) throw error;
  });
  if (result.succeeded.length) {
    revalidatePath('/dashboard');
    for (const id of projects) revalidatePath(`/dashboard/projects/${id}`);
  }
  return { data: result };
}
