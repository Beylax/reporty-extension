import type { BulkReportRequest, BulkReportResult, Report } from '@reporty/shared';

export type BulkReportAction = { operation: 'update'; status?: Report['status']; priority?: Report['priority'] } | { operation: 'delete' };
export type BulkReportProgress = { completed: number; total: number; operation: BulkReportAction['operation'] };

/** Keep partially updated reports selected until every requested field succeeds. */
export async function applyBulkReportBatch(
  targets: BulkReportRequest['targets'],
  action: BulkReportAction,
  mutate: (request: BulkReportRequest) => Promise<{ error?: string; data?: BulkReportResult }>,
): Promise<BulkReportResult> {
  const operations: BulkReportRequest[] = action.operation === 'delete' ? [{ operation: 'delete', targets }] : [
    ...(action.status ? [{ operation: 'status' as const, value: action.status, targets }] : []),
    ...(action.priority ? [{ operation: 'priority' as const, value: action.priority, targets }] : []),
  ];
  if (!operations.length) throw new Error('Scegli uno stato o una priorità da applicare.');
  let remaining = targets;
  const storageWarnings: string[] = [];
  for (const operation of operations) {
    if (!remaining.length) break;
    const result = await mutate({ ...operation, targets: remaining });
    if (result.error || !result.data) throw new Error(result.error ?? 'Risultato non disponibile.');
    const succeeded = new Set(result.data.succeeded);
    remaining = remaining.filter(target => succeeded.has(target.id));
    storageWarnings.push(...result.data.storageWarnings);
  }
  const succeeded = new Set(remaining.map(target => target.id));
  return { succeeded: [...succeeded], failed: targets.filter(target => !succeeded.has(target.id)).map(target => target.id), storageWarnings };
}
