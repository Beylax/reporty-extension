import 'server-only';
import { attachmentRequestSchema, attachmentMime, isPreviewImage, MAX_ATTACHMENT_BYTES } from '@reporty/shared';
import { createClient } from '@/lib/supabase/server';
import { storageClient, storageServiceClient, removeStoredFiles } from '@/lib/supabase/storage';

export async function handleAttachment(request: Request, secret: string | null) {
  let input;
  try { input = attachmentRequestSchema.parse(await request.json()); }
  catch { return Response.json({ error: 'Allegato non valido.' }, { status: 400 }); }
  const supabase = await createClient();
  if (secret === null) {
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims || data.claims.is_anonymous) return Response.json({ error: 'Accesso richiesto.' }, { status: 401 });
  }
  let bytes: Buffer | undefined;
  if (input.operation === 'upload') {
    if (!input.name || !input.content || input.content.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.content)) return Response.json({ error: 'File non valido.' }, { status: 400 });
    bytes = Buffer.from(input.content, 'base64');
    if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) return Response.json({ error: 'Il file deve pesare al massimo 2,5 MB.' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('attachment_operation', {
    secret, target: input.environmentId, operation: input.operation === 'upload' ? 'reserve' : input.operation,
    payload: { id: input.id, issueId: input.issueId, ...(bytes ? { name: input.name!.replace(/[\x00-\x1f\x7f/\\]/g,'_'), mime: attachmentMime(bytes), size: bytes.length } : {}) },
  });
  if (error) return Response.json({ error: error.code === '42501' ? 'Allegato non disponibile o accesso revocato.' : 'Impossibile allegare il file. Massimo 5 allegati per risposta.' }, { status: error.code === '42501' ? 403 : 400 });
  try {
    const bucket = storageClient('attachments');
    if (bytes) {
      // Never overwrite: retries after a lost response reuse the same reservation and object.
      const { error: uploadError } = await bucket.upload(data.path, bytes, { contentType: data.mime, upsert: false });
      if (uploadError && String(uploadError.statusCode) !== '409' && String(uploadError.statusCode) !== '400') throw uploadError;
      if (uploadError) {
        const { data: existing, error: infoError } = await bucket.info(data.path);
        if (infoError || existing?.size !== bytes.length) throw uploadError;
      }
      const { error: checkError } = await supabase.rpc('attachment_operation',{secret,target:input.environmentId,operation:'check',payload:{id:input.id,issueId:input.issueId}});
      if (checkError) {
        // A deleted report may disappear during upload. A revoked session or an already
        // committed reply must never cause deletion of a still referenced object.
        const { data: tracked, error: lookupError } = await storageServiceClient().from('comment_attachments').select('id').eq('id',input.id).eq('path',data.path).maybeSingle();
        if (!lookupError && !tracked) await removeStoredFiles([data.path]);
        throw checkError;
      }
      return Response.json({ id: data.id }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (input.operation === 'remove') {
      if (data?.path) {
        await removeStoredFiles([data.path]);
        const { error: discardError } = await supabase.rpc('attachment_operation',{secret,target:input.environmentId,operation:'discard',payload:{id:input.id,issueId:input.issueId}});
        if (discardError) throw discardError;
      }
      return Response.json({ success: true });
    }
    const { data: signed, error: signingError } = await bucket.createSignedUrl(data.path,60, { download: isPreviewImage(data.mime) ? false : data.name });
    if (signingError || !signed) throw signingError;
    return Response.json({ url: signed.signedUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Operazione sul file non riuscita. Riprova.' }, { status: 503 }); }
}
