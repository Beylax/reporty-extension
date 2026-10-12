import { z } from 'zod';

export const reportPrioritySchema = z.enum(['low', 'medium', 'high']);
export type ReportPriority = z.infer<typeof reportPrioritySchema>;
export const priorityLabels = { low: 'Bassa', medium: 'Media', high: 'Alta' } as const;

const coordinate = z.number().finite().nonnegative().max(10000000);
export const reportContextSchema = z.object({
  url: z.string().max(8192), origin: z.string().max(2048), pagePath: z.string().max(8192),
  anchor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pin'), documentX: coordinate, documentY: coordinate }),
    z.object({ kind: z.literal('element'), selector: z.string().min(1).max(4096), offsetX: z.number().min(0).max(1), offsetY: z.number().min(0).max(1), textExcerpt: z.string().max(200).optional() }),
  ]),
  viewport: z.object({ width: coordinate.positive(), height: coordinate.positive(), devicePixelRatio: z.number().positive().max(10) }),
  scroll: z.object({ x: coordinate, y: coordinate }),
});
export const reportRequestSchema = z.object({
  environmentId: z.string().uuid(), operation: z.enum(['list', 'thread', 'create', 'reply', 'status', 'priority', 'edit', 'delete', 'notifications', 'notification_read', 'notifications_read']),
  payload: z.object({ id: z.string().uuid().optional(), pagePath: z.string().max(8192).optional(), body: z.string().trim().min(1).max(10000).optional(), status: z.enum(['open','in_progress','validation','resolved']).optional(), priority: reportPrioritySchema.optional(), context: reportContextSchema.optional() }),
  screenshot: z.string().max(3500000).optional(),
});
export type Report = {
  id: string; environment_id: string; project_id: string; page_path: string; body: string;
  priority: ReportPriority; status: 'open' | 'in_progress' | 'validation' | 'resolved'; context: z.infer<typeof reportContextSchema>;
  author_id?: string | null; guest_session_id?: string | null; authorKey?: string; updated_at?: string | null; updated_by?: string | null; updated_guest_session_id?: string | null; updatedByName?: string | null; updatedByKey?: string | null;
  screenshot_path: string | null; created_at: string; commentCount?: number; authorName: string; canEdit: boolean; canChangeStatus: boolean;
};
export type ReportComment = { id: string; body: string; authorName: string; created_at: string };

export type ProjectParticipant = { key: string; kind: 'developer' | 'guest'; name: string };

/** Selected identities match either the author or the last editor. */
export function matchesReportUsers(report: Pick<Report, 'authorKey' | 'updatedByKey'>, users: string[]) {
  return !users.length || users.includes(report.authorKey ?? '') || users.includes(report.updatedByKey ?? '');
}

export type ReportNotification = {
  id: string; issue_id: string; project_id: string; environment_id: string;
  project_name: string; environment_name: string; page_path: string; body: string;
  /** Null identifies a report creation notification. */
  previous_status: Report['status'] | null; status: Report['status']; actor_name: string;
  created_at: string; read_at: string | null;
};

export const bulkReportRequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status'), value: z.enum(['open','in_progress','validation','resolved']), targets: z.array(z.object({ id: z.string().uuid(), environmentId: z.string().uuid() })).min(1).max(50) }),
  z.object({ operation: z.literal('priority'), value: reportPrioritySchema, targets: z.array(z.object({ id: z.string().uuid(), environmentId: z.string().uuid() })).min(1).max(50) }),
  z.object({ operation: z.literal('delete'), targets: z.array(z.object({ id: z.string().uuid(), environmentId: z.string().uuid() })).min(1).max(50) }),
]);
export type BulkReportRequest = z.infer<typeof bulkReportRequestSchema>;
export type BulkReportResult = { succeeded: string[]; failed: string[]; storageWarnings: string[] };
