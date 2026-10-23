import { ReportContextDetails } from '@reporty/shared/ui/report-context';
import { ReportAttachmentPicker, type DraftReportFile, type ReportFileProgress } from '@reporty/shared/ui/report-attachments';
import { uploadReportFile } from '@reporty/shared/report-file-upload';
import { ReplyComposer, ReplyAttachmentList } from '@reporty/shared/ui/reply-attachments';
import { TooltipButton } from '@reporty/shared/ui/tooltip-button';
import type { AttachmentRequest, AttachmentResponse, ReplyAttachment } from '@reporty/shared';
import { ReportPagination, REPORT_PAGE_SIZE } from '@/components/report-pagination';
import { FilterPill } from '@/components/filter-pill';
import { ReportIcon } from '@/components/report-icon';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioButtons } from '@/components/ui/radio-buttons';
import { useDebouncedValue } from '@reporty/shared/ui/use-debounced-value';
import { DeleteConfirm } from '@/components/delete-confirm';
import { ReportOrder } from '@/components/report-order';
import { ReportFilter } from '@/components/report-filter';
import { SelectField } from '@/components/ui/select';
import { openerPositionOptions, isOpenerPosition } from '@/lib/opener-position';
import { ThemeSwitch } from '@/components/theme-switch';

import { NotificationCard, NotificationRowsSkeleton } from '@/components/notification-content';
import { useNotificationFeed } from '@reporty/shared/ui/use-notification-feed';
import { InfiniteList } from '@reporty/shared/ui/infinite-list';
import { BrandLogo } from '@/components/brand-logo';
import { useNotify } from '@/components/ui/toast';
import { RepliesSkeleton, ReportDetailSkeleton, ReportRowsSkeleton, ScreenshotSkeleton } from '@/components/loading-skeletons';
import { ScreenshotSelector } from '@/components/screenshot-selector';
import type { ScreenshotImage } from '@/lib/screenshot-selection';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import type { ReportSort, ReportNotification } from '@reporty/shared';
import { useReportPage } from '@reporty/shared/ui/use-report-page';
import { usePageActive } from '@reporty/shared/ui/use-page-active';
import { isPageActive, MAX_REPORT_SCREENSHOTS } from '@reporty/shared';
import type { NotificationPage, ReportPage, ReportPageQuery, ReportPin } from '@reporty/shared';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Bell, Settings, Menu, X, Crosshair, Eye, EyeOff, MapPin, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { notificationSummary, formatReportDateTime, getPageContext, priorityLabels, type ReportPriority, type Anchor, type Report, type ReportComment, type ReportContext } from '@reporty/shared';
import type { Environment, Site } from '@/lib/session';
import { captureHighlightedScreenshot, capturePageScreenshot } from '@/lib/screenshot';
import { captureTab, stopTabCapture } from '@/lib/capture-tab';
import { elementAnchor, anchorPosition } from '@/lib/anchor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { anchorPosition as locate } from '@/lib/anchor';
import { pinPreviewLayout } from '@/lib/pin-preview';
import { useReviewerIdentity } from '@/components/reviewer-identity';

