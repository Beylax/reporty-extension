import { timingSafeEqual } from 'node:crypto';
import { automationDb, required } from '@/lib/automation/config';
import { reconcileTask } from '@/lib/automation/worker';
import { activeTaskStates } from '@/lib/automation/types';
export const maxDuration = 120;
export async function GET(request: Request) {
  const supplied = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from(`Bearer ${required('CRON_SECRET')}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
  const { data, error } = await automationDb().from('claude_tasks').select('id').in('status', [...activeTaskStates]).order('updated_at').limit(3);
  if (error) return new Response(null, { status: 503 });
  const results = await Promise.allSettled((data ?? []).map(task => reconcileTask(task.id)));
  return Response.json({ checked: results.length }, { status: results.some(result => result.status === 'rejected') ? 503 : 200 });
}
