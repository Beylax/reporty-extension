import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { storageClient, storageServiceClient, removeStoredFiles } from '@/lib/supabase/storage';
import { getPageContext, reportRequestSchema, reportScreenshotPaths } from '@reporty/shared';

export async function handleReportRequest(request: Request, secret: string | null, allowedOperations?: string[]) {
  const supabase = await createClient();
  if (secret === null) {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims || data.claims.is_anonymous) return Response.json({ error: 'Accesso richiesto.' }, { status: 401 });
  }
  let input;
  try { input = reportRequestSchema.parse(await request.json()); }
  catch { return Response.json({ error: 'Dati non validi.' }, { status: 400 }); }
  const { environmentId: target, operation, payload } = input;
  if (allowedOperations && !allowedOperations.includes(operation)) return Response.json({ error: 'Operazione non valida.' }, { status: 400 });
  if (operation === 'create') {
    if (!payload.context || !payload.body) return Response.json({ error: 'Commento e contesto richiesti.' }, { status: 400 });
    try {
      const url = new URL(payload.context.url);
      if (url.username || url.password) throw new Error();
      const page = getPageContext(url.href);
      if (page.origin !== payload.context.origin || page.pagePath !== payload.context.pagePath) throw new Error();
    } catch { return Response.json({ error: 'Pagina non valida.' }, { status: 400 }); }
  } else if (!['list', 'page', 'pins', 'notifications', 'notifications_read'].includes(operation) && !payload.id) return Response.json({ error: 'Segnalazione richiesta.' }, { status: 400 });
  let image: Buffer | undefined;
  if (operation === 'screenshot' && (!input.screenshot || !payload.screenshotId)) return Response.json({ error: 'Screenshot richiesto.' }, { status: 400 });
  if (input.screenshot) {
    if (!['create', 'screenshot'].includes(operation) || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(input.screenshot)) return Response.json({ error: 'Screenshot non valido.' }, { status: 400 });
    image = Buffer.from(input.screenshot.split(',')[1]!, 'base64');
    if (image.length > 2500000 || image[0] !== 255 || image[1] !== 216 || image[2] !== 255) return Response.json({ error: 'Screenshot troppo grande o non valido.' }, { status: 400 });
    try { storageClient(); } catch { return Response.json({ error: 'Configura SUPABASE_SECRET_KEY sul backend oppure rimuovi lo screenshot.' }, { status: 503 }); }
  }
  const { data, error } = operation === 'page'
    ? await supabase.rpc('report_page', { secret, target, payload: { ...payload, projectScope: false } })
    : operation === 'pins' ? await supabase.rpc('report_pins', { secret, target, payload })
    : await supabase.rpc(operation.startsWith('notification') ? 'notification_operation' : 'report_operation', { secret, target, operation: operation === 'screenshot' ? 'screenshot_prepare' : operation, payload });
  if (error) return Response.json({ error: error.message === 'REVIEWER_NAME_REQUIRED' ? 'Inserisci il tuo nome per intervenire sulla segnalazione.' : error.code === '42501' ? 'Accesso non consentito o revocato.' : 'Operazione non riuscita.' }, { status: error.code === '42501' ? 403 : 400 });
  let warning: string | undefined;
  if (image) {
    const path = payload.screenshotId ? `${data.project_id}/${data.id}/${payload.screenshotId}.jpg` : `${data.project_id}/${data.id}.jpg`;
    const bucket = storageClient();
    const { error: uploadError } = await bucket.upload(path, image, { contentType: 'image/jpeg', upsert: false });
    let uploaded = !uploadError;
    if (uploadError && ['409', '400'].includes(String(uploadError.statusCode))) {
      const { data: existing, error: readError } = await bucket.download(path);
      uploaded = !readError && Boolean(existing) && Buffer.from(await existing!.arrayBuffer()).equals(image);
    }
    if (uploaded) {
      const { error: attachError } = await supabase.rpc('report_operation', { secret, target, operation: 'screenshot', payload: { id: data.id, ...(payload.screenshotId ? { screenshotId: payload.screenshotId } : {}) } });
      if (attachError) {
        if (!uploadError) {
          // An RPC response can be lost after commit. Preserve images that are
          // already referenced, and keep uncertain uploads available for retry.
          const { data: tracked, error: lookupError } = await storageServiceClient().from('issues').select('screenshot_path,screenshot_paths').eq('id', data.id).maybeSingle();
          if (!lookupError && (!tracked || !reportScreenshotPaths(tracked).includes(path))) {
            const { error: cleanupError } = await bucket.remove([path]);
            if (cleanupError) warning = 'Screenshot non allegato; pulizia del file incompleta.';
          } else warning = 'Impossibile confermare il collegamento dello screenshot. Riprova.';
        }
        warning ??= 'Segnalazione salvata, screenshot non allegato.';
      }
    } else warning = 'Segnalazione salvata, caricamento screenshot non riuscito.';
    if (warning && operation === 'screenshot') return Response.json({ error: warning }, { status: 503 });
  }
  if (operation === 'delete') {
    try { await removeStoredFiles([...reportScreenshotPaths(data),...(data.attachment_paths ?? [])]); } catch { warning = 'Segnalazione eliminata; pulizia dei file incompleta.'; }
  }
  return Response.json({ data, warning }, { headers: { 'Cache-Control': 'no-store' } });
}
