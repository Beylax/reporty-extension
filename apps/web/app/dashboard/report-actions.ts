'use server';

import { revalidatePath } from 'next/cache';
import { bulkReportRequestSchema, isUuid, reportPageSchema, reportScreenshotPaths, type ReportPage, type ReportSelection } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { executeBulkReports } from '@/lib/bulk-reports';
import { removeStoredFiles } from '@/lib/supabase/storage';

export async function mutateReport(environmentId: string, operation: string, payload: { id: string; body?: string; status?: string; priority?: string; replyId?: string; attachments?: string[] }, refreshDashboard = true) {
  const { supabase } = await requireUser();
  if (!isUuid(environmentId) || !isUuid(payload.id) || !['reply', 'edit', 'status', 'priority', 'delete'].includes(operation)) return { error: 'Dati non validi.' };
  const { data, error } = await supabase.rpc('report_operation', { secret: null, target: environmentId, operation, payload });
  if (error) return { error: 'Operazione non riuscita. Verifica i permessi e riprova.' };
  let warning: string | undefined;
  if (operation === 'delete') {
    try { await removeStoredFiles([...reportScreenshotPaths(data ?? {}),...(data?.attachment_paths ?? [])]); } catch { warning = 'Segnalazione eliminata; pulizia dei file incompleta.'; }
  }
  // Kanban confirms status/priority in its local cache and reloads only its data.
  if (refreshDashboard !== false || !['status', 'priority'].includes(operation)) revalidatePath('/dashboard');
  return { success: true, warning };
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
    await removeStoredFiles([path]);
  });
  if (result.succeeded.length) {
    revalidatePath('/dashboard');
    for (const id of projects) revalidatePath(`/dashboard/projects/${id}`);
  }
  return { data: result };
}

export async function getReportPage(environmentId: string, input: unknown): Promise<ReportPage> {
  const { supabase } = await requireUser();
  const parsed = reportPageSchema.safeParse(input);
  if (!isUuid(environmentId) || !parsed.success) throw new Error('Dati di paginazione non validi.');
  const { data, error } = await supabase.rpc('report_page', { secret: null, target: environmentId, payload: { ...parsed.data, projectScope: true } });
  if (error) throw new Error('Caricamento segnalazioni non riuscito. Verifica che report_pagination.sql sia applicato e riprova.');
  return data as ReportPage;
}

export async function getReportSelection(environmentId: string, input: unknown): Promise<ReportSelection[]> {
  const page = await getReportPage(environmentId, { ...reportPageSchema.parse(input), selectionOnly: true });
  return page.reports;
}
