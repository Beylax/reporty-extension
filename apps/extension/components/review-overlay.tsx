import { ReplyComposer, ReplyAttachmentList } from '@reporty/shared/ui/reply-attachments';
import type { AttachmentRequest } from '@reporty/shared';
import { ReportPagination, useReportPagination, REPORT_PAGE_SIZE } from '@/components/report-pagination';
import { FilterPill } from '@/components/filter-pill';
import { ReportIcon } from '@/components/report-icon';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioButtons } from '@/components/ui/radio-buttons';
import { DeleteConfirm } from '@/components/delete-confirm';
import { ReportOrder } from '@/components/report-order';
import { ReportFilter } from '@/components/report-filter';
import { SelectField } from '@/components/ui/select';
import { openerPositionOptions, isOpenerPosition } from '@/lib/opener-position';
import { ThemeSwitch } from '@/components/theme-switch';

import { NotificationCard, NotificationRowsSkeleton } from '@/components/notification-content';
import { InfiniteList } from '@reporty/shared/ui/infinite-list';
import { BrandLogo } from '@/components/brand-logo';
import { useNotify } from '@/components/ui/toast';
import { RepliesSkeleton, ReportDetailSkeleton, ReportRowsSkeleton, ScreenshotSkeleton } from '@/components/loading-skeletons';
import { LoadingImage } from '@/components/loading-image';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import type { ReportSort, ReportNotification } from '@reporty/shared';
import { compareReportsBy } from '@reporty/shared';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Settings, Menu, X, Crosshair, Eye, MapPin, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { notificationSummary, createNotificationArrivalTracker, compareReports, formatReportDateTime, getPageContext, priorityLabels, type ReportPriority, type Anchor, type Report, type ReportComment, type ReportContext } from '@reporty/shared';
import type { Environment, Site } from '@/lib/session';
import { captureHighlightedScreenshot } from '@/lib/screenshot';
import { captureTab } from '@/lib/capture-tab';
import { elementAnchor, anchorPosition } from '@/lib/anchor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { anchorPosition as locate } from '@/lib/anchor';

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
  const [height, setHeight] = useState(44);
  useEffect(() => {
    const content = button.current?.querySelector<HTMLElement>('[data-pin-preview]');
    if (!content) return;
    const measure = () => setHeight(Math.max(44, content.getBoundingClientRect().height + 4));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  const visibleHeight = expanded ? Math.min(height, Math.max(44, innerHeight - 16)) : 44;
  const visibleWidth = expanded ? Math.min(320, innerWidth - 16) : 44;
  // Keep visible anchors reachable at the top, without bringing offscreen pins into view.
  const shiftY = anchorY >= 0 && anchorY <= innerHeight
    ? Math.max(8, Math.min(anchorY - visibleHeight, innerHeight - visibleHeight - 8)) - (anchorY - visibleHeight)
    : 0;
  const shiftX = anchorX >= 0 && anchorX <= innerWidth
    ? Math.max(8, Math.min(anchorX, innerWidth - visibleWidth - 8)) - anchorX
    : 0;
  return <button {...props} ref={button} style={{ height: visibleHeight, translate: `${shiftX}px ${shiftY}px`, overflowY: expanded ? 'auto' : 'hidden' }} onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}>{children}</button>;
}

type Draft = { id: string; context: ReportContext; screenshot?: string; body: string; priority: ReportPriority };

