export { getPageContext } from './page';
export { normalizeOrigin, validateName, isUuid } from './project';
export { reportContextSchema, reportRequestSchema, reportPrioritySchema, priorityLabels } from './reports';
export type { Report, ReportComment, ReportPriority } from './reports';

export const issueStatuses = ['open', 'in_progress', 'resolved'] as const;
export type IssueStatus = (typeof issueStatuses)[number];
export const floatingPositions = ['bottom_right', 'bottom_left', 'top_right', 'top_left'] as const;
export type FloatingPosition = (typeof floatingPositions)[number];

export type Anchor =
  | { kind: 'element'; selector: string; offsetX: number; offsetY: number; textExcerpt?: string }
  | { kind: 'pin'; documentX: number; documentY: number };

export interface PageContext {
  origin: string;
  pagePath: string;
  url: string;
}

export interface ReportContext extends PageContext {
  anchor: Anchor;
  viewport: { width: number; height: number; devicePixelRatio: number };
  scroll: { x: number; y: number };
}
