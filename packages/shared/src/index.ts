export { createNotificationArrivalTracker, notificationKind, notificationSummary } from './notifications';
export type { ReportSort, ReportSortField } from './report-order';
export { compareReports, compareReportsBy } from './report-order';
export { formatReportDateTime } from './date';
export { getPageContext } from './page';
export { isPageActive, setEmbeddedPageActive, subscribePageActivity, whenPageActive } from './page-activity';
export { normalizeOrigin, validateName, isUuid } from './project';
export { bulkReportRequestSchema, matchesReportUsers, reportContextSchema, reportRequestSchema, reportPrioritySchema, priorityLabels } from './reports';
export type { BulkReportRequest, BulkReportResult, ReportNotification, Report, ReportComment, ReportPriority, ProjectParticipant } from './reports';

export const issueStatuses = ['open', 'in_progress', 'validation', 'resolved'] as const;
export type IssueStatus = (typeof issueStatuses)[number];
export const floatingPositions = ['bottom_right', 'bottom_left', 'top_right', 'top_left'] as const;
export type FloatingPosition = (typeof floatingPositions)[number];

export type Anchor =
  | { kind: 'page' }
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
export { MAX_ATTACHMENT_BYTES, MAX_REPLY_ATTACHMENTS, MAX_REPORT_ATTACHMENT_BYTES, MAX_REPORT_ATTACHMENTS, attachmentRequestSchema, attachmentMime, isPreviewImage } from './attachments';
export type { AttachmentRequest, ReplyAttachment, AttachmentResponse } from './attachments';

export { reportPageSchema } from './reports';
export type { ReportPage, ReportPageQuery, ReportPin, ReportSelection } from './reports';

export { notificationPageSchema } from './reports';
export type { NotificationPageQuery, NotificationPage, NotificationCursor } from './reports';
export { MAX_REPORT_SCREENSHOTS, reportScreenshotPaths } from './screenshots';
