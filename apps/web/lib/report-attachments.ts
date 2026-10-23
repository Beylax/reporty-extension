import 'server-only';
import type { AttachmentRequest } from '@reporty/shared';
import type { createClient } from '@/lib/supabase/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { storageClient, removeStoredFiles } from '@/lib/supabase/storage';

type Input = AttachmentRequest & { environmentId: string; issueId: string };
export async function handleReportAttachment(input: Input, secret: string | null, supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!['begin_upload', 'complete_upload', 'read', 'remove'].includes(input.operation)
    || (input.operation === 'begin_upload' && (!input.name || !input.size)) || input.content) return Response.json({ error: 'File non valido.' }, { status: 400 });
  const operation = input.operation === 'begin_upload' ? 'reserve' : input.operation === 'complete_upload' ? 'commit' : input.operation;
  const { data, error } = await supabase.rpc('report_attachment_operation', {
    secret, target: input.environmentId, operation,
    payload: { id: input.id, issueId: input.issueId, ...(operation === 'reserve' ? { name: input.name!.replace(/[\x00-\x1f\x7f/\\]/g, '_'), size: input.size } : {}) },
  });
  if (error) return Response.json({ error: error.message === 'REVIEWER_NAME_REQUIRED' ? 'Inserisci il tuo nome per allegare file.' : error.code === '42501' ? 'File non disponibile o accesso revocato.' : 'Impossibile allegare il file. Massimo 5 file, fino a 5 MB ciascuno.' }, { status: error.code === '42501' ? 403 : 400 });
  try {
    const bucket = storageClient('report-attachments');
    if (operation === 'reserve') {
      if (data.committed) return Response.json({ id: data.id, completed: true }, { headers: { 'Cache-Control': 'no-store' } });
      // A prior upload may have finished even if its response was lost.
      const { data: existing } = await bucket.info(data.path);
      if (existing) {
        const { error: commitError } = await supabase.rpc('report_attachment_operation', { secret, target: input.environmentId, operation: 'commit', payload: { id: input.id, issueId: input.issueId } });
        if (commitError) throw commitError;
        return Response.json({ id: data.id, completed: true }, { headers: { 'Cache-Control': 'no-store' } });
      }
      const { data: signed, error: signError } = await bucket.createSignedUploadUrl(data.path, { upsert: false });
      if (signError || !signed) throw signError;
      const endpoint = new URL(supabaseConfig().url);
      if (/^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname)) endpoint.hostname = endpoint.hostname.replace('.supabase.co', '.storage.supabase.co');
      endpoint.pathname = '/storage/v1/upload/resumable'; endpoint.search = ''; endpoint.hash = '';
      return Response.json({ id: data.id, upload: { endpoint: endpoint.toString(), token: signed.token, bucket: 'report-attachments', path: data.path, contentType: 'application/octet-stream' } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (operation === 'commit') return Response.json({ id: data.id, completed: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (operation === 'remove') {
      if (data?.path) {
        await removeStoredFiles([data.path]);
        const { error: discardError } = await supabase.rpc('report_attachment_operation', { secret, target: input.environmentId, operation: 'discard', payload: { id: input.id, issueId: input.issueId } });
        if (discardError) throw discardError;
      }
      return Response.json({ success: true });
    }
    // Arbitrary files always download; HTML/SVG/PDF never execute in Reporty's origin.
    const { data: signed, error: signError } = await bucket.createSignedUrl(data.path, 60, { download: data.name });
    if (signError || !signed) throw signError;
    return Response.json({ url: signed.signedUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Operazione sul file non riuscita. Riprova.' }, { status: 503 }); }
}
