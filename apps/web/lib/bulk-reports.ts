import type { BulkReportRequest, BulkReportResult } from '@reporty/shared';

type MutationResult = { error?: unknown; data?: { screenshot_path?: string | null } | null };

/** Each target goes through the authorized report RPC. Failures remain retryable. */
export async function executeBulkReports(
  request: BulkReportRequest,
  mutate: (target: BulkReportRequest['targets'][number], payload: { id: string; status?: string; priority?: string }) => Promise<MutationResult>,
  removeScreenshot: (path: string) => Promise<void>,
): Promise<BulkReportResult> {
  const result: BulkReportResult = { succeeded: [], failed: [], storageWarnings: [] };
  const targets = [...new Map(request.targets.map(target => [target.id, target])).values()];
  for (let start = 0; start < targets.length; start += 5) {
    await Promise.all(targets.slice(start,start + 5).map(async target => {
      let mutation: MutationResult;
      try {
        mutation = await mutate(target, { id: target.id, ...(request.operation === 'status' ? { status: request.value } : request.operation === 'priority' ? { priority: request.value } : {}) });
        if (mutation.error) throw mutation.error;
      } catch { result.failed.push(target.id); return; }
      result.succeeded.push(target.id);
      if (request.operation === 'delete' && mutation.data?.screenshot_path) {
        try { await removeScreenshot(mutation.data.screenshot_path); }
        catch { result.storageWarnings.push(target.id); }
      }
    }));
  }
  return result;
}