export function ReviewOverlay({ site, environment, host, transport, logoUrl, onPositionChange }: { site: Site; environment: Environment; host: HTMLElement; onPositionChange: (position: Site['position']) => Promise<void>; transport?: (body: Record<string, unknown>) => Promise<unknown>; logoUrl?: string }) {
  const message = async (body: Record<string, unknown>) => (transport ? await transport(body) : await extensionMessage(body)) as Awaited<ReturnType<typeof extensionMessage>>;
  const deepLink = useRef(new URL(location.href).searchParams.get('__reporty_issue'));
  const [page, setPage] = useState(getPageContext(location.href));
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const [order, setOrder] = useState<ReportSort>({ field: 'status', direction: 'asc' });
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [pinsVisible, setPinsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ReportNotification[]>([]);
  const [notificationStatuses, setNotificationStatuses] = useState<string[]>([]);
  const [notificationReads, setNotificationReads] = useState<string[]>(['unread']);
  const [notificationReadingId, setNotificationReadingId] = useState<string | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationDetailLoading, setNotificationDetailLoading] = useState(false);
  const notificationLock = useRef(false);
  const notificationRevision = useRef(0);
  const collectNotificationArrivals = useRef(createNotificationArrivalTracker());
  const notificationScope = useRef('');
  notificationScope.current = environment.id + ':' + page.pagePath;
  const pageNotifications = notifications.filter(item => item.environment_id === environment.id && item.page_path === page.pagePath);
  const unreadNotifications = pageNotifications.filter(item => !item.read_at).length;
  const notificationReadLabels: Record<string, string> = { unread: 'Non lette', read: 'Lette' };
  const filteredNotifications = pageNotifications.filter(item => (!notificationStatuses.length || notificationStatuses.includes(item.status)) && (!notificationReads.length || notificationReads.includes(item.read_at ? 'read' : 'unread')));
  const notificationFilters = [
    ...notificationStatuses.map(value => ({ key: 'status-'+value, label: 'Stato: '+statusLabels[value as keyof typeof statusLabels], remove: () => setNotificationStatuses(items => items.filter(item => item !== value)) })),
    ...notificationReads.map(value => ({ key: 'read-'+value, label: 'Lettura: '+notificationReadLabels[value], remove: () => setNotificationReads(items => items.filter(item => item !== value)) })),
  ];
  function acceptNotifications(next: ReportNotification[]) {
    const arrivals = collectNotificationArrivals.current(next);
    setNotifications(next);
    const item = arrivals[0];
    if (!item) return;
    setStatus(arrivals.length === 1 ? `${notificationSummary(item)} · ${(item.reply_body ?? item.body).slice(0,120)}` : `${arrivals.length} nuove notifiche per questa pagina.`, 'success');
  }
  useEffect(() => {
    collectNotificationArrivals.current = createNotificationArrivalTracker();
    let disposed = false, pending = false, failed = false;
    setNotifications([]); setNotificationReadingId(null); setNotificationsLoading(true); setNotificationsOpen(false); setNotificationDetailLoading(false);
    async function refreshNotifications() {
      if (pending || notificationLock.current) return;
      pending = true;
      const version = notificationRevision.current;
      try {
        const result = await message({ type: 'REPORTY_REPORT', operation: 'notifications', payload: { pagePath: page.pagePath } });
        if (!disposed && version === notificationRevision.current) { acceptNotifications(result.data); failed = false; }
      } catch (error) {
        if (!disposed && !failed) setStatus(error instanceof Error ? error.message : 'Notifiche non disponibili.');
        failed = true;
      } finally { pending = false; if (!disposed) setNotificationsLoading(false); }
    }
    void refreshNotifications();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshNotifications(); }, 10000);
    return () => { disposed = true; clearInterval(timer); };
  }, [environment.id, page.pagePath]);
  async function readNotifications(item?: ReportNotification, openReport = true) {
    if (notificationLock.current) return;
    notificationLock.current = true; notificationRevision.current++;
    const scope = notificationScope.current;
    setNotificationReadingId(item && !openReport ? item.id : null);
    if (item && openReport) {
      setNotificationDetailLoading(true); setNotificationsOpen(false); setSettingsOpen(false);
      setSelected(null); setComments([]); setEdit(null); setImageUrl(''); setGalleryOpen(false);
      setModalOpen(true);
    }
    await run(async () => {
      try {
        const result = await message({ type: 'REPORTY_REPORT', operation: item ? 'notification_read' : 'notifications_read', payload: { pagePath: page.pagePath, ...(item ? { id: item.id } : {}) } });
        if (scope !== notificationScope.current) return;
        acceptNotifications(result.data);
        if (item && openReport) {
          const [thread, listing] = await Promise.all([loadThread(item.issue_id), message({ type: 'REPORTY_REPORT', operation: 'list', payload: { pagePath: page.pagePath } })]);
          if (scope !== notificationScope.current) return;
          const report = (listing.data as Report[]).find(entry => entry.id === item.issue_id);
          if (!report) throw new Error('Segnalazione non disponibile.');
          if (report.environment_id !== environment.id || report.page_path !== page.pagePath) throw new Error('Segnalazione non disponibile in questa pagina.');
          setReports(items => items.some(entry => entry.id === report.id) ? items.map(entry => entry.id === report.id ? { ...entry, ...report } : entry) : [...items, report]);
          setSelected(report); setComments(thread.data.comments); setNotificationsOpen(false); setSettingsOpen(false); setEdit(null); setImageUrl('');
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
  const [selected, setSelected] = useState<Report | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(null), 5000);
    return () => clearTimeout(timer);
  }, [highlighted]);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const setStatus = useNotify();
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
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
    try { return await captureHighlightedScreenshot(host, context, captureTab); } finally { setCapturing(false); }
  }
  async function refresh() {
    setListLoading(true);
    try {
      const result = await message({ type: 'REPORTY_REPORT', operation: 'list', payload: {} });
      const ordered = [...(result.data as Report[])].sort(compareReports);
      setReports(ordered);
      return ordered;
    } finally { setListLoading(false); }
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setStatus('');
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  }
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
          const result = await message({ type: 'REPORTY_REPORT', operation: 'list', payload: {} });
          setReports(result.data);
          setSelected(item => item?.id === previous.id ? result.data.find((report: Report) => report.id === previous.id) ?? item : item);
        } catch { /* A confirmed mutation is not rolled back if reloading fails. */ }
      } catch (error) {
        setReports(items => items.map(item => item.id === previous.id ? { ...item, [field]: previous[field] } : item));
        setSelected(item => item?.id === previous.id ? { ...item, [field]: previous[field] } : item);
        throw error;
      } finally { updateLock.current = false; }
    });
  }
  async function view(report: Report) {
    setSettingsOpen(false); setNotificationsOpen(false); setSelected(report); setDraft(null); setEdit(null); setComments([]); setImageUrl(''); setOpen(false); setModalOpen(true);
    await run(async () => {
      const result = await loadThread(report.id);
      setComments(result.data.comments);
    });
  }
  useEffect(() => {
    let disposed = false;
    setListLoading(true);
    void refresh().catch(error => { if (!disposed) setStatus(error.message); }).finally(() => { if (!disposed) setListLoading(false); });
    setSelected(null); setComments([]); setImageUrl('');
    return () => { disposed = true; };
  }, [page.pagePath, environment.id]);
  useEffect(() => {
    const id = deepLink.current;
    if (!id || listLoading) return;
    const report = reports.find(item => item.id === id && item.page_path === page.pagePath);
    if (!report) return;
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
      // Preserve the URL: changing history here can reset the host application's route.
      void view(report);
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
        if (!point) window.scrollTo({ top: report.context.scroll.y, left: report.context.scroll.x, behavior: 'instant' });
        finish(); return;
      }
      timer = setTimeout(move, 250);
    };
    timer = setTimeout(move, 250);
    return () => { disposed = true; clearTimeout(timer); };
  }, [reports, listLoading, page.pagePath]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = getPageContext(location.href);
      setPage(previous => previous.url !== current.url ? current : previous);
      tick(value => value + 1);
    }, 700);
    const onMove = () => tick(value => value + 1);
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', onMove);
    return () => { clearInterval(timer); window.removeEventListener('scroll', onMove); window.removeEventListener('resize', onMove); };
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
      setMode(null); setHover(null); setSelected(null); setDraft({ id: crypto.randomUUID(), context, body: '', priority: 'medium' }); setOpen(true);
      void run(async () => {
        const screenshot = await captureScreenshot(context);
        if (screenshot.length > 3500000) throw new Error('Screenshot troppo grande. Puoi inviare il commento senza immagine.');
        setDraft(previous => previous ? { ...previous, screenshot } : previous);
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
  const filtered = pageReports.filter(report => (!statuses.length || statuses.includes(report.status)) && (!priorities.length || priorities.includes(report.priority ?? 'medium')) && `${report.body} ${report.page_path} ${report.authorName}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))).sort((a,b) => compareReportsBy(a,b,order));
  const pagination = useReportPagination(filtered.length, JSON.stringify([search, statuses, priorities, page.pagePath, environment.id, order]));
  const paginated = filtered.slice(pagination.start, pagination.start + REPORT_PAGE_SIZE);
  const listRef = useRef<HTMLElement | null>(null);
  const filters = [
    ...statuses.map(value => ({key: 'status-'+value, label: 'Stato: '+statusLabels[value as keyof typeof statusLabels], remove: () => setStatuses(items => items.filter(item => item !== value))})),
    ...priorities.map(value => ({key: 'priority-'+value, label: 'Priorità: '+priorityLabels[value as ReportPriority], remove: () => setPriorities(items => items.filter(item => item !== value))})),
  ];
  const top = site.position.startsWith('top'), left = site.position.endsWith('left');
  const panelPosition = { [top ? 'top' : 'bottom']: 88, [left ? 'left' : 'right']: 24 };
  const floatingControls = <div className={`pointer-events-auto fixed flex items-center gap-1 rounded-full border bg-background p-1.5 shadow-xl ${left ? 'flex-row-reverse' : ''}`} style={{ [top ? 'top' : 'bottom']: 24, [left ? 'left' : 'right']: 24 }}><Button aria-label={modalOpen ? 'Chiudi segnalazioni' : `Apri lista segnalazioni${unreadNotifications ? `, ${unreadNotifications} notifiche non lette` : ''}`} aria-expanded={modalOpen} disabled={busy} variant="ghost" size="icon" className="relative size-9 rounded-lg text-foreground" onClick={() => { if (modalOpen) { setModalOpen(false); } else { setOpen(false); setSettingsOpen(false); setNotificationsOpen(false); setSelected(null); setModalOpen(true); void run(async () => { await refresh(); }); } }}>{modalOpen ? <X className="size-5" /> : <Menu className="size-5" />}{unreadNotifications ? <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}</Button>    <Button aria-label={open ? 'Chiudi creazione segnalazione' : 'Crea segnalazione'} aria-expanded={open} disabled={busy} size="icon" className="size-10 rounded-full" onClick={() => { setOpen(!open); setModalOpen(false); }}><span className="flex transition-transform motion-reduce:transition-none" style={{transform:open?'rotate(45deg)':'rotate(0deg)'}}><Plus className="size-5" /></span></Button></div>;
  return <>
    {hover && mode ? <div className="pointer-events-none fixed border-2 border-indigo-500 bg-indigo-500/10" style={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height }} /> : null}
    {mode ? <div className="pointer-events-auto fixed left-1/2 top-4 -translate-x-1/2 rounded-lg border bg-card p-3 text-sm shadow-xl">{mode === 'element' ? 'Seleziona un elemento' : 'Posiziona un pin'} · Esc per annullare <Button size="sm" variant="outline" onClick={() => { setMode(null); setOpen(true); }}>Annulla</Button></div> : null}
    {!mode && !draft && pinsVisible ? pageReports.filter(report => showResolved || report.status !== 'resolved').map(report => {
      const position = anchorPosition(report.context.anchor);
      if (!position) return null;
      return <div key={report.id} className={`group pointer-events-auto fixed -translate-y-full ${highlighted === report.id ? 'z-20' : ''}`} style={{left:position.x,top:position.y}}>
        <ExpandingPin anchorX={position.x} anchorY={position.y} aria-label={`${statusLabels[report.status]}, priorità ${priorityLabels[report.priority ?? 'medium']}: ${report.body.slice(0,60)}`} className={`relative block ${highlighted === report.id ? 'reporty-pin-highlight' : ''} min-h-[44px] w-[44px] overflow-hidden rounded-tl-[22px] rounded-tr-[22px] rounded-br-[22px] border-2 border-primary/70 bg-card text-card-foreground shadow-md transition-[width,height,translate] duration-300 ease-out group-hover:w-[min(320px,calc(100vw-16px))] focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none`} onClick={() => void view(report)}>
          <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full ${pinColors[report.status]} text-xs font-semibold text-white transition-opacity duration-150 group-hover:opacity-0 motion-reduce:transition-none`}>{(report.authorName?.trim() || 'Utente').slice(0, 1).toLocaleUpperCase('it-IT')}</span>
          <span data-pin-preview className="invisible block opacity-0 transition-[opacity,visibility] duration-[150ms,0ms] delay-[0ms,150ms] ease-out group-hover:visible group-hover:opacity-100 group-hover:delay-[250ms,0ms] motion-reduce:transition-none">
            <span className="block w-[min(316px,calc(100vw-20px))] p-3 text-left">
              <span className="mb-3 flex flex-wrap gap-2 text-xs"><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${statusColors[report.status]}`}><ReportIcon value={report.status} />{statusLabels[report.status]}</span><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${priorityColors[report.priority ?? 'medium']}`}><ReportIcon value={report.priority ?? 'medium'} />Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</span></span>
              <span className="block max-h-40 overflow-hidden whitespace-pre-wrap break-words text-sm">{report.body}</span>
              <span className="mt-3 block truncate text-xs text-muted-foreground" title={report.authorName}>Segnalata da {report.authorName || 'Utente'}</span>
            </span>
          </span>
        </ExpandingPin>
      </div>;
    }) : null}

    {!modalOpen ? floatingControls : null}
    {!mode && !draft ? <div className="pointer-events-none fixed flex flex-col gap-3" style={{ [top ? 'top' : 'bottom']: 88, [left ? 'left' : 'right']: 28 }} aria-hidden={!open}>
      <Button variant="secondary" size="icon" aria-label="Seleziona elemento" title="Seleziona elemento" disabled={busy} tabIndex={open ? 0 : -1} className={`size-11 rounded-full border-border bg-card text-card-foreground shadow-lg hover:bg-accent transition-all duration-200 motion-reduce:transition-none ${open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'}`} style={{ transform: open ? 'translateY(0)' : `translateY(${top ? '-12px' : '12px'})` }} onClick={() => { setMode('element'); setOpen(false); }}><Crosshair className="size-5" aria-hidden="true" /></Button>
      <Button variant="secondary" size="icon" aria-label="Pin libero" title="Pin libero" disabled={busy} tabIndex={open ? 0 : -1} className={`size-11 rounded-full border-border bg-card text-card-foreground shadow-lg hover:bg-accent transition-all duration-200 motion-reduce:transition-none ${open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'}`} style={{ transitionDelay: open ? '50ms' : '0ms', transform: open ? 'translateY(0)' : `translateY(${top ? '-20px' : '20px'})` }} onClick={() => { setMode('pin'); setOpen(false); }}><MapPin className="size-5" aria-hidden="true" /></Button>
    </div> : null}
    {open && !mode && draft ? <section aria-label="Crea segnalazione" className="pointer-events-auto fixed max-h-[75vh] w-[min(380px,calc(100vw-48px))] space-y-4 overflow-y-auto rounded-xl border bg-background p-4 text-sm text-foreground shadow-xl" style={panelPosition}>
      {<form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(async () => {
        const result = await message({ type: 'REPORTY_REPORT', operation: 'create', payload: { id: draft.id, body: draft.body, priority: draft.priority, context: draft.context }, screenshot: draft.screenshot });
        setDraft(null); await refresh(); setStatus(result.warning ?? 'Segnalazione inviata.', result.warning ? 'error' : 'success');
      }); }}>
        <h3 className="font-medium">Nuova segnalazione</h3><Label htmlFor="report-body">Fix da effettuare</Label><Textarea id="report-body" className="min-h-28 rounded-lg border bg-background p-3" value={draft.body} maxLength={10000} required onChange={event => setDraft({ ...draft, body: event.target.value })} />
        <Label htmlFor="report-priority">Priorità</Label><RadioButtons label="Priorità" id="report-priority" disabled={busy} value={draft.priority} onValueChange={value => setDraft({ ...draft, priority: value as ReportPriority })} options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} />
        {capturing && !draft.screenshot ? <ScreenshotSkeleton aspectRatio={`${draft.context.viewport.width} / ${draft.context.viewport.height}`} /> : draft.screenshot ? <><LoadingImage key={draft.screenshot} alt="Anteprima screenshot da inviare" src={draft.screenshot} aspectRatio={`${draft.context.viewport.width} / ${draft.context.viewport.height}`} /><Button type="button" variant="outline" onClick={() => setDraft({ ...draft, screenshot: undefined })}>Rimuovi screenshot</Button></> : <div className="grid gap-2"><p className="text-xs text-muted-foreground">Nessuno screenshot allegato.</p><Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => {
          if (location.href !== draft.context.url || Math.abs(scrollY - draft.context.scroll.y) > 2 || Math.abs(scrollX - draft.context.scroll.x) > 2) throw new Error('Torna alla pagina e alla posizione originali prima di acquisire lo screenshot.');
          const screenshot = await captureScreenshot(draft.context);
          if (screenshot.length > 3500000) throw new Error('Screenshot troppo grande.');
          setDraft(previous => previous ? { ...previous, screenshot } : previous);
        })}>Acquisisci screenshot</Button></div>}
        <Button type="submit" disabled={busy || !draft.body.trim()}>Invia segnalazione</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>Annulla</Button>
      </form>}
    </section> : null}
    <dialog ref={modal} aria-labelledby="reporty-modal-title" className="pointer-events-auto fixed inset-0 m-auto max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-visible rounded-xl border bg-background p-0 text-sm text-foreground shadow-2xl backdrop:bg-black/50" onClick={event => {
        if (event.target !== modal.current) return;
        const rect = modal.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setModalOpen(false);
      }} onCancel={event => { if (event.target === modal.current) { if (busy) event.preventDefault(); else setModalOpen(false); } }} onClose={event => { if (event.target === modal.current) setModalOpen(false); }}>
      <div className={selected || settingsOpen || notificationDetailLoading ? "max-h-[85dvh] space-y-5 overflow-y-auto p-6" : "flex h-[80dvh] max-h-[85dvh] flex-col gap-5 overflow-hidden p-6"}>
        <header className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"><h2 id="reporty-modal-title" className="min-w-0 break-words text-xl font-semibold">{notificationDetailLoading ? 'Dettaglio segnalazione' : notificationsOpen ? 'Notifiche della pagina' : settingsOpen ? 'Impostazioni' : selected ? 'Dettaglio segnalazione' : `${environment.projectName} · ${environment.name}`}</h2><div className="order-first flex items-center justify-end gap-2 sm:order-none">{notificationDetailLoading ? <Button variant="outline" className="min-w-0 max-sm:flex-1" disabled><ArrowLeft className="size-4" aria-hidden="true" /><span className="truncate">Torna alle segnalazioni</span></Button> : settingsOpen || notificationsOpen ? <Button variant="outline" className="min-w-0 max-sm:flex-1" onClick={() => { setSettingsOpen(false); setNotificationsOpen(false); }}><ArrowLeft className="size-4" aria-hidden="true" /><span className="truncate">Torna alle segnalazioni</span></Button> : !selected ? <><Button variant="outline" size="icon" className="relative" aria-label={`Apri notifiche, ${unreadNotifications} non lette`} title="Notifiche" onClick={() => setNotificationsOpen(true)}><Bell className="size-4" aria-hidden="true" />{unreadNotifications ? <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}</Button><Button variant="outline" size="icon" aria-label="Apri impostazioni" title="Impostazioni" onClick={() => setSettingsOpen(true)}><Settings className="size-4" aria-hidden="true" /></Button></> : null}{selected ? <Button variant="outline" className="min-w-0 max-sm:flex-1" disabled={busy} onClick={() => { setSelected(null); setImageUrl(''); }}><ArrowLeft className="size-4" /><span className="truncate">Torna alle segnalazioni</span></Button> : null}<Button variant="outline" size="icon" aria-label="Chiudi modale" disabled={busy} onClick={() => setModalOpen(false)}><X /></Button></div></header>
        {notificationDetailLoading ? <ReportDetailSkeleton /> : notificationsOpen ? <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" aria-label="Notifiche della pagina">
          <div className="flex shrink-0 items-center justify-between gap-2"><div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-1"><ReportFilter label="Stato" options={Object.entries(statusLabels).map(([value,label]) => ({value,label}))} selected={notificationStatuses} onChange={setNotificationStatuses} /><ReportFilter label="Lettura" options={Object.entries(notificationReadLabels).map(([value,label]) => ({value,label}))} selected={notificationReads} onChange={setNotificationReads} /></div><Button variant="outline" size="sm" disabled={busy || notificationsLoading || !unreadNotifications} onClick={() => void readNotifications()}>Segna tutte come lette</Button></div>
          {notificationFilters.length ? <div className="flex shrink-0 flex-wrap gap-2" aria-label="Filtri notifiche attivi">{notificationFilters.map(filter => <FilterPill key={filter.key} label={filter.label} onRemove={filter.remove} />)}</div> : null}
          <InfiniteList key={JSON.stringify([environment.id, page.pagePath, notificationStatuses, notificationReads])} label="Lista notifiche della pagina" items={filteredNotifications} loading={notificationsLoading} disabled={busy} loadingContent={<NotificationRowsSkeleton />} emptyContent={<p className="text-sm text-muted-foreground">{pageNotifications.length ? 'Nessuna notifica corrisponde ai filtri selezionati.' : 'Nessuna notifica per questa pagina.'}</p>} renderItem={item => <NotificationCard key={item.id} item={item} disabled={busy} reading={notificationReadingId === item.id} onOpen={() => readNotifications(item)} onMarkRead={() => readNotifications(item, false)} />} />
        </section> : settingsOpen ? <section className="space-y-4" aria-label="Impostazioni Reporty">
          <div className="space-y-3 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><Label htmlFor="reporty-opener-position">Posizione dei pulsanti</Label><p className="text-xs text-muted-foreground">Scegli dove mostrare il menu e il pulsante + su questo sito.</p></div><SelectField id="reporty-opener-position" value={site.position} options={openerPositionOptions} disabled={busy} onValueChange={updatePosition} /></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><Label htmlFor="reporty-pins-visible">Mostra segnalazioni sulla pagina</Label><p id="reporty-pins-help" className="text-xs text-muted-foreground">Mostra o nasconde tutti i pin. Le segnalazioni restano disponibili nella lista.</p></div><Switch id="reporty-pins-visible" checked={pinsVisible} onCheckedChange={setPinsVisible} aria-describedby="reporty-pins-help" /></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><Label htmlFor="reporty-resolved">Mostra risolte</Label><p id="reporty-resolved-help" className="text-xs text-muted-foreground">Include i pin delle segnalazioni chiuse sulla pagina. Non modifica i filtri della lista.</p></div><Switch id="reporty-resolved" checked={showResolved} onCheckedChange={setShowResolved} disabled={!pinsVisible} aria-describedby="reporty-resolved-help" /></div>
          <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/50 p-4 dark:bg-card"><div className="space-y-1"><h3 className="text-sm font-medium">Tema</h3><p className="text-xs text-muted-foreground">Scegli la modalità chiara o scura per Reporty.</p></div><ThemeSwitch host={host} /></div>
        </section> : selected ? <div className="space-y-4">
        <section className="space-y-4" aria-label="Segnalazione"><div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 text-xs sm:flex-wrap"><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${statusColors[selected.status]}`}><ReportIcon value={selected.status} />{statusLabels[selected.status]}</span><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${priorityColors[selected.priority ?? 'medium']}`}><ReportIcon value={selected.priority ?? 'medium'} />Priorità {priorityLabels[selected.priority ?? 'medium'].toLowerCase()}</span></div><div className="flex items-center gap-2">{selected.screenshot_path ? <Button variant="outline" className="max-sm:size-8 max-sm:px-0" aria-label="Mostra screenshot" title="Mostra screenshot" disabled={busy || imageLoading} onClick={() => { setImageUrl(''); setGalleryOpen(true); void run(async () => { try { const result = await loadScreenshot(selected.id); setImageUrl(result.url); } catch (error) { setGalleryOpen(false); throw error; } }); }}><Eye className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Mostra screenshot</span></Button> : null}<Button variant="outline" className="max-sm:size-8 max-sm:px-0" aria-label="Vai alla segnalazione" title="Vai al punto" disabled={busy} onClick={() => {
          if (selected.page_path !== page.pagePath) { const url = new URL(selected.context.url); url.searchParams.set('__reporty_issue', selected.id); location.assign(url.href); return; }
          setModalOpen(false);
          setHighlighted(null);
          requestAnimationFrame(() => setHighlighted(selected.id));
          if (selected.status === 'resolved') setShowResolved(true);
          const point = locate(selected.context.anchor);
          if (point) window.scrollBy({ top: point.y - innerHeight / 2, left: 0, behavior: 'smooth' });
          else window.scrollTo({ top: selected.context.scroll.y, left: selected.context.scroll.x, behavior: 'smooth' });
        }}><Target className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Vai alla segnalazione</span></Button></div></div>
        <section className="space-y-3 rounded-xl border bg-muted/50 dark:bg-card p-4"><h4 className="text-sm font-semibold">Descrizione</h4>{edit === null ? <p className="whitespace-pre-wrap break-words leading-relaxed">{selected.body}</p> : null}
        {selected.canEdit ? <div className="flex flex-col items-end gap-2">{edit === null ? <Button variant="outline" size="icon" aria-label="Modifica testo" title="Modifica testo" disabled={busy} onClick={() => setEdit(selected.body)}><Pencil className="size-4" aria-hidden="true" /></Button> : <form className="grid w-full gap-2" onSubmit={event => { event.preventDefault(); if (busy || !edit?.trim() || edit.trim() === selected.body.trim()) return; void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'edit', payload: { id: selected.id, body: edit } }); setStatus('Testo aggiornato.', 'success'); const items = await refresh(); setSelected(items.find(item => item.id === selected.id) ?? null); setEdit(null); }); }}><Textarea aria-label="Modifica descrizione" className="min-h-28 rounded-lg border bg-background p-3" required value={edit} maxLength={10000} onChange={event => setEdit(event.target.value)} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(null)}>Annulla</Button><Button type="submit" disabled={busy || !edit.trim() || edit.trim() === selected.body.trim()}>Salva testo</Button></div></form>}</div> : null}</section>
        {galleryOpen ? <ScreenshotGallery autoOpen loading={imageLoading || !imageUrl} onClose={() => { setGalleryOpen(false); setImageUrl(''); }} src={imageUrl} aspectRatio={`${selected.context.viewport.width} / ${selected.context.viewport.height}`} /> : null}
        {selected.page_path === page.pagePath && !locate(selected.context.anchor) ? <p className="rounded-lg bg-muted p-3">Elemento non trovato o modificato. Consulta lo screenshot originale.</p> : null}
        <section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4" aria-label="Gestione segnalazione">
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="report-status">Stato</Label><RadioButtons label="Stato" id="report-status" disabled={busy} value={selected.status} onValueChange={value => updateReportField('status', value)} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></div> : null}
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="selected-priority">Priorità</Label><RadioButtons label="Priorità" id="selected-priority" disabled={busy} value={selected.priority ?? 'medium'} onValueChange={value => updateReportField('priority', value)} options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} /></div> : null}

        </section></section><section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4" aria-label="Risposte"><h3 className="font-medium">Risposte</h3>{threadLoading ? <RepliesSkeleton /> : null}{!threadLoading && comments.map(comment => <div key={comment.id} className="rounded-lg border bg-background p-3 dark:bg-muted"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">{comment.authorName}</p><time dateTime={comment.created_at} className="text-xs text-muted-foreground">{formatReportDateTime(comment.created_at)}</time></div><p className="whitespace-pre-wrap break-words">{comment.body}</p><ReplyAttachmentList attachments={comment.attachments} requestFile={input => message({ type:"REPORTY_ATTACHMENT",payload:{ ...input,issueId:selected.id } })} onError={text => setStatus(text,"error")} /></div>)}
        <ReplyComposer key={selected.id} disabled={busy} onBusyChange={setBusy} requestFile={(input: AttachmentRequest) => message({ type:'REPORTY_ATTACHMENT',payload:{ ...input,issueId:selected.id } })} onError={text => setStatus(text,'error')} submit={async (body,attachments,replyId) => {
          await message({ type:'REPORTY_REPORT',operation:'reply',payload:{ id:selected.id,body,attachments,replyId } });
          setStatus('Risposta inviata.','success');
          try {
            const result = await loadThread(selected.id); setComments(result.data.comments);
            setReports(items => items.map(item => item.id === selected.id ? { ...item,commentCount:result.data.comments.length } : item));
          } catch (error) { setStatus(error instanceof Error ? error.message : 'Impossibile aggiornare le risposte.','error'); }
        }} />
        </section><footer className="rounded-xl border bg-muted/50 dark:bg-card p-4 text-xs text-muted-foreground"><p>Segnalata da {selected.authorName}</p><p>{selected.updated_at ? <>Ultima modifica: {selected.updatedByName ?? 'Utente'} · {formatReportDateTime(selected.updated_at)}</> : 'Nessuna modifica registrata'}</p><p>Viewport originale: {selected.context.viewport.width} × {selected.context.viewport.height} · scroll {Math.round(selected.context.scroll.y)} px</p></footer>{selected.canEdit ? <section aria-label="Zona pericolosa" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="text-sm font-semibold text-destructive">Zona pericolosa</h3><div className="flex justify-end"><DeleteConfirm fullWidth disabled={busy} description="Eliminare questa segnalazione e tutte le sue risposte? Questa operazione è definitiva." onConfirm={() => run(async () => { const result = await message({ type: 'REPORTY_REPORT', operation: 'delete', payload: { id: selected.id } }); setStatus('Segnalazione eliminata.', 'success'); if (result.warning) setStatus(result.warning,'error'); setSelected(null); await refresh(); })}><Trash2 className="size-4" aria-hidden="true" />Elimina</DeleteConfirm></div></section> : null}
      </div> : <div className="flex min-h-0 flex-1 flex-col gap-5">
  <Input aria-label="Cerca segnalazioni" placeholder="Cerca commento o pagina…" className="h-10 w-full rounded-lg border bg-background px-3" value={search} onChange={event => setSearch(event.target.value)} />
  <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2">
    <ReportFilter label="Stato" options={Object.entries(statusLabels).map(([value,label]) => ({value,label}))} selected={statuses} onChange={setStatuses} />
    <ReportFilter label="Priorità" options={Object.entries(priorityLabels).map(([value,label]) => ({value,label}))} selected={priorities} onChange={setPriorities} />
    </div><ReportOrder value={order} onChange={setOrder} />
  </div>
  {filters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri attivi">{filters.map(filter => <FilterPill key={filter.key} label={filter.label} onRemove={filter.remove}><ReportIcon value={filter.key.replace(/^(status|priority)-/, "")} /></FilterPill>)}</div> : null}

  <section ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1" aria-label="Lista segnalazioni">
    {listLoading ? <ReportRowsSkeleton /> : null}
    {!listLoading && !filtered.length ? <p className="p-6 text-muted-foreground">Nessuna segnalazione trovata.</p> : null}
    {!listLoading && paginated.map(report => <button key={report.id} className="block w-full space-y-3 rounded-xl border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none" onClick={() => void view(report)}>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row"><p className="min-w-0 flex-1 line-clamp-3 break-words font-medium">{report.body}</p><div className="flex shrink-0 flex-col items-start gap-2 text-xs sm:flex-row"><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${statusColors[report.status]}`}><ReportIcon value={report.status} />{statusLabels[report.status]}</span><span className={`inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklab,currentColor_25%,transparent)] px-2 py-1 ${priorityColors[report.priority ?? 'medium']}`}><ReportIcon value={report.priority ?? 'medium'} />Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</span></div></div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"><div className="flex min-w-0 flex-wrap gap-2"><span>{report.authorName}</span><span className="break-all">· {report.page_path}</span></div><time dateTime={report.created_at} className="ml-auto shrink-0 text-right">{formatReportDateTime(report.created_at)}</time></div>
    </button>)}
  </section>
  {!listLoading ? <ReportPagination total={filtered.length} page={pagination.page} pages={pagination.pages} onChange={next => { pagination.setPage(next); listRef.current?.scrollTo({ top: 0 }); }} /> : null}
</div>}
      </div>
      {modalOpen ? floatingControls : null}
    </dialog>
  </>;
}