async function extensionMessage(body: object) {
  const response = await browser.runtime.sendMessage(body);
  if (!response?.ok) throw new Error(response?.error ?? 'Operazione non riuscita.');
  return response.data;
}
const statusLabels = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
const statusColors = { open: 'bg-red-100 text-red-800', in_progress: 'bg-orange-100 text-orange-800', validation: 'bg-blue-50 text-blue-900 dark:bg-blue-100 dark:text-blue-950', resolved: 'bg-emerald-100 text-emerald-800' };
const pinColors = { open: 'bg-red-600', in_progress: 'bg-orange-500', validation: 'bg-blue-600', resolved: 'bg-emerald-600' };
const priorityColors = { low: 'bg-slate-100 text-slate-700', medium: 'bg-amber-100 text-amber-800', high: 'bg-red-100 text-red-800' };
/** Animate the measured content height, rather than a max-height ceiling. */
function ExpandingPin({ children, anchorX, anchorY, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { anchorX: number; anchorY: number }) {
  const button = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedReady, setExpandedReady] = useState(false);
  const [height, setHeight] = useState(44);
  useEffect(() => {
    if (!expanded) return;
    // Match the 300ms size transition before enabling vertical scrolling.
    const timer = setTimeout(() => setExpandedReady(true), 300);
    return () => clearTimeout(timer);
  }, [expanded]);
  useEffect(() => {
    const content = button.current?.querySelector<HTMLElement>('[data-pin-preview]');
    if (!content) return;
    const measure = () => setHeight(Math.max(44, content.getBoundingClientRect().height + 4));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  const viewport = window.visualViewport;
  const layout = pinPreviewLayout(anchorX, anchorY, height, expanded, {
    left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? document.documentElement.clientWidth,
    height: viewport?.height ?? document.documentElement.clientHeight,
  });
  return <button {...props} ref={button} style={{ width: layout.width, height: layout.height, translate: `${layout.shiftX}px ${layout.shiftY}px`, overflowX: 'hidden', overflowY: expanded && expandedReady ? 'auto' : 'hidden', '--reporty-pin-preview-width': `${layout.previewWidth}px` } as React.CSSProperties} onMouseEnter={() => { setExpandedReady(window.matchMedia('(prefers-reduced-motion: reduce)').matches); setExpanded(true); }} onMouseLeave={() => { setExpanded(false); setExpandedReady(false); }}>{children}</button>;
}

type DraftScreenshot = ScreenshotImage & { id: string };
type Draft = { id: string; context: ReportContext; screenshots: DraftScreenshot[]; files: DraftReportFile[]; body: string; priority: ReportPriority; saved?: boolean; uploaded?: string[] };

export function ReviewOverlay({ site, environment, host, transport, logoUrl, onPositionChange, onHiddenChange, captureScreenshot: captureOverride, requestedReport, onOpenReport, reportsRevision }: { site: Site; environment: Environment; host: HTMLElement; onPositionChange: (position: Site['position']) => Promise<void>; onHiddenChange: (hidden: boolean) => Promise<void>; transport?: (body: Record<string, unknown>) => Promise<unknown>; logoUrl?: string; captureScreenshot?: () => Promise<string>; requestedReport?: { id: string; requestId: string; focusOnly?: boolean }; onOpenReport?: (id: string) => boolean; reportsRevision?: number }) {
  useEffect(() => () => stopTabCapture(), [environment.id, captureOverride]);
  const rawMessage = async (body: Record<string, unknown>) => (transport ? await transport(body) : await extensionMessage(body)) as Awaited<ReturnType<typeof extensionMessage>>;
  const { ensureIdentity, nameDialog, nameDialogOpen } = useReviewerIdentity(rawMessage, environment.id);
  const message = async (body: Record<string, unknown>) => {
    if ((body.type === 'REPORTY_REPORT' && ['create', 'edit', 'delete', 'status', 'priority', 'reply', 'screenshot'].includes(String(body.operation)))
      || (body.type === 'REPORTY_ATTACHMENT' && (body.payload as AttachmentRequest)?.operation !== 'read')) await ensureIdentity();
    return rawMessage(body);
  };
  const deepLink = useRef(new URL(location.href).searchParams.get('__reporty_issue'));
  const [page, setPage] = useState(getPageContext(location.href));
  const [reports, setReports] = useState<ReportPin[]>([]);
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const [order, setOrder] = useState<ReportSort>({ field: 'status', direction: 'asc' });
  const [searchInput, setSearch] = useState('');
  const search = useDebouncedValue(searchInput);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [pinsVisible, setPinsVisible] = useState(true);
  const hideReporty = site.hidden === true;
  const pageActive = usePageActive();
  const [controlsRevealed, setControlsRevealed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationStatuses, setNotificationStatuses] = useState<string[]>([]);
  const [notificationReads, setNotificationReads] = useState<string[]>(['unread']);
  const [notificationReadingId, setNotificationReadingId] = useState<string | null>(null);
  const [notificationDetailLoading, setNotificationDetailLoading] = useState(false);
  const notificationLock = useRef(false);
  const notificationScope = useRef('');
  notificationScope.current = environment.id + ':' + page.pagePath;
  const notificationReadLabels: Record<string, string> = { unread: 'Non lette', read: 'Lette' };
  const notificationFeed = useNotificationFeed({ pagePath: page.pagePath, statuses: notificationStatuses as ReportNotification['status'][], reads: notificationReads as ('read' | 'unread')[] }, async query => {
    const result = await message({ type: 'REPORTY_REPORT', operation: 'notifications', payload: query });
    return result.data as NotificationPage;
  }, { scope: environment.id + ':' + page.pagePath, enabled: modalOpen && notificationsOpen, pollingEnabled: !hideReporty, onArrival: data => {
    const item = data.latest;
    if (item) setStatus(data.arrivalCount === 1 ? `${notificationSummary(item)} · ${(item.reply_body ?? item.body).slice(0,120)}` : `${data.arrivalCount} nuove notifiche per questa pagina.`, 'success');
  }, onError: text => setStatus(text) });
  const notificationsLoading = notificationFeed.loading || notificationFeed.summaryLoading;
  const unreadNotifications = notificationFeed.unread;
  const filteredNotifications = notificationFeed.items;
  const notificationFilters = [
    ...notificationStatuses.map(value => ({ key: 'status-'+value, label: 'Stato: '+statusLabels[value as keyof typeof statusLabels], remove: () => setNotificationStatuses(items => items.filter(item => item !== value)) })),
    ...notificationReads.map(value => ({ key: 'read-'+value, label: 'Lettura: '+notificationReadLabels[value], remove: () => setNotificationReads(items => items.filter(item => item !== value)) })),
  ];
  useEffect(() => {
    setNotificationReadingId(null); setNotificationsOpen(false); setNotificationDetailLoading(false);
  }, [environment.id, page.pagePath]);
  async function readNotifications(item?: ReportNotification, openReport = true) {
    if (notificationLock.current) return;
    notificationLock.current = true;
    const scope = notificationScope.current;
    const external = Boolean(item && openReport && onOpenReport?.(item.issue_id));
    setNotificationReadingId(item && !openReport ? item.id : null);
    if (item && openReport) {
      setNotificationDetailLoading(true); setNotificationsOpen(false); setSettingsOpen(false);
      setSelected(null); setComments([]); setReportFiles([]); setEdit(null); setImageUrls([]); setGalleryOpen(false);
      setModalOpen(!external);
    }
    await run(async () => {
      try {
        const result = await message({ type: 'REPORTY_REPORT', operation: item ? 'notification_read' : 'notifications_read', payload: { paginated: true, mode: 'summary', pagePath: page.pagePath, ...(item ? { id: item.id } : {}) } });
        if (scope !== notificationScope.current) return;
        notificationFeed.applyRead(result.data as NotificationPage, item?.id);
        if (item && openReport) {
          const [thread, listing] = await Promise.all([loadThread(item.issue_id), message({ type: 'REPORTY_REPORT', operation: 'page', payload: { pagePath: page.pagePath, id: item.issue_id, limit: 1 } })]);
          if (scope !== notificationScope.current) return;
          const report = (listing.data as ReportPage).reports.find(entry => entry.id === item.issue_id);
          if (!report) throw new Error('Segnalazione non disponibile.');
          if (report.environment_id !== environment.id || report.page_path !== page.pagePath) throw new Error('Segnalazione non disponibile in questa pagina.');
          setReports(items => items.some(entry => entry.id === report.id) ? items.map(entry => entry.id === report.id ? { ...entry, ...report } : entry) : [...items, report]);
          if (external) { setModalOpen(false); setSelected(null); focusReport(report); }
          else { setSelected(report); setComments(thread.data.comments); setReportFiles(thread.data.issue.attachments ?? []); }
          setNotificationsOpen(false); setSettingsOpen(false); setEdit(null); setImageUrls([]);
        } else setStatus(item ? 'Notifica segnata come letta.' : 'Notifiche della pagina segnate come lette.', 'success');
      } catch (error) {
        if (item && openReport && scope === notificationScope.current) setNotificationsOpen(true);
        throw error;
      } finally {
        notificationLock.current = false;
        if (scope === notificationScope.current) { setNotificationDetailLoading(false); setNotificationReadingId(null); }
      }
    });
  }
  const [mode, setMode] = useState<'element' | 'pin' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [screenshotCapture, setScreenshotCapture] = useState<ScreenshotImage | null>(null);
  const submitLock = useRef(false);
  const [fileProgress, setFileProgress] = useState<ReportFileProgress | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const pendingFiles = useRef(new Map<string, string>());
  const cleanupFile = useRef<(issueId: string, id: string) => void>(() => {});
  cleanupFile.current = (issueId, id) => { void rawMessage({ type: 'REPORTY_ATTACHMENT', payload: { scope: 'report', operation: 'remove', issueId, id } }).catch(() => setStatus('Pulizia dei file temporanei incompleta.', 'error')); };
  useEffect(() => {
    const issueId = draft?.id, pending = pendingFiles.current;
    return () => {
      if (!issueId) return;
      uploadAbort.current?.abort();
      for (const [id, owner] of pending) if (owner === issueId) { pending.delete(id); cleanupFile.current(issueId, id); }
    };
  }, [draft?.id]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), 2400);
    return () => clearTimeout(timer);
  }, [highlighted]);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [reportFiles, setReportFiles] = useState<ReplyAttachment[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const setStatus = useNotify();
  const [pinsLoading, setPinsLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const filterKey = JSON.stringify([environment.id, page.pagePath, search, statuses, priorities, order]);
  const [pageSelection, setPageSelection] = useState({ key: filterKey, page: 1 });
  const pageNumber = pageSelection.key === filterKey ? pageSelection.page : 1;
  async function fetchPage(query: ReportPageQuery): Promise<ReportPage> {
    const result = await message({ type: 'REPORTY_REPORT', operation: 'page', payload: query });
    return result.data;
  }
  const listFeed = useReportPage({ pagePath: page.pagePath, offset: (pageNumber - 1) * REPORT_PAGE_SIZE, limit: REPORT_PAGE_SIZE, search, statuses: statuses as Report['status'][], priorities: priorities as ReportPriority[], sort: order }, fetchPage, { scope: environment.id, enabled: !hideReporty, onError: message => setStatus(message) });
  const listLoading = listFeed.loading;
  const pagination = { page: pageNumber, pages: Math.max(1, Math.ceil(listFeed.total / REPORT_PAGE_SIZE)), setPage: (next: number) => setPageSelection({ key: filterKey, page: next }) };
  if (!listFeed.loading && !listFeed.failed && pageNumber > pagination.pages) setPageSelection({ key: filterKey, page: pagination.pages });
  const [, tick] = useState(0);
  const [hover, setHover] = useState<DOMRect | null>(null);
  async function loadThread(id: string) {
    setThreadLoading(true);
    try { return await message({ type: 'REPORTY_REPORT', operation: 'thread', payload: { id } }); } finally { setThreadLoading(false); }
  }
  async function loadScreenshot(id: string) {
    setImageLoading(true);
    try { return await message({ type: 'REPORTY_SCREENSHOT', id }); } finally { setImageLoading(false); }
  }
  async function captureScreenshot(context: ReportContext) {
    setCapturing(true);
    try { return await captureHighlightedScreenshot(host, context, captureOverride ?? captureTab); } finally { setCapturing(false); }
  }
  const pinsRevision = useRef(0);
  async function refresh() {
    if (hideReporty || !isPageActive()) return reports;
    const revision = ++pinsRevision.current;
    const scope = notificationScope.current;
    setPinsLoading(true);
    listFeed.refresh();
    try {
      const result = await message({ type: 'REPORTY_REPORT', operation: 'pins', payload: { pagePath: page.pagePath } });
      if (scope === notificationScope.current && revision === pinsRevision.current) setReports(result.data);
      return result.data as ReportPin[];
    } finally { if (scope === notificationScope.current && revision === pinsRevision.current) setPinsLoading(false); }
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setStatus('');
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  }
  const visibilityLock = useRef(false);
  const positionLock = useRef(false);
  function updatePosition(value: string) {
    if (!isOpenerPosition(value) || value === site.position || busy || positionLock.current) return;
    positionLock.current = true;
    void run(async () => {
      try {
        await onPositionChange(value);
        setStatus('Posizione dei pulsanti aggiornata.', 'success');
      } finally { positionLock.current = false; }
    });
  }
  const updateLock = useRef(false);
  function updateReportField(field: 'status' | 'priority', value: string) {
    if (!selected || busy || updateLock.current || !selected.canChangeStatus || selected[field] === value) return;
    const previous = selected;
    const patch = { [field]: value } as Partial<Report>;
    updateLock.current = true;
    setReports(items => items.map(item => item.id === previous.id ? { ...item, ...patch } : item));
    setSelected(item => item?.id === previous.id ? { ...item, ...patch } : item);
    void run(async () => {
      try {
        await message({ type: 'REPORTY_REPORT', operation: field, payload: { id: previous.id, [field]: value } });
        setStatus(field === 'status' ? 'Stato aggiornato.' : 'Priorità aggiornata.', 'success');
        try {
          await refresh();
          const result = await fetchPage({ id: previous.id, limit: 1, pagePath: page.pagePath });
          setSelected(item => item?.id === previous.id ? result.reports[0] ?? item : item);
        } catch { /* A confirmed mutation is not rolled back if reloading fails. */ }
      } catch (error) {
        setReports(items => items.map(item => item.id === previous.id ? { ...item, [field]: previous[field] } : item));
        setSelected(item => item?.id === previous.id ? { ...item, [field]: previous[field] } : item);
        throw error;
      } finally { updateLock.current = false; }
    });
  }
  function focusReport(report: Report | ReportPin) {
    setDraft(null); setMode(null); setHover(null); setEdit(null); setGalleryOpen(false); setSettingsOpen(false); setNotificationsOpen(false);
    if (report.status === 'resolved') setShowResolved(true);
    setReports(items => items.some(item => item.id === report.id) ? items.map(item => item.id === report.id ? { ...item, ...report } : item) : [...items, report]);
    const point = locate(report.context.anchor);
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    if (point) window.scrollBy({ top: point.y - innerHeight / 2, left: 0, behavior });
    else if (report.context.scroll) window.scrollTo({ top: report.context.scroll.y, left: report.context.scroll.x, behavior });
    setHighlighted(null);
    requestAnimationFrame(() => setHighlighted(report.id));
  }
  async function view(report: Report | ReportPin) {
    if (busy) return;
    if (onOpenReport?.(report.id)) {
      setModalOpen(false); setOpen(false); setSelected(null);
      focusReport(report);
      return;
    }
    const scope = notificationScope.current;
    setSettingsOpen(false); setNotificationsOpen(false); setDraft(null); setEdit(null); setComments([]); setReportFiles([]); setImageUrls([]); setOpen(false); setModalOpen(true);
    setSelected('project_id' in report ? report : null);
    setNotificationDetailLoading(true);
    await run(async () => {
      try {
        const [thread, listing] = await Promise.all([loadThread(report.id), fetchPage({ id: report.id, pagePath: page.pagePath, limit: 1 })]);
        if (scope !== notificationScope.current) return;
        if (!listing.reports[0]) throw new Error('Segnalazione non disponibile.');
        setSelected(listing.reports[0]); setComments(thread.data.comments); setReportFiles(thread.data.issue.attachments ?? []);
      } finally { setNotificationDetailLoading(false); }
    });
  }
  useEffect(() => {
    setSelected(null); setComments([]); setReportFiles([]); setImageUrls([]); setScreenshotCapture(null);
  }, [page.pagePath, environment.id]);
  useEffect(() => {
    if (hideReporty || !pageActive) return;
    let disposed = false;
    setPinsLoading(true);
    void refresh().catch(error => { if (!disposed) setStatus(error.message); }).finally(() => { if (!disposed) setPinsLoading(false); });
    return () => { disposed = true; };
  }, [page.pagePath, environment.id, pageActive, hideReporty, reportsRevision]);
  const handledRequest = useRef('');
  useEffect(() => {
    // A selection from the playground is an explicit user read, independent of pin polling.
    if (!requestedReport || busy || handledRequest.current === requestedReport.requestId) return;
    const scope = notificationScope.current;
    let disposed = false;
    void (async () => {
      try {
        const listing = await fetchPage({ id: requestedReport.id, pagePath: page.pagePath, limit: 1 });
        if (disposed || notificationScope.current !== scope) return;
        const report = listing.reports[0];
        if (!report || report.environment_id !== environment.id || report.page_path !== page.pagePath) throw new Error('Segnalazione non disponibile in questa pagina.');
        handledRequest.current = requestedReport.requestId;
        if (report.status === 'resolved') setShowResolved(true);
        if (requestedReport.focusOnly) { setModalOpen(false); setOpen(false); setSelected(null); focusReport(report); }
        else await view(report);
      } catch (error) { if (!disposed) { handledRequest.current = requestedReport.requestId; setStatus(error instanceof Error ? error.message : 'Segnalazione non disponibile.'); } }
    })();
    return () => { disposed = true; };
  }, [requestedReport?.requestId, page.pagePath, environment.id, busy]);
  useEffect(() => {
    const id = deepLink.current;
    if (!id || pinsLoading) return;
    const report = reports.find(item => item.id === id && item.page_path === page.pagePath);
    if (!report) return;
    if (report.context.anchor.kind === 'page') { deepLink.current = null; void view(report); return; }
    let attempts = 0;
    let stable = 0;
    let previous: { x: number; y: number } | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const finish = () => {
      if (disposed) return;
      deepLink.current = null;
      if (report.status === 'resolved') setShowResolved(true);
      setHighlighted(report.id);
    };
    const move = () => {
      if (disposed) return;
      const point = locate(report.context.anchor);
      if (point) {
        const absolute = { x: point.x + scrollX, y: point.y + scrollY };
        stable = previous && Math.abs(previous.x - absolute.x) < 2 && Math.abs(previous.y - absolute.y) < 2 ? stable + 1 : 0;
        previous = absolute;
        window.scrollBy({ top: point.y - innerHeight / 2, left: 0, behavior: 'instant' });
        if (stable >= 3) { finish(); return; }
      }
      if (++attempts >= 20) {
        if (!point && report.context.scroll) window.scrollTo({ top: report.context.scroll.y, left: report.context.scroll.x, behavior: 'instant' });
        finish(); return;
      }
      timer = setTimeout(move, 250);
    };
    timer = setTimeout(move, 250);
    return () => { disposed = true; clearTimeout(timer); };
  }, [reports, pinsLoading, page.pagePath]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = getPageContext(location.href);
      setPage(previous => previous.url !== current.url ? current : previous);
      tick(value => value + 1);
    }, 700);
    const onMove = () => tick(value => value + 1);
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    window.visualViewport?.addEventListener('resize', onMove);
    window.visualViewport?.addEventListener('scroll', onMove);
    return () => { clearInterval(timer); window.removeEventListener('scroll', onMove); window.removeEventListener('resize', onMove); window.visualViewport?.removeEventListener('resize', onMove); window.visualViewport?.removeEventListener('scroll', onMove); };
  }, []);
  useEffect(() => {
    if (!mode) return;
    const inside = (event: Event) => event.composedPath().includes(host);
    const move = (event: MouseEvent) => {
      if (inside(event) || mode !== 'element') { setHover(null); return; }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      setHover(target?.getBoundingClientRect() ?? null);
    };
    const click = (event: MouseEvent) => {
      if (inside(event) || event.button !== 0) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element) return;
      const anchor: Anchor = mode === 'pin' ? { kind: 'pin', documentX: event.clientX + scrollX, documentY: event.clientY + scrollY } : elementAnchor(element, event.clientX, event.clientY);
      const context: ReportContext = { ...getPageContext(location.href), anchor, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, scroll: { x: Math.max(0, scrollX), y: Math.max(0, scrollY) } };
      setMode(null); setHover(null); setSelected(null); setDraft({ id: crypto.randomUUID(), context, screenshots: [], files: [], body: '', priority: 'medium' }); setOpen(true);
      void run(async () => {
        const screenshot = await captureScreenshot(context);
        if ((screenshot.split(',')[1]?.length ?? 0) * 3 / 4 > 2500000) throw new Error('Screenshot troppo grande. Puoi inviare il commento senza immagine.');
        setDraft(previous => previous ? { ...previous, screenshots: [{ id: crypto.randomUUID(), src: screenshot, width: context.viewport.width, height: context.viewport.height }] } : previous);
      });
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMode(null); setHover(null); setOpen(true); } };
    const preventActivation = (event: Event) => { if (!inside(event)) { event.preventDefault(); event.stopImmediatePropagation(); } };
    document.addEventListener('pointerdown', preventActivation, true); document.addEventListener('mousedown', preventActivation, true);
    document.addEventListener('mousemove', move, true); document.addEventListener('click', click, true); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', preventActivation, true); document.removeEventListener('mousedown', preventActivation, true); document.removeEventListener('mousemove', move, true); document.removeEventListener('click', click, true); document.removeEventListener('keydown', escape, true); };
  }, [mode, host]);
  useEffect(() => {
    if (modalOpen && !modal.current?.open) modal.current?.showModal();
    if (!modalOpen && modal.current?.open) modal.current?.close();
  }, [modalOpen]);
  useEffect(() => () => { modal.current?.close(); }, []);
  const pageReports = reports.filter(report => report.page_path === page.pagePath);
  const filtered = listFeed.reports;
  const paginated = filtered;
  const listRef = useRef<HTMLElement | null>(null);
  const filters = [
    ...statuses.map(value => ({key: 'status-'+value, label: 'Stato: '+statusLabels[value as keyof typeof statusLabels], remove: () => setStatuses(items => items.filter(item => item !== value))})),
    ...priorities.map(value => ({key: 'priority-'+value, label: 'Priorità: '+priorityLabels[value as ReportPriority], remove: () => setPriorities(items => items.filter(item => item !== value))})),
  ];
  const popupOpen = modalOpen || open || mode !== null || galleryOpen || nameDialogOpen;
  // Opening any Reporty surface consumes the temporary reveal. Closing it docks
  // the controls again, including Escape and backdrop dismissal.
  useEffect(() => {
    if (popupOpen) setControlsRevealed(false);
  }, [popupOpen]);
  const controlsDocked = hideReporty && !popupOpen && !controlsRevealed;
  const top = site.position.startsWith('top'), left = site.position.endsWith('left');
  const panelPosition = { [top ? 'top' : 'bottom']: 88, [left ? 'left' : 'right']: 24 };
  const floatingControls = <div className="pointer-events-none fixed inset-x-0 h-[74px] overflow-clip" style={{ [top ? 'top' : 'bottom']: 14 }}>
    <div id="reporty-floating-controls" inert={controlsDocked} aria-hidden={controlsDocked} className={`pointer-events-auto absolute top-2.5 flex items-center gap-1 rounded-full border bg-background p-1.5 shadow-xl transition-[left,right,transform] duration-200 motion-reduce:transition-none ${left ? 'flex-row-reverse' : ''}`} style={{ [left ? 'left' : 'right']: controlsDocked ? 0 : hideReporty && !popupOpen ? 40 : 24, transform: controlsDocked ? (left ? 'translateX(-100%)' : 'translateX(100%)') : 'translateX(0)' }}><Button aria-label={modalOpen ? 'Chiudi segnalazioni' : `Apri lista segnalazioni${unreadNotifications ? `, ${unreadNotifications} notifiche non lette` : ''}`} aria-expanded={modalOpen} disabled={busy && !modalOpen} variant="ghost" size="icon" className="relative size-9 rounded-lg text-foreground" onClick={() => { if (modalOpen) { setModalOpen(false); } else { setOpen(false); setSettingsOpen(false); setNotificationsOpen(false); setSelected(null); setModalOpen(true); void run(async () => { await refresh(); }); } }}>{modalOpen ? <X className="size-5" /> : <Menu className="size-5" />}{unreadNotifications ? <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}</Button>    <Button aria-label={open ? 'Chiudi creazione segnalazione' : 'Crea segnalazione'} aria-expanded={open} disabled={busy} size="icon" className="size-10 rounded-full" onClick={() => { setOpen(!open); setModalOpen(false); }}><span className="flex transition-transform motion-reduce:transition-none" style={{transform:open?'rotate(45deg)':'rotate(0deg)'}}><Plus className="size-5" /></span></Button></div>
    {hideReporty && !popupOpen ? <Button variant="outline" aria-label={controlsDocked ? 'Mostra Reporty' : 'Nascondi Reporty'} title={controlsDocked ? 'Mostra Reporty' : 'Nascondi Reporty'} aria-controls="reporty-floating-controls" aria-expanded={!controlsDocked} className={`pointer-events-auto absolute top-[15px] h-11 w-6 px-0 shadow-md ${left ? 'left-0 rounded-l-none rounded-r-lg' : 'right-0 rounded-l-lg rounded-r-none'}`} onClick={() => setControlsRevealed(value => !value)}>{controlsDocked ? (left ? <ChevronRight className="size-4" aria-hidden="true" /> : <ChevronLeft className="size-4" aria-hidden="true" />) : <X className="size-4" aria-hidden="true" />}</Button> : null}
  </div>;
  return <>
    {nameDialog}
    {hover && mode ? <div className="pointer-events-none fixed border-2 border-indigo-500 bg-indigo-500/10" style={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height }} /> : null}
    {mode ? <div className="pointer-events-auto fixed left-1/2 top-4 -translate-x-1/2 rounded-lg border bg-card p-3 text-sm shadow-xl">{mode === 'element' ? 'Seleziona un elemento' : 'Posiziona un pin'} · Esc per annullare <Button size="sm" variant="outline" onClick={() => { setMode(null); setOpen(true); }}>Annulla</Button></div> : null}
    {!mode && !draft && pinsVisible && !hideReporty ? pageReports.filter(report => showResolved || report.status !== 'resolved').map(report => {
      const position = anchorPosition(report.context.anchor);
      if (!position) return null;
      return <div key={report.id} className={`group pointer-events-auto fixed -translate-y-full ${highlighted === report.id ? 'z-20' : ''}`} style={{left:position.x,top:position.y}}>
        <ExpandingPin anchorX={position.x} anchorY={position.y} aria-label={`${statusLabels[report.status]}, priorità ${priorityLabels[report.priority ?? 'medium']}: ${report.body.slice(0,60)}`} className={`relative block ${highlighted === report.id ? 'reporty-pin-highlight' : ''} overflow-hidden rounded-tl-[22px] rounded-tr-[22px] rounded-br-[22px] border-2 border-primary/70 bg-card text-card-foreground shadow-md transition-[width,height,translate] duration-300 ease-out focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none`} onClick={() => void view(report)}>
          <span className={`reporty-pin-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full ${pinColors[report.status]} text-xs font-semibold text-white transition-opacity duration-150 group-hover:opacity-0 motion-reduce:transition-none`}>{(report.authorName?.trim() || 'Utente').slice(0, 1).toLocaleUpperCase('it-IT')}</span>
          <span data-pin-preview className="invisible block opacity-0 transition-[opacity,visibility] duration-[150ms,0ms] delay-[0ms,150ms] ease-out group-hover:visible group-hover:opacity-100 group-hover:delay-[250ms,0ms] motion-reduce:transition-none">
            <span className="block w-[var(--reporty-pin-preview-width)] p-3 text-left">
              <span className="mb-3 flex flex-wrap gap-2 text-xs"><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${statusColors[report.status]}`}><ReportIcon value={report.status} />{statusLabels[report.status]}</span><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${priorityColors[report.priority ?? 'medium']}`}><ReportIcon value={report.priority ?? 'medium'} />Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</span></span>
              <span className="line-clamp-4 whitespace-pre-wrap break-words text-sm">{report.body}</span>
              <span className="mt-3 block truncate text-xs text-muted-foreground" title={report.authorName}>Segnalata da {report.authorName || 'Utente'}</span>
            </span>
          </span>
        </ExpandingPin>
      </div>;
    }) : null}

    {!modalOpen ? floatingControls : null}
    {!mode && !draft ? <div className="pointer-events-none fixed flex flex-col gap-3" style={{ [top ? 'top' : 'bottom']: 88, [left ? 'left' : 'right']: 28 }} aria-hidden={!open}>
      <Button variant="secondary" size="icon" aria-label="Seleziona elemento" title="Seleziona elemento" disabled={busy} tabIndex={open ? 0 : -1} className={`size-11 rounded-full border-border bg-card text-card-foreground shadow-lg hover:bg-accent transition-all duration-200 motion-reduce:transition-none ${open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'}`} style={{ transform: open ? 'translateY(0)' : `translateY(${top ? '-12px' : '12px'})` }} onClick={() => void run(async () => { await ensureIdentity(); setMode('element'); setOpen(false); })}><Crosshair className="size-5" aria-hidden="true" /></Button>
      <Button variant="secondary" size="icon" aria-label="Pin libero" title="Pin libero" disabled={busy} tabIndex={open ? 0 : -1} className={`size-11 rounded-full border-border bg-card text-card-foreground shadow-lg hover:bg-accent transition-all duration-200 motion-reduce:transition-none ${open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'}`} style={{ transitionDelay: open ? '50ms' : '0ms', transform: open ? 'translateY(0)' : `translateY(${top ? '-20px' : '20px'})` }} onClick={() => void run(async () => { await ensureIdentity(); setMode('pin'); setOpen(false); })}><MapPin className="size-5" aria-hidden="true" /></Button>
    </div> : null}
    {open && !mode && draft ? <section aria-label="Crea segnalazione" className="pointer-events-auto fixed max-h-[75vh] w-[min(380px,calc(100vw-48px))] space-y-4 overflow-y-auto rounded-xl border bg-background p-4 text-sm text-foreground shadow-xl" style={panelPosition}>
      {<form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (submitLock.current) return; void run(async () => {
        if (submitLock.current) return;
        submitLock.current = true;
        let saved = draft.saved === true;
        try {
          if (!saved) {
            await message({ type: 'REPORTY_REPORT', operation: 'create', payload: { id: draft.id, body: draft.body, priority: draft.priority, context: draft.context } });
            saved = true;
            setDraft(previous => previous ? { ...previous, saved: true } : previous);
          }
          for (const screenshot of draft.screenshots) {
            if (draft.uploaded?.includes(screenshot.id)) continue;
            await message({ type: 'REPORTY_REPORT', operation: 'screenshot', payload: { id: draft.id, screenshotId: screenshot.id }, screenshot: screenshot.src });
            setDraft(previous => previous ? { ...previous, uploaded: [...(previous.uploaded ?? []), screenshot.id] } : previous);
          }
          uploadAbort.current = new AbortController();
          for (let index = 0; index < draft.files.length; index++) {
            const item = draft.files[index]!;
            if (item.uploaded) continue;
            pendingFiles.current.set(item.id, draft.id);
            await uploadReportFile(item.file, item.id, input => message({ type: 'REPORTY_ATTACHMENT', payload: { ...input, issueId: draft.id } }) as Promise<AttachmentResponse>, percent => setFileProgress({ id: item.id, completed: index, total: draft.files.length, percent }), uploadAbort.current.signal);
            pendingFiles.current.delete(item.id);
            setDraft(previous => previous ? { ...previous, files: previous.files.map(file => file.id === item.id ? { ...file, uploaded: true } : file) } : previous);
          }
          setDraft(null); setStatus('Segnalazione inviata.', 'success');
          try { await refresh(); } catch { setStatus('Segnalazione inviata; aggiornamento della lista non riuscito.'); }
        } catch (error) {
          if (saved) throw new Error(`Segnalazione salvata, invio allegati interrotto. Premi Completa invio per riprovare. ${error instanceof Error ? error.message : ''}`);
          throw error;
        } finally { submitLock.current = false; uploadAbort.current = null; setFileProgress(null); }
      }); }}>
        <h3 className="font-medium">Nuova segnalazione</h3><Label htmlFor="report-body">Fix da effettuare</Label><Textarea id="report-body" className="min-h-28 rounded-lg border bg-background p-3" value={draft.body} disabled={busy || draft.saved} maxLength={10000} required onChange={event => setDraft({ ...draft, body: event.target.value })} />
        <Label htmlFor="report-priority">Priorità</Label><RadioButtons variant="standard" label="Priorità" id="report-priority" disabled={busy || draft.saved} value={draft.priority} onValueChange={value => setDraft({ ...draft, priority: value as ReportPriority })} options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} />
        {capturing && !draft.screenshots.length ? <ScreenshotSkeleton aspectRatio={`${draft.context.viewport.width} / ${draft.context.viewport.height}`} /> : null}
        {draft.screenshots.map((screenshot, index) => <div key={screenshot.id} className="relative">
          <ScreenshotGallery src={screenshot.src} sources={draft.screenshots.map(item => item.src)} aspectRatio={`${screenshot.width} / ${screenshot.height}`} />
          <TooltipButton type="button" label={`Rimuovi screenshot ${index + 1}`} disabled={busy || draft.saved} className="absolute right-2 top-2 z-10 bg-background text-destructive shadow-md hover:text-destructive" onClick={() => setDraft(previous => previous ? { ...previous, screenshots: previous.screenshots.filter(item => item.id !== screenshot.id) } : previous)}><Trash2 className="size-4" aria-hidden="true" /></TooltipButton>
        </div>)}
        {!capturing && !draft.screenshots.length ? <p className="text-xs text-muted-foreground">Nessuno screenshot allegato.</p> : null}
        <Button type="button" variant="outline" disabled={busy || draft.saved || draft.screenshots.length >= MAX_REPORT_SCREENSHOTS} onClick={() => void run(async () => {
          if (location.href !== draft.context.url) throw new Error('Torna alla pagina originale prima di aggiungere uno screenshot.');
          const width = innerWidth, height = innerHeight;
          const src = await capturePageScreenshot(host, captureOverride ?? captureTab);
          if (location.href !== draft.context.url || width !== innerWidth || height !== innerHeight) throw new Error('La pagina o la viewport è cambiata. Riprova.');
          setScreenshotCapture({ src, width, height });
        })}><Plus className="size-4" aria-hidden="true" />Aggiungi screenshot ({draft.screenshots.length}/{MAX_REPORT_SCREENSHOTS})</Button>
        <ReportAttachmentPicker files={draft.files} disabled={busy} saved={draft.saved} progress={fileProgress} onError={text => setStatus(text, 'error')} onChange={files => setDraft(previous => previous ? { ...previous, files } : previous)} onRemove={id => {
          void run(async () => {
            if (draft.saved || pendingFiles.current.has(id)) await message({ type: 'REPORTY_ATTACHMENT', payload: { scope: 'report', operation: 'remove', id, issueId: draft.id } });
            pendingFiles.current.delete(id);
            setDraft(previous => previous ? { ...previous, files: previous.files.filter(item => item.id !== id) } : previous);
          });
        }} />
        <Button type="submit" disabled={busy || !draft.body.trim()}>{draft.saved ? 'Completa invio' : 'Invia segnalazione'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(null); if (draft.saved) void run(async () => { await refresh(); }); }}>{draft.saved ? 'Chiudi' : 'Annulla'}</Button>
      </form>}
    </section> : null}
    {screenshotCapture && draft ? <ScreenshotSelector snapshot={screenshotCapture} onCancel={() => setScreenshotCapture(null)} onConfirm={image => {
      if (location.href !== draft.context.url) { setScreenshotCapture(null); setStatus('La pagina è cambiata. Torna alla pagina originale e riprova.'); return; }
      setDraft(previous => previous && !previous.saved && previous.screenshots.length < MAX_REPORT_SCREENSHOTS ? { ...previous, screenshots: [...previous.screenshots, { ...image, id: crypto.randomUUID() }] } : previous);
      setScreenshotCapture(null); setStatus('Screenshot aggiunto alla bozza.', 'success');
    }} /> : null}
    <dialog ref={modal} aria-labelledby="reporty-modal-title" className="pointer-events-auto fixed inset-0 m-auto max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-visible rounded-xl border bg-background p-0 text-sm text-foreground shadow-2xl backdrop:bg-black/50" onClick={event => {
        if (event.target !== modal.current) return;
        const rect = modal.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setModalOpen(false);
      }} onCancel={event => { if (event.target === modal.current) setModalOpen(false); }} onClose={event => { if (event.target === modal.current) setModalOpen(false); }}>
      <div className={selected || settingsOpen || notificationDetailLoading ? "max-h-[85dvh] space-y-5 overflow-y-auto p-6" : "flex h-[80dvh] max-h-[85dvh] flex-col gap-5 overflow-hidden p-6"}>
        <header className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"><h2 id="reporty-modal-title" className="min-w-0 break-words text-xl font-semibold">{notificationDetailLoading ? 'Dettaglio segnalazione' : notificationsOpen ? 'Notifiche della pagina' : settingsOpen ? 'Impostazioni' : selected ? 'Dettaglio segnalazione' : `${environment.projectName} · ${environment.name}`}</h2><div className="order-first flex items-center justify-end gap-2 sm:order-none">{notificationDetailLoading ? <TooltipButton label="Torna alle segnalazioni" disabled><ArrowLeft className="size-4" aria-hidden="true" /></TooltipButton> : settingsOpen || notificationsOpen ? <TooltipButton label="Torna alle segnalazioni" onClick={() => { setSettingsOpen(false); setNotificationsOpen(false); }}><ArrowLeft className="size-4" aria-hidden="true" /></TooltipButton> : !selected ? <><Button variant="outline" size="icon" className="relative" aria-label={`Apri notifiche, ${unreadNotifications} non lette`} title="Notifiche" onClick={() => setNotificationsOpen(true)}><Bell className="size-4" aria-hidden="true" />{unreadNotifications ? <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}</Button><Button variant="outline" size="icon" aria-label="Apri impostazioni" title="Impostazioni" onClick={() => setSettingsOpen(true)}><Settings className="size-4" aria-hidden="true" /></Button></> : null}{selected ? <TooltipButton label="Torna alle segnalazioni" disabled={busy} onClick={() => { setSelected(null); setImageUrls([]); }}><ArrowLeft className="size-4" aria-hidden="true" /></TooltipButton> : null}<Button variant="outline" size="icon" aria-label="Chiudi modale" onClick={() => setModalOpen(false)}><X /></Button></div></header>
        {notificationDetailLoading ? <ReportDetailSkeleton /> : notificationsOpen ? <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" aria-label="Notifiche della pagina">
          <div className="flex shrink-0 items-center justify-between gap-2"><div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-1"><ReportFilter label="Stato" options={Object.entries(statusLabels).map(([value,label]) => ({value,label}))} selected={notificationStatuses} onChange={setNotificationStatuses} /><ReportFilter label="Lettura" options={Object.entries(notificationReadLabels).map(([value,label]) => ({value,label}))} selected={notificationReads} onChange={setNotificationReads} /></div><Button variant="outline" size="sm" disabled={busy || notificationsLoading || !unreadNotifications} onClick={() => void readNotifications()}>Segna tutte come lette</Button></div>
          {notificationFilters.length ? <div className="flex shrink-0 flex-wrap gap-2" aria-label="Filtri notifiche attivi">{notificationFilters.map(filter => <FilterPill key={filter.key} label={filter.label} onRemove={filter.remove} />)}</div> : null}
          <InfiniteList key={JSON.stringify([environment.id, page.pagePath, notificationStatuses, notificationReads])} label="Lista notifiche della pagina" items={filteredNotifications} total={notificationFeed.total} onLoadMore={() => void notificationFeed.loadMore()} failed={notificationFeed.failed} onRetry={notificationFeed.refresh} loading={notificationsLoading} disabled={busy} loadingContent={<NotificationRowsSkeleton />} emptyContent={<p className="text-sm text-muted-foreground">{notificationFeed.totalInScope ? 'Nessuna notifica corrisponde ai filtri selezionati.' : 'Nessuna notifica per questa pagina.'}</p>} renderItem={item => <NotificationCard key={item.id} item={item} disabled={busy} reading={notificationReadingId === item.id} onOpen={() => readNotifications(item)} onMarkRead={() => readNotifications(item, false)} />} />
        </section> : settingsOpen ? <section className="space-y-4" aria-label="Impostazioni Reporty">
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><Label htmlFor="reporty-hidden">Nascondi Reporty</Label><p id="reporty-hidden-help" className="text-xs text-muted-foreground">Nasconde i pin e ritrae i pulsanti quando i pannelli sono chiusi. Usa la chevron sul bordo per riaprirli.</p></div><Button id="reporty-hidden" variant="outline" size="icon" disabled={busy} aria-label="Nascondi Reporty" title={hideReporty ? 'Mostra Reporty' : 'Nascondi Reporty'} aria-pressed={hideReporty} aria-describedby="reporty-hidden-help" onClick={() => { if (busy || visibilityLock.current) return; visibilityLock.current = true; void run(async () => { try { await onHiddenChange(!hideReporty); setControlsRevealed(false); setStatus(hideReporty ? 'Reporty visibile.' : 'Reporty nascosto.', 'success'); } finally { visibilityLock.current = false; } }); }}>{hideReporty ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</Button></div>
          <div className="space-y-3 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><Label htmlFor="reporty-opener-position">Posizione dei pulsanti</Label><p className="text-xs text-muted-foreground">Scegli dove mostrare il menu e il pulsante + su questo sito.</p></div><SelectField id="reporty-opener-position" value={site.position} options={openerPositionOptions} disabled={busy} onValueChange={updatePosition} /></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><Label htmlFor="reporty-pins-visible">Mostra segnalazioni sulla pagina</Label><p id="reporty-pins-help" className="text-xs text-muted-foreground">Mostra o nasconde tutti i pin. Le segnalazioni restano disponibili nella lista.</p></div><Switch id="reporty-pins-visible" checked={pinsVisible && !hideReporty} disabled={hideReporty} onCheckedChange={setPinsVisible} aria-describedby="reporty-pins-help" /></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><Label htmlFor="reporty-resolved">Mostra risolte</Label><p id="reporty-resolved-help" className="text-xs text-muted-foreground">Include i pin delle segnalazioni chiuse sulla pagina. Non modifica i filtri della lista.</p></div><Switch id="reporty-resolved" checked={showResolved && !hideReporty} onCheckedChange={setShowResolved} disabled={hideReporty || !pinsVisible} aria-describedby="reporty-resolved-help" /></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><h3 className="text-sm font-medium">Tema</h3><p className="text-xs text-muted-foreground">Scegli la modalità chiara o scura per Reporty.</p></div><ThemeSwitch host={host} /></div>
        </section> : selected ? <div className="space-y-4">
        <section className="space-y-4" aria-label="Segnalazione"><div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 text-xs sm:flex-wrap"><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${statusColors[selected.status]}`}><ReportIcon value={selected.status} />{statusLabels[selected.status]}</span><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${priorityColors[selected.priority ?? 'medium']}`}><ReportIcon value={selected.priority ?? 'medium'} />Priorità {priorityLabels[selected.priority ?? 'medium'].toLowerCase()}</span></div><div className="flex items-center gap-2">{selected.screenshot_path ? <TooltipButton label="Mostra screenshot" disabled={busy || imageLoading} onClick={() => { setImageUrls([]); setGalleryOpen(true); void run(async () => { try { const result = await loadScreenshot(selected.id); setImageUrls(result.urls ?? [result.url]); } catch (error) { setGalleryOpen(false); throw error; } }); }}><Eye className="size-4" aria-hidden="true" /></TooltipButton> : null}<TooltipButton label="Vai alla segnalazione" disabled={busy} onClick={() => {
          if (selected.page_path !== page.pagePath) { const url = new URL(selected.context.url); url.searchParams.set('__reporty_issue', selected.id); location.assign(url.href); return; }
          setModalOpen(false);
          setHighlighted(null);
          requestAnimationFrame(() => setHighlighted(selected.id));
          if (selected.status === 'resolved') setShowResolved(true);
          const point = locate(selected.context.anchor);
          if (point) window.scrollBy({ top: point.y - innerHeight / 2, left: 0, behavior: 'smooth' });
          else if (selected.context.scroll) window.scrollTo({ top: selected.context.scroll.y, left: selected.context.scroll.x, behavior: 'smooth' });
        }}><Target className="size-4" aria-hidden="true" /></TooltipButton></div></div>
        <section className="space-y-3 rounded-xl border bg-muted/50 dark:bg-card p-4"><h4 className="text-sm font-semibold">Descrizione</h4>{edit === null ? <p className="whitespace-pre-wrap break-words leading-relaxed">{selected.body}</p> : null}
        {selected.canEdit ? <div className="flex flex-col items-end gap-2">{edit === null ? <TooltipButton label="Modifica descrizione" disabled={busy} onClick={() => setEdit(selected.body)}><Pencil className="size-4" aria-hidden="true" /></TooltipButton> : <form className="grid w-full gap-2" onSubmit={event => { event.preventDefault(); if (busy || !edit?.trim() || edit.trim() === selected.body.trim()) return; void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'edit', payload: { id: selected.id, body: edit } }); setStatus('Testo aggiornato.', 'success'); await refresh(); const listing = await fetchPage({ id: selected.id, pagePath: page.pagePath, limit: 1 }); setSelected(listing.reports[0] ?? null); setEdit(null); }); }}><Textarea aria-label="Modifica descrizione" className="min-h-28 rounded-lg border bg-background p-3" required value={edit} maxLength={10000} onChange={event => setEdit(event.target.value)} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(null)}>Annulla</Button><Button type="submit" disabled={busy || !edit.trim() || edit.trim() === selected.body.trim()}>Salva testo</Button></div></form>}</div> : null}</section>
        {reportFiles.length ? <section className="space-y-3 rounded-xl border bg-muted/50 p-4" aria-label="File allegati alla segnalazione"><h3 className="font-medium">File allegati</h3><ReplyAttachmentList attachments={reportFiles} label="File della segnalazione" requestFile={input => message({ type: 'REPORTY_ATTACHMENT', payload: { ...input, scope: 'report', issueId: selected.id } })} onError={text => setStatus(text, 'error')} /></section> : null}
        {galleryOpen ? <ScreenshotGallery autoOpen loading={imageLoading || !imageUrls.length} onClose={() => { setGalleryOpen(false); setImageUrls([]); }} src={imageUrls[0] ?? ''} sources={imageUrls} aspectRatio={selected.context.viewport ? `${selected.context.viewport.width} / ${selected.context.viewport.height}` : '16 / 9'} /> : null}
        {selected.context.anchor.kind !== 'page' && selected.page_path === page.pagePath && !locate(selected.context.anchor) ? <p className="rounded-lg bg-muted p-3">Elemento non trovato o modificato. Consulta lo screenshot originale.</p> : null}
        <section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4" aria-label="Gestione segnalazione">
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="report-status">Stato</Label><RadioButtons label="Stato" id="report-status" disabled={busy} value={selected.status} onValueChange={value => updateReportField('status', value)} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></div> : null}
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="selected-priority">Priorità</Label><RadioButtons variant="standard" label="Priorità" id="selected-priority" disabled={busy} value={selected.priority ?? 'medium'} onValueChange={value => updateReportField('priority', value)} options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} /></div> : null}

        </section></section><section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4" aria-label="Risposte"><h3 className="font-medium">Risposte</h3>{threadLoading ? <RepliesSkeleton /> : null}{!threadLoading && comments.map(comment => <div key={comment.id} className="rounded-lg border bg-background p-3 dark:bg-muted"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">{comment.authorName}</p><time dateTime={comment.created_at} className="text-xs text-muted-foreground">{formatReportDateTime(comment.created_at)}</time></div><p className="whitespace-pre-wrap break-words">{comment.body}</p><ReplyAttachmentList attachments={comment.attachments} requestFile={input => message({ type:"REPORTY_ATTACHMENT",payload:{ ...input,issueId:selected.id } })} onError={text => setStatus(text,"error")} /></div>)}
        <ReplyComposer key={selected.id} disabled={busy} onBusyChange={setBusy} requestFile={(input: AttachmentRequest) => message({ type:'REPORTY_ATTACHMENT',payload:{ ...input,issueId:selected.id } })} onError={text => setStatus(text,'error')} submit={async (body,attachments,replyId) => {
          await message({ type:'REPORTY_REPORT',operation:'reply',payload:{ id:selected.id,body,attachments,replyId } });
          setStatus('Risposta inviata.','success');
          try {
            const result = await loadThread(selected.id); setComments(result.data.comments); setReportFiles(result.data.issue.attachments ?? []);
            setReports(items => items.map(item => item.id === selected.id ? { ...item,commentCount:result.data.comments.length } : item));
          } catch (error) { setStatus(error instanceof Error ? error.message : 'Impossibile aggiornare le risposte.','error'); }
        }} />
        </section><footer className="rounded-xl border bg-muted/50 dark:bg-card p-4 text-xs text-muted-foreground"><p>Segnalata da {selected.authorName}</p><p>{selected.updated_at ? <>Ultima modifica: {selected.updatedByName ?? 'Utente'} · {formatReportDateTime(selected.updated_at)}</> : 'Nessuna modifica registrata'}</p><ReportContextDetails context={selected.context} /></footer>{selected.canEdit ? <section aria-label="Zona pericolosa" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="text-sm font-semibold text-destructive">Zona pericolosa</h3><div className="flex justify-end"><DeleteConfirm fullWidth disabled={busy} description="Eliminare questa segnalazione e tutte le sue risposte? Questa operazione è definitiva." onConfirm={() => run(async () => { const result = await message({ type: 'REPORTY_REPORT', operation: 'delete', payload: { id: selected.id } }); setStatus('Segnalazione eliminata.', 'success'); if (result.warning) setStatus(result.warning,'error'); setSelected(null); await refresh(); })}><Trash2 className="size-4" aria-hidden="true" />Elimina</DeleteConfirm></div></section> : null}
      </div> : <div className="flex min-h-0 flex-1 flex-col gap-5">
  <Input aria-label="Cerca segnalazioni" placeholder="Cerca commento o pagina…" className="h-10 w-full rounded-lg border bg-background px-3" value={searchInput} onChange={event => setSearch(event.target.value)} />
  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2">
    <ReportFilter label="Stato" options={Object.entries(statusLabels).map(([value,label]) => ({value,label}))} selected={statuses} onChange={setStatuses} />
    <ReportFilter label="Priorità" options={Object.entries(priorityLabels).map(([value,label]) => ({value,label}))} selected={priorities} onChange={setPriorities} />
    </div><ReportOrder value={order} onChange={setOrder} />
  </div>
  {filters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri attivi">{filters.map(filter => <FilterPill key={filter.key} label={filter.label} onRemove={filter.remove}><ReportIcon value={filter.key.replace(/^(status|priority)-/, "")} /></FilterPill>)}</div> : null}

  <section ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1" aria-label="Lista segnalazioni">
    {listLoading ? <ReportRowsSkeleton /> : null}
    {listFeed.failed ? <Button variant="outline" onClick={listFeed.refresh}>Riprova il caricamento</Button> : null}
    {!listLoading && !listFeed.failed && !filtered.length ? <p className="p-6 text-muted-foreground">Nessuna segnalazione trovata.</p> : null}
    {!listLoading && paginated.map(report => <button key={report.id} className="block w-full space-y-3 rounded-xl border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none" onClick={() => void view(report)}>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row"><p className="min-w-0 flex-1 line-clamp-3 break-words font-medium">{report.body}</p><div className="flex shrink-0 flex-col items-start gap-2 text-xs sm:flex-row"><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${statusColors[report.status]}`}><ReportIcon value={report.status} />{statusLabels[report.status]}</span><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${priorityColors[report.priority ?? 'medium']}`}><ReportIcon value={report.priority ?? 'medium'} />Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</span></div></div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"><div className="flex min-w-0 flex-wrap gap-2"><span>{report.authorName}</span><span className="break-all">· {report.page_path}</span></div><time dateTime={report.created_at} className="ml-auto shrink-0 text-right">{formatReportDateTime(report.created_at)}</time></div>
    </button>)}
  </section>
  {!listLoading ? <ReportPagination total={listFeed.total} page={pagination.page} pages={pagination.pages} onChange={next => { pagination.setPage(next); listRef.current?.scrollTo({ top: 0 }); }} /> : null}
</div>}
      </div>
      {modalOpen ? floatingControls : null}
    </dialog>
  </>;
}
