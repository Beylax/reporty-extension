import { createClient } from '@/lib/supabase/server';
import { storageClient } from '@/lib/supabase/storage';
import { isUuid } from '@reporty/shared';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 400 });
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims || identity.claims.is_anonymous) return new Response(null, { status: 401 });
  const { data, error } = await supabase.from('issues').select('screenshot_path').eq('id', id).maybeSingle();
  if (error || !data?.screenshot_path) return new Response(null, { status: 404 });
  try {
    const { data: signed, error: signingError } = await storageClient().createSignedUrl(data.screenshot_path, 60);
    if (signingError) throw signingError;
    return Response.json({ url: signed!.signedUrl }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ error: 'Screenshot non disponibile.' }, { status: 503 }); }
}
