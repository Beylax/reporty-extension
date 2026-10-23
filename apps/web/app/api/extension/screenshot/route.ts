import { createClient } from '@/lib/supabase/server';
import { storageClient } from '@/lib/supabase/storage';
import { validToken } from '@/lib/invitation-token';
import { isUuid, reportScreenshotPaths } from '@reporty/shared';

export async function POST(request: Request) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!validToken(secret)) return new Response(null, { status: 401 });
  let input;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!isUuid(String(input.environmentId)) || !isUuid(String(input.id))) return new Response(null, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('report_operation', { secret, target: input.environmentId, operation: 'thread', payload: { id: input.id } });
  if (error || !data?.issue?.screenshot_path) return new Response(null, { status: 403 });
  try {
    const bucket = storageClient();
    const urls = await Promise.all(reportScreenshotPaths(data.issue).map(async path => {
      const { data: signed, error: signingError } = await bucket.createSignedUrl(path, 60);
      if (signingError || !signed) throw signingError;
      return signed.signedUrl;
    }));
    return Response.json({ url: urls[0], urls }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Screenshot non disponibile.' }, { status: 503 }); }
}
