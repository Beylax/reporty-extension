import { z } from 'zod';
import type { ReplyAttachment } from './attachments';

export const reportPrioritySchema = z.enum(['low', 'medium', 'high']);
export type ReportPriority = z.infer<typeof reportPrioritySchema>;
export const priorityLabels = { low: 'Bassa', medium: 'Media', high: 'Alta' } as const;

const coordinate = z.number().finite().nonnegative().max(10000000);
export const reportContextSchema = z.object({
  url: z.string().max(8192), origin: z.string().max(2048), pagePath: z.string().max(8192),
  anchor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('page') }),
    z.object({ kind: z.literal('pin'), documentX: coordinate, documentY: coordinate }),
    z.object({ kind: z.literal('element'), selector: z.string().min(1).max(4096), offsetX: z.number().min(0).max(1), offsetY: z.number().min(0).max(1), textExcerpt: z.string().max(200).optional() }),
  ]),
  viewport: z.object({ width: coordinate.positive(), height: coordinate.positive(), devicePixelRatio: z.number().positive().max(10) }).optional(),
  scroll: z.object({ x: coordinate, y: coordinate }).optional(),
}).superRefine((context, validation) => {
  if (context.anchor.kind !== 'page' && (!context.viewport || !context.scroll)) validation.addIssue({ code: z.ZodIssueCode.custom, message: 'Viewport and scroll are required for positioned reports' });
});
export const reportPageSchema = z.object({
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional(),
  projectScope: z.boolean().optional(), selectionOnly: z.boolean().optional(), id: z.string().uuid().optional(), pagePath: z.string().max(8192).optional(),
  search: z.string().max(10000).optional(), statuses: z.array(z.enum(['open','in_progress','validation','resolved'])).max(4).optional(),
  priorities: z.array(reportPrioritySchema).max(3).optional(), environments: z.array(z.string().uuid()).optional(),
  pages: z.array(z.string().max(8192)).optional(), users: z.array(z.string().max(100)).optional(),
  sort: z.object({ field: z.enum(['status','priority','created_at','updated_at','body','environment','authorName']), direction: z.enum(['asc','desc']) }).optional(),
});
export type ReportPageQuery = z.infer<typeof reportPageSchema>;
export type ReportPage = { reports: Report[]; total: number; projectTotal: number; pages: string[] };

export const notificationPageSchema = z.object({
  paginated: z.literal(true).optional(), mode: z.enum(['page','summary']).optional(),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional(),
  projects: z.array(z.string().uuid()).optional(), environments: z.array(z.string().uuid()).optional(),
  statuses: z.array(z.enum(['open','in_progress','validation','resolved'])).max(4).optional(),
  reads: z.array(z.enum(['read','unread'])).max(2).optional(), pagePath: z.string().max(8192).optional(),
  after: z.object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() }).optional(),
});
export type NotificationPageQuery = z.infer<typeof notificationPageSchema>;
export type NotificationCursor = NonNullable<NotificationPageQuery['after']>;
export type NotificationPage = {
  items: ReportNotification[]; total: number; totalInScope: number; unread: number;
  cursor: NotificationCursor | null; arrivalCount: number; latest: ReportNotification | null;
  projects: { value: string; label: string }[]; environments: { value: string; label: string; project_id: string }[];
};

export const reportRequestSchema = z.object({
  environmentId: z.string().uuid(), operation: z.enum(['list', 'page', 'pins', 'thread', 'create', 'screenshot', 'reply', 'status', 'priority', 'edit', 'delete', 'notifications', 'notification_read', 'notifications_read']),
  payload: reportPageSchema.merge(notificationPageSchema).extend({ id: z.string().uuid().optional(), screenshotId: z.string().uuid().optional(), pagePath: z.string().max(8192).optional(), body: z.string().trim().min(1).max(10000).optional(), status: z.enum(['open','in_progress','validation','resolved']).optional(), priority: reportPrioritySchema.optional(), context: reportContextSchema.optional(), replyId: z.string().uuid().optional(), attachments: z.array(z.string().uuid()).max(5).optional() }),
  screenshot: z.string().max(3500000).optional(),
});
export type Report = {
  id: string; environment_id: string; project_id: string; page_path: string; body: string;
  priority: ReportPriority; status: 'open' | 'in_progress' | 'validation' | 'resolved'; context: z.infer<typeof reportContextSchema>;
  author_id?: string | null; guest_session_id?: string | null; authorKey?: string; updated_at?: string | null; updated_by?: string | null; updated_guest_session_id?: string | null; updatedByName?: string | null; updatedByKey?: string | null;
  screenshot_path: string | null; screenshot_paths?: string[]; attachments?: ReplyAttachment[]; created_at: string; commentCount?: number; authorName: string; canEdit: boolean; canChangeStatus: boolean;
};
export type ReportComment = { id: string; attachments?: ReplyAttachment[]; body: string; authorName: string; created_at: string };

export type ProjectParticipant = { key: string; kind: 'developer' | 'guest'; name: string };

/** Selected identities match either the author or the last editor. */
export function matchesReportUsers(report: Pick<Report, 'authorKey' | 'updatedByKey'>, users: string[]) {
  return !users.length || users.includes(report.authorKey ?? '') || users.includes(report.updatedByKey ?? '');
}

export type ReportNotification = {
  id: string; issue_id: string; project_id: string; environment_id: string;
  project_name: string; environment_name: string; page_path: string; body: string;
  kind?: 'created' | 'status_changed' | 'reply';
  comment_id?: string | null; reply_body?: string | null;
  /** Null for creation and replies; kind distinguishes the event. */
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

export type ReportPin = Pick<Report, 'id' | 'environment_id' | 'page_path' | 'status' | 'priority' | 'body' | 'authorName'> & { context: Pick<Report['context'], 'anchor' | 'scroll'> };

export type ReportSelection = Pick<Report, 'id' | 'environment_id' | 'canEdit' | 'canChangeStatus'>;
