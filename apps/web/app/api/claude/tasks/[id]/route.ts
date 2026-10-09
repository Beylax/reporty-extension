import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireUser(), { id } = await params;
  if (!isUuid(id)) return new Response(null, { status: 400 });
  const { data, error } = await supabase.from('claude_tasks').select('id,status,message,pr_url,created_at,updated_at').eq('issue_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return Response.json({ error: 'Monitoraggio non disponibile.' }, { status: 503 });
  return Response.json({ task: data }, { headers: { 'Cache-Control': 'no-store' } });
}
