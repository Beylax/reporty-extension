'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { Eye, EyeOff, MoveHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { formatReportDateTime, priorityLabels, type AttachmentRequest, type Report, type ReportComment } from '@reporty/shared';
import { ReplyAttachmentList, ReplyComposer } from '@reporty/shared/ui/reply-attachments';
import { TooltipButton } from '@reporty/shared/ui/tooltip-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioButtons } from '@/components/ui/radio-buttons';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToastManager } from '@/components/ui/toast';
import { DeleteConfirm } from '@/components/delete-confirm';
import { ReportIcon } from '@/components/report-icon';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import { NOTIFICATIONS_CHANGED } from '@/lib/notification-polling';
import { isViewportDimension, type Viewport } from '@/lib/playground';
import { getReportPage, getReportThread, mutateReport } from './report-actions';

const statuses = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
const statusColors = { open: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', in_progress: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200', validation: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200', resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' };
const priorityColors = { low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', medium: 'bg-amber-100 text-amber-800 dark:bg-orange-950 dark:text-orange-200', high: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' };

function ScreenshotButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const measurement = useRef<HTMLSpanElement>(null);
  const [showLabel, setShowLabel] = useState(false);
  useEffect(() => {
    const available = container.current;
    const fullButton = measurement.current;
    if (!available || !fullButton) return;
    const measure = () => setShowLabel(fullButton.offsetWidth <= available.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(available);
    observer.observe(fullButton);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="relative flex min-w-8 flex-1 justify-end">
    <span ref={measurement} aria-hidden="true" className={`${buttonVariants({ variant: 'outline' })} pointer-events-none invisible absolute right-0 top-0 w-max`}><Eye aria-hidden="true" /><span>Mostra screenshot</span></span>
    <TooltipButton label="Mostra screenshot" size={showLabel ? 'default' : 'icon'} disabled={disabled} onClick={onClick}><Eye aria-hidden="true" />{showLabel ? <span>Mostra screenshot</span> : null}</TooltipButton>
  </div>;
}

function DetailSkeleton() {
  return <div role="status" aria-label="Caricamento dettaglio segnalazione" className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div className="flex shrink-0 gap-2"><Skeleton className="h-6 w-24 rounded-full" /><Skeleton className="h-6 w-28 rounded-full" /></div><Skeleton className="h-8 min-w-8 max-w-36 flex-1" /></div>
    <div className="space-y-3 rounded-xl border p-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="ml-auto size-8" /></div>
    <div className="space-y-3 rounded-xl border p-4">{[0,1].map(index => <div key={index} className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-9 w-full" /></div>)}</div>
    <div className="space-y-3 rounded-xl border p-4"><Skeleton className="h-5 w-20" /><Skeleton className="h-20 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="ml-auto h-8 w-24" /></div>
    <div className="space-y-2 rounded-xl border p-4"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/4" /></div>
  </div>;
}

export function PlaygroundReportDrawer({ id, environmentId, pagePath, onClose, onChanged, onViewport }: {
  id: string; environmentId: string; pagePath: string; onClose: () => void; onChanged: () => void; onViewport: (viewport: Viewport) => void;
}) {
  const titleId = useId();
  const drawer = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const screenshotRevision = useRef(0);
  const [report, setReport] = useState<Report | null>(null);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [body, setBody] = useState('');
  const [gallery, setGallery] = useState<{ url: string; loading: boolean } | null>(null);
  const toast = useToastManager();
  const finishClose = useEffectEvent(onClose);
  useEffect(() => {
    if (!closing || !drawer.current) return;
    let disposed = false;
    // Keep the drawer mounted through its exit; reduced motion has no animation to await.
    void Promise.allSettled(drawer.current.getAnimations().map(animation => animation.finished)).then(() => {
      if (!disposed) finishClose();
    });
    return () => { disposed = true; };
  }, [closing]);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focusing an offscreen, animating drawer must not scroll its container
    // to follow the button and visually cancel the slide-in movement.
    closeButton.current?.focus({ preventScroll: true });
    return () => { alive.current = false; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      getReportPage(environmentId, { id, environments: [environmentId], pages: [pagePath], limit: 1 }),
      getReportThread(environmentId, id),
    ]).then(([listing, thread]) => {
      if (disposed) return;
      const item = listing.reports[0];
      if (!item || item.environment_id !== environmentId || item.page_path !== pagePath || thread.error) throw new Error(thread.error ?? 'Segnalazione non disponibile in questa pagina.');
      setReport(item); setComments(thread.data.comments); setFailed(false);
    }).catch(error => {
      if (disposed) return;
      setFailed(true);
      toast.add({ title: 'Dettaglio non disponibile', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' });
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [id, environmentId, pagePath, attempt, toast]);
  async function reload() {
    const [listing, thread] = await Promise.all([getReportPage(environmentId, { id, environments: [environmentId], pages: [pagePath], limit: 1 }), getReportThread(environmentId, id)]);
    if (thread.error || !listing.reports[0]) throw new Error(thread.error ?? 'Segnalazione non disponibile.');
    if (alive.current) { setReport(listing.reports[0]); setComments(thread.data.comments); }
  }
  async function write(operation: 'status' | 'priority' | 'edit' | 'reply' | 'delete', payload: { body?: string; status?: string; priority?: string; attachments?: string[]; replyId?: string }) {
    const result = await mutateReport(environmentId, operation, { id, ...payload }, false);
    if (result.error) throw new Error(result.error);
    toast.add({ title: operation === 'delete' ? 'Segnalazione eliminata' : operation === 'reply' ? 'Risposta aggiunta' : 'Modifiche salvate', type: 'success' });
    if (result.warning) toast.add({ title: result.warning, type: 'error' });
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    onChanged();
    if (operation === 'delete') { if (alive.current) setClosing(true); return; }
    try { await reload(); }
    catch { toast.add({ title: 'Modifica salvata; aggiornamento del dettaglio non riuscito.', type: 'error' }); }
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await work(); }
    catch (error) { toast.add({ title: 'Operazione non riuscita', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function attachmentRequest(input: AttachmentRequest) {
    const response = await fetch('/api/attachments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, environmentId, issueId: id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Allegato non disponibile.');
    return result;
  }
  function attachmentError(message: string) { toast.add({ title: 'Operazione non riuscita', description: message, type: 'error' }); }
  function applyReportViewport() {
    if (!report) return;
    const { width, height } = report.context.viewport;
    if (!isViewportDimension(width) || !isViewportDimension(height)) {
      toast.add({ title: 'Dimensioni non valide', description: 'La viewport deve avere dimensioni intere da 240 a 3840 pixel.', type: 'error' });
      return;
    }
    onViewport({ width, height });
    toast.add({ title: `Viewport applicata: ${width} × ${height} px`, type: 'success' });
  }
  async function screenshot() {
    const revision = ++screenshotRevision.current;
    setGallery({ url: '', loading: true });
    try {
      const response = await fetch(`/api/reports/${id}/screenshot`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Screenshot non disponibile.');
      if (alive.current && screenshotRevision.current === revision) setGallery({ url: result.url, loading: false });
    } catch (error) { if (alive.current && screenshotRevision.current === revision) { setGallery(null); attachmentError(error instanceof Error ? error.message : 'Screenshot non disponibile.'); } }
  }
  return <aside ref={drawer} inert={closing} aria-labelledby={titleId} className={`absolute inset-y-0 right-0 z-30 flex w-[min(440px,calc(100%_-_1rem))] ${closing ? 'animate-out slide-out-to-right-full [animation-fill-mode:forwards]' : 'animate-in slide-in-from-right-full'} flex-col border-l transition-[background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:animate-none motion-reduce:transition-none ${transparent ? 'border-border/10 bg-background/5 shadow-none' : 'bg-background shadow-xl'}`} onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); if (!busy) setClosing(true); } }}>
    <header className={`flex shrink-0 items-center justify-between gap-3 border-b p-4 transition-colors duration-200 motion-reduce:transition-none ${transparent ? 'border-border/10' : ''}`}><h2 id={titleId} className={`text-lg font-semibold transition-opacity duration-200 motion-reduce:transition-none ${transparent ? 'opacity-10' : ''}`}>Dettaglio segnalazione</h2><div className="flex shrink-0 gap-2"><TooltipButton label="Adatta alla viewport della segnalazione" className="bg-background" disabled={loading || failed || !report || closing} onClick={applyReportViewport}><MoveHorizontal aria-hidden="true" /></TooltipButton><TooltipButton variant={transparent ? 'secondary' : 'outline'} className="bg-background" label={transparent ? 'Ripristina opacità drawer' : 'Rendi drawer trasparente'} aria-pressed={transparent} onClick={() => setTransparent(value => !value)}>{transparent ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</TooltipButton><Button ref={closeButton} variant="outline" size="icon" className="bg-background" aria-label="Chiudi dettaglio segnalazione" disabled={busy || closing} onClick={() => setClosing(true)}><X aria-hidden="true" /></Button></div></header>
    <div className={`min-h-0 flex-1 space-y-4 overflow-y-auto p-4 transition-opacity duration-200 motion-reduce:transition-none ${transparent ? 'opacity-10' : ''}`}>
      {loading ? <DetailSkeleton /> : failed || !report ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Il dettaglio della segnalazione non è disponibile.</p><Button variant="outline" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Riprova</Button></div> : <>
        <div className="flex items-center justify-between gap-3"><div className="flex shrink-0 items-center gap-2"><Badge className={statusColors[report.status]}><ReportIcon value={report.status} />{statuses[report.status]}</Badge><Badge className={priorityColors[report.priority ?? 'medium']}><ReportIcon value={report.priority ?? 'medium'} />{priorityLabels[report.priority ?? 'medium']}</Badge></div>{report.screenshot_path ? <ScreenshotButton disabled={gallery?.loading === true} onClick={() => void screenshot()} /> : null}</div>
        <section className="space-y-3 rounded-xl border bg-muted/50 p-4"><h3 className="text-sm font-semibold">Descrizione</h3>{editing ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (body.trim() && body.trim() !== report.body.trim()) void run(async () => { await write('edit', { body }); if (alive.current) setEditing(false); }); }}><Textarea aria-label="Modifica descrizione" value={body} onChange={event => setBody(event.target.value)} maxLength={10000} required disabled={busy} className="min-h-28" /><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Annulla</Button><Button disabled={busy || !body.trim() || body.trim() === report.body.trim()}>Salva testo</Button></div></form> : <><p className="whitespace-pre-wrap break-words leading-relaxed">{report.body}</p>{report.canEdit ? <div className="flex justify-end"><TooltipButton label="Modifica descrizione" disabled={busy} onClick={() => { setBody(report.body); setEditing(true); }}><Pencil aria-hidden="true" /></TooltipButton></div> : null}</>}
        </section>
        {gallery ? <ScreenshotGallery autoOpen src={gallery.url} loading={gallery.loading} aspectRatio={`${report.context.viewport.width} / ${report.context.viewport.height}`} onClose={() => { screenshotRevision.current++; setGallery(null); }} /> : null}
        <section className="space-y-4 rounded-xl border bg-muted/50 p-4"><div className="space-y-2"><Label htmlFor={`${titleId}-status`}>Stato</Label><RadioButtons id={`${titleId}-status`} label="Stato" value={report.status} options={Object.entries(statuses).map(([value, label]) => ({ value, label }))} disabled={busy || !report.canChangeStatus} onValueChange={value => { if (value !== report.status) void run(() => write('status', { status: value })); }} /></div><div className="space-y-2"><Label htmlFor={`${titleId}-priority`}>Priorità</Label><RadioButtons id={`${titleId}-priority`} label="Priorità" variant="standard" value={report.priority ?? 'medium'} options={(['high','medium','low'] as const).map(value => ({ value, label: priorityLabels[value] }))} disabled={busy || !report.canChangeStatus} onValueChange={value => { if (value !== (report.priority ?? 'medium')) void run(() => write('priority', { priority: value })); }} /></div></section>
        <section className="space-y-4 rounded-xl border bg-muted/50 p-4"><h3 className="font-semibold">Risposte</h3>{comments.map(comment => <div key={comment.id} className="space-y-2 rounded-lg border bg-background p-3"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{comment.authorName}</span><time dateTime={comment.created_at}>{formatReportDateTime(comment.created_at)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p><ReplyAttachmentList attachments={comment.attachments} requestFile={attachmentRequest} onError={attachmentError} /></div>)}<ReplyComposer disabled={busy} onBusyChange={setBusy} requestFile={attachmentRequest} onError={attachmentError} submit={async (body, attachments, replyId) => { await write('reply', { body, attachments, replyId }); }} /></section>
        <footer className="space-y-1 rounded-xl border bg-muted/50 p-4 text-xs text-muted-foreground"><p>Segnalata da {report.authorName} · {formatReportDateTime(report.created_at)}</p><p>{report.updated_at ? `Ultima modifica: ${report.updatedByName ?? 'Utente'} · ${formatReportDateTime(report.updated_at)}` : 'Nessuna modifica registrata'}</p><p>Viewport originale: {report.context.viewport.width} × {report.context.viewport.height} · scroll {Math.round(report.context.scroll.y)} px</p></footer>
        {report.canEdit ? <section aria-label="Zona pericolosa" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="text-sm font-semibold text-destructive">Zona pericolosa</h3><DeleteConfirm fullWidth disabled={busy} description="Eliminare questa segnalazione e tutte le sue risposte? Questa operazione è definitiva." onConfirm={() => run(() => write('delete', {}))}><Trash2 aria-hidden="true" />Elimina</DeleteConfirm></section> : null}
      </>}
    </div>
  </aside>;
}
