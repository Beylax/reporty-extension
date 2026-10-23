import { createClient } from '@/lib/supabase/server';
import { storageClient } from '@/lib/supabase/storage';
import { isUuid, reportScreenshotPaths } from '@reporty/shared';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 400 });
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims || identity.claims.is_anonymous) return new Response(null, { status: 401 });
  const { data, error } = await supabase.from('issues').select('screenshot_path,screenshot_paths').eq('id', id).maybeSingle();
  if (error || !data?.screenshot_path) return new Response(null, { status: 404 });
  try {
    const bucket = storageClient();
    const urls = await Promise.all(reportScreenshotPaths(data).map(async path => {
      const { data: signed, error: signingError } = await bucket.createSignedUrl(path, 60);
      if (signingError || !signed) throw signingError;
      return signed.signedUrl;
    }));
    return Response.json({ url: urls[0], urls }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Screenshot non disponibile.' }, { status: 503 }); }
}
