import { automationDb, required } from '@/lib/automation/config';
import { claudeClient, reconcileTask } from '@/lib/automation/worker';
export const maxDuration = 120;
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 100000) return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > 100000) return new Response(null, { status: 413 });
  let event;
  try { event = claudeClient().beta.webhooks.unwrap(body, { headers: Object.fromEntries(request.headers), key: required('ANTHROPIC_WEBHOOK_SIGNING_KEY') }); }
  catch { return new Response(null, { status: 400 }); }
  if (!event.data.type.startsWith('session.')) return new Response(null, { status: 204 });
  const { data, error } = await automationDb().from('claude_tasks').select('id').eq('session_id', event.data.id).maybeSingle();
  if (error) return new Response(null, { status: 503 });
  // Early/duplicate/out-of-order deliveries are harmless; the scheduled reconciler is authoritative.
  if (data) await reconcileTask(data.id);
  return new Response(null, { status: 204 });
}
