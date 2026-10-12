import { createClient } from '@/lib/supabase/server';
import { storageClient } from '@/lib/supabase/storage';
import { validToken } from '@/lib/invitation-token';
import { getPageContext, reportRequestSchema } from '@reporty/shared';

export async function POST(request: Request) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!validToken(secret)) return Response.json({ error: 'Sessione richiesta.' }, { status: 401 });
  let input;
  try { input = reportRequestSchema.parse(await request.json()); }
  catch { return Response.json({ error: 'Dati non validi.' }, { status: 400 }); }
  const { environmentId: target, operation, payload } = input;
  if (operation === 'create') {
    if (!payload.context || !payload.body) return Response.json({ error: 'Commento e contesto richiesti.' }, { status: 400 });
    try {
      const page = getPageContext(payload.context.url);
      if (page.origin !== payload.context.origin || page.pagePath !== payload.context.pagePath) throw new Error();
    } catch { return Response.json({ error: 'Pagina non valida.' }, { status: 400 }); }
  } else if (!['list', 'notifications', 'notifications_read'].includes(operation) && !payload.id) return Response.json({ error: 'Segnalazione richiesta.' }, { status: 400 });
  let image: Buffer | undefined;
  if (input.screenshot) {
    if (operation !== 'create' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(input.screenshot)) return Response.json({ error: 'Screenshot non valido.' }, { status: 400 });
    image = Buffer.from(input.screenshot.split(',')[1]!, 'base64');
    if (image.length > 2500000 || image[0] !== 255 || image[1] !== 216 || image[2] !== 255) return Response.json({ error: 'Screenshot troppo grande o non valido.' }, { status: 400 });
    try { storageClient(); } catch { return Response.json({ error: 'Configura SUPABASE_SECRET_KEY sul backend oppure rimuovi lo screenshot.' }, { status: 503 }); }
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(operation.startsWith('notification') ? 'notification_operation' : 'report_operation', { secret, target, operation, payload });
  if (error) return Response.json({ error: error.code === '42501' ? 'Accesso non consentito o revocato.' : 'Operazione non riuscita.' }, { status: error.code === '42501' ? 403 : 400 });
  let warning: string | undefined;
  if (image) {
    const path = `${data.project_id}/${data.id}.jpg`;
    const bucket = storageClient();
    const { error: uploadError } = await bucket.upload(path, image, { contentType: 'image/jpeg', upsert: false });
    if (!uploadError) {
      const { error: attachError } = await supabase.rpc('report_operation', { secret, target, operation: 'screenshot', payload: { id: data.id } });
      if (attachError) { await bucket.remove([path]); warning = 'Segnalazione salvata, screenshot non allegato.'; }
    } else warning = 'Segnalazione salvata, caricamento screenshot non riuscito.';
  }
  if (operation === 'delete' && data.screenshot_path) {
    try { await storageClient().remove([data.screenshot_path]); } catch { /* Deletion of the report succeeds without storage configuration. */ }
  }
  return Response.json({ data, warning }, { headers: { 'Cache-Control': 'no-store' } });
}
