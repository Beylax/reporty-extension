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
  environmentId: z.string().uuid(), operation: z.enum(['list', 'thread', 'create', 'reply', 'status', 'priority', 'edit', 'delete']),
  payload: z.object({ id: z.string().uuid().optional(), pagePath: z.string().max(8192).optional(), body: z.string().trim().min(1).max(10000).optional(), status: z.enum(['open','in_progress','resolved']).optional(), priority: reportPrioritySchema.optional(), context: reportContextSchema.optional() }),
  screenshot: z.string().max(3500000).optional(),
});
export type Report = {
  id: string; environment_id: string; project_id: string; page_path: string; body: string;
  priority: ReportPriority; status: 'open' | 'in_progress' | 'resolved'; context: z.infer<typeof reportContextSchema>;
  screenshot_path: string | null; created_at: string; authorName: string; canEdit: boolean; canChangeStatus: boolean;
};
export type ReportComment = { id: string; body: string; authorName: string; created_at: string };
