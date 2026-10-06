import { DeleteConfirm } from '@/components/delete-confirm';
import { ReportFilter } from '@/components/report-filter';
import { ThemeSwitch } from '@/components/theme-switch';

import { BrandLogo } from '@/components/brand-logo';
import { useNotify } from '@/components/ui/toast';
import { RepliesSkeleton, ReportRowsSkeleton, ScreenshotSkeleton } from '@/components/loading-skeletons';
import { LoadingImage } from '@/components/loading-image';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Menu, X, Crosshair, Eye, MapPin, Pencil, Plus, Target } from 'lucide-react';
import { formatReportDateTime, getPageContext, priorityLabels, type ReportPriority, type Anchor, type Report, type ReportComment, type ReportContext } from '@reporty/shared';
import type { Environment, Site } from '@/lib/session';
import { captureHighlightedScreenshot } from '@/lib/screenshot';
import { elementAnchor, anchorPosition } from '@/lib/anchor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { anchorPosition as locate } from '@/lib/anchor';

async function extensionMessage(body: object) {
  const response = await browser.runtime.sendMessage(body);
  if (!response?.ok) throw new Error(response?.error ?? 'Operazione non riuscita.');
  return response.data;
}
const statusLabels = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' };
const statusColors = { open: 'bg-blue-100 text-blue-800', in_progress: 'bg-amber-100 text-amber-800', resolved: 'bg-emerald-100 text-emerald-800' };
const pinColors = { open: 'bg-blue-600', in_progress: 'bg-amber-600', resolved: 'bg-emerald-600' };
const priorityColors = { low: 'bg-slate-100 text-slate-700', medium: 'bg-amber-100 text-amber-800', high: 'bg-red-100 text-red-800' };
type Draft = { id: string; context: ReportContext; screenshot?: string; body: string; priority: ReportPriority };

export function ReviewOverlay({ site, environment, host, transport, logoUrl }: { site: Site; environment: Environment; host: HTMLElement; transport?: (body: Record<string, unknown>) => Promise<unknown>; logoUrl?: string }) {
  const message = async (body: Record<string, unknown>) => (transport ? await transport(body) : await extensionMessage(body)) as Awaited<ReturnType<typeof extensionMessage>>;
  const deepLink = useRef(new URL(location.href).searchParams.get('__reporty_issue'));
  const [page, setPage] = useState(getPageContext(location.href));
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<string[]>(['open', 'in_progress']);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [mode, setMode] = useState<'element' | 'pin' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [reply, setReply] = useState('');
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
    try { return await captureHighlightedScreenshot(host, context, () => message({ type: 'REPORTY_CAPTURE' })); } finally { setCapturing(false); }
  }
  async function refresh() {
    setListLoading(true);
    try {
      const result = await message({ type: 'REPORTY_REPORT', operation: 'list', payload: {} });
      const chronological = [...(result.data as Report[])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
      setReports(chronological);
      return chronological;
    } finally { setListLoading(false); }
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setStatus('');
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  }
  async function view(report: Report) {
    setSelected(report); setReply(''); setDraft(null); setEdit(null); setComments([]); setImageUrl(''); setOpen(false); setModalOpen(true);
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
    const report = reports.find(item => item.id === id);
    if (!report) return;
    deepLink.current = null;
    const url = new URL(location.href);
    url.searchParams.delete('__reporty_issue');
    history.replaceState(history.state, '', url.href);
    void view(report);
    let attempts = 0;
    const move = () => {
      const point = locate(report.context.anchor);
      if (point) {
        window.scrollBy({ top: point.y - innerHeight / 2, left: point.x - innerWidth / 2, behavior: 'smooth' });
        return true;
      }
      return false;
    };
    if (move()) return;
    window.scrollTo({ top: report.context.scroll.y, left: report.context.scroll.x });
    const timer = setInterval(() => { if (move() || ++attempts >= 20) clearInterval(timer); }, 500);
    return () => clearInterval(timer);
  }, [reports, listLoading]);
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
  const filtered = pageReports.filter(report => (!statuses.length || statuses.includes(report.status)) && (!priorities.length || priorities.includes(report.priority ?? 'medium')) && `${report.body} ${report.page_path} ${report.authorName}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))).sort((a,b) => ({high:0,medium:1,low:2}[a.priority ?? 'medium'] - {high:0,medium:1,low:2}[b.priority ?? 'medium']));
  const filters = [
    ...statuses.map(value => ({key: 'status-'+value, label: 'Stato: '+statusLabels[value as keyof typeof statusLabels], remove: () => { const next = statuses.filter(item => item !== value); setStatuses(next); setShowResolved(!next.length || next.includes('resolved')); }})),
    ...priorities.map(value => ({key: 'priority-'+value, label: 'Priorità: '+priorityLabels[value as ReportPriority], remove: () => setPriorities(items => items.filter(item => item !== value))})),
  ];
  const top = site.position.startsWith('top'), left = site.position.endsWith('left');
  const panelPosition = { [top ? 'top' : 'bottom']: 88, [left ? 'left' : 'right']: 24 };
  return <>
    {hover && mode ? <div className="pointer-events-none fixed border-2 border-indigo-500 bg-indigo-500/10" style={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height }} /> : null}
    {mode ? <div className="pointer-events-auto fixed left-1/2 top-4 -translate-x-1/2 rounded-lg border bg-card p-3 text-sm shadow-xl">{mode === 'element' ? 'Seleziona un elemento' : 'Posiziona un pin'} · Esc per annullare <Button size="sm" variant="outline" onClick={() => { setMode(null); setOpen(true); }}>Annulla</Button></div> : null}
    {!mode && !draft ? pageReports.map((report, index) => {
      const position = anchorPosition(report.context.anchor);
      if (!position || (!showResolved && report.status === 'resolved')) return null;
      return <button key={report.id} aria-label={`Segnalazione ${index + 1}, ${statusLabels[report.status]}: ${report.body.slice(0, 60)}`} title={`Segnalazione ${index + 1} · ${statusLabels[report.status]}`} className={`pointer-events-auto fixed flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white ${pinColors[report.status]} text-sm font-semibold text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`} style={{ left: position.x, top: position.y }} onClick={() => void view(report)}>{index + 1}</button>;
    }) : null}

    <Button aria-label={open ? 'Chiudi creazione segnalazione' : 'Crea segnalazione'} aria-expanded={open} className="pointer-events-auto fixed size-13 rounded-full shadow-xl" style={{ [top ? 'top' : 'bottom']: 24, [left ? 'left' : 'right']: 24 }} onClick={() => { setOpen(!open); setModalOpen(false); }}><span className="flex transition-transform motion-reduce:transition-none" style={{transform:open?'rotate(45deg)':'rotate(0deg)'}}><Plus className="size-6" /></span></Button>
<Button aria-label={modalOpen ? 'Chiudi segnalazioni' : 'Apri lista segnalazioni'} aria-expanded={modalOpen} className="pointer-events-auto fixed size-7 rounded-full p-0 shadow-xl" style={{ [top ? 'top' : 'bottom']: 36, [left ? 'left' : 'right']: 88 }} onClick={() => { if (modalOpen) { setModalOpen(false); } else { setOpen(false); setSelected(null); setModalOpen(true); void run(async () => { await refresh(); }); } }}>{modalOpen ? <X className="size-4" /> : <Menu className="size-4" />}</Button>
    {!mode && !draft ? <div className="pointer-events-none fixed flex flex-col gap-3" style={{ [top ? 'top' : 'bottom']: 88, [left ? 'left' : 'right']: 28 }} aria-hidden={!open}>
      <Button variant="secondary" size="icon" aria-label="Seleziona elemento" title="Seleziona elemento" disabled={busy} tabIndex={open ? 0 : -1} className={`size-11 rounded-full border-border bg-card text-card-foreground shadow-lg hover:bg-accent transition-all duration-200 motion-reduce:transition-none ${open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'}`} style={{ transform: open ? 'translateY(0)' : `translateY(${top ? '-12px' : '12px'})` }} onClick={() => { setMode('element'); setOpen(false); }}><Crosshair className="size-5" aria-hidden="true" /></Button>
      <Button variant="secondary" size="icon" aria-label="Pin libero" title="Pin libero" disabled={busy} tabIndex={open ? 0 : -1} className={`size-11 rounded-full border-border bg-card text-card-foreground shadow-lg hover:bg-accent transition-all duration-200 motion-reduce:transition-none ${open ? 'pointer-events-auto scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'}`} style={{ transitionDelay: open ? '50ms' : '0ms', transform: open ? 'translateY(0)' : `translateY(${top ? '-20px' : '20px'})` }} onClick={() => { setMode('pin'); setOpen(false); }}><MapPin className="size-5" aria-hidden="true" /></Button>
    </div> : null}
    {open && !mode && draft ? <section aria-label="Crea segnalazione" className="pointer-events-auto fixed max-h-[75vh] w-[min(380px,calc(100vw-48px))] space-y-4 overflow-y-auto rounded-xl border bg-background p-4 text-sm text-foreground shadow-xl" style={panelPosition}>
      {<form className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm" onSubmit={event => { event.preventDefault(); void run(async () => {
        const result = await message({ type: 'REPORTY_REPORT', operation: 'create', payload: { id: draft.id, body: draft.body, priority: draft.priority, context: draft.context }, screenshot: draft.screenshot });
        setDraft(null); await refresh(); setStatus(result.warning ?? 'Segnalazione inviata.', result.warning ? 'error' : 'success');
      }); }}>
        <h3 className="font-medium">Nuova segnalazione</h3><Label htmlFor="report-body">Fix da effettuare</Label><textarea id="report-body" className="min-h-28 rounded-lg border bg-background p-3" value={draft.body} maxLength={10000} required onChange={event => setDraft({ ...draft, body: event.target.value })} />
        <Label htmlFor="report-priority">Priorità</Label><select id="report-priority" className="rounded-lg border bg-background p-2" disabled={busy} value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as ReportPriority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
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
      }} onCancel={event => { if (event.target === modal.current) setModalOpen(false); }} onClose={event => { if (event.target === modal.current) setModalOpen(false); }}>
      <div className={selected ? "max-h-[85dvh] space-y-5 overflow-y-auto p-6" : "flex h-[80dvh] max-h-[85dvh] flex-col gap-5 overflow-hidden p-6"}>
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3"><h2 id="reporty-modal-title" className="text-xl font-semibold">{selected ? 'Dettaglio segnalazione' : `${environment.projectName} · ${environment.name}`}</h2><div className="flex flex-wrap items-center gap-2">{!selected ? <ThemeSwitch host={host} /> : null}{selected ? <Button variant="outline" onClick={() => { setSelected(null); setImageUrl(''); }}><ArrowLeft className="size-4" />Torna alle segnalazioni</Button> : null}<Button variant="ghost" size="icon" aria-label="Chiudi modale" onClick={() => setModalOpen(false)}><X /></Button></div></header>
        {selected ? <div className="space-y-4">
        <section className="space-y-4" aria-label="Segnalazione"><div className="flex items-center justify-between gap-2"><div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${statusColors[selected.status]}`}>{statusLabels[selected.status]}</span><span className={`rounded-full px-2 py-1 ${priorityColors[selected.priority ?? 'medium']}`}>Priorità {priorityLabels[selected.priority ?? 'medium'].toLowerCase()}</span></div><div className="flex items-center gap-2">{selected.screenshot_path ? <Button variant="outline" disabled={busy || imageLoading} onClick={() => { setImageUrl(''); setGalleryOpen(true); void run(async () => { try { const result = await loadScreenshot(selected.id); setImageUrl(result.url); } catch (error) { setGalleryOpen(false); throw error; } }); }}><Eye className="size-4" aria-hidden="true" />Mostra screenshot</Button> : null}<Button variant="outline" aria-label="Vai alla segnalazione" title="Vai al punto" disabled={busy} onClick={() => {
          if (selected.page_path !== page.pagePath) { const url = new URL(selected.context.url); url.searchParams.set('__reporty_issue', selected.id); location.assign(url.href); return; }
          setModalOpen(false);
          const point = locate(selected.context.anchor);
          if (point) window.scrollBy({ top: point.y - innerHeight / 2, left: 0, behavior: 'smooth' });
          else window.scrollTo({ top: selected.context.scroll.y, left: selected.context.scroll.x, behavior: 'smooth' });
        }}><Target className="size-4" aria-hidden="true" />Vai alla segnalazione</Button></div></div>
        <section className="space-y-3 rounded-xl border bg-muted/50 dark:bg-card p-4"><h4 className="text-sm font-semibold">Descrizione</h4>{edit === null ? <p className="whitespace-pre-wrap break-words leading-relaxed">{selected.body}</p> : null}
        {selected.canEdit ? <div className="flex flex-col items-end gap-2">{edit === null ? <Button variant="outline" size="icon" aria-label="Modifica testo" title="Modifica testo" disabled={busy} onClick={() => setEdit(selected.body)}><Pencil className="size-4" aria-hidden="true" /></Button> : <form className="grid w-full gap-2" onSubmit={event => { event.preventDefault(); if (busy || !edit?.trim() || edit.trim() === selected.body.trim()) return; void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'edit', payload: { id: selected.id, body: edit } }); setStatus('Testo aggiornato.', 'success'); const items = await refresh(); setSelected(items.find(item => item.id === selected.id) ?? null); setEdit(null); }); }}><textarea aria-label="Modifica descrizione" className="min-h-28 rounded-lg border bg-background p-3" required value={edit} maxLength={10000} onChange={event => setEdit(event.target.value)} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEdit(null)}>Annulla</Button><Button type="submit" disabled={busy || !edit.trim() || edit.trim() === selected.body.trim()}>Salva testo</Button></div></form>}</div> : null}</section>
        {galleryOpen ? <ScreenshotGallery autoOpen loading={imageLoading || !imageUrl} onClose={() => { setGalleryOpen(false); setImageUrl(''); }} src={imageUrl} aspectRatio={`${selected.context.viewport.width} / ${selected.context.viewport.height}`} /> : null}
        {selected.page_path === page.pagePath && !locate(selected.context.anchor) ? <p className="rounded-lg bg-muted p-3">Elemento non trovato o modificato. Consulta lo screenshot originale.</p> : null}
        <section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4" aria-label="Gestione segnalazione">
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="report-status">Stato</Label><select id="report-status" className="rounded-lg border bg-background p-2" disabled={busy} value={selected.status} onChange={event => void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'status', payload: { id: selected.id, status: event.target.value } }); setStatus('Stato aggiornato.', 'success'); const items = await refresh(); setSelected(items.find(item => item.id === selected.id) ?? null); })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div> : null}
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="selected-priority">Priorità</Label><select id="selected-priority" className="rounded-lg border bg-background p-2" disabled={busy} value={selected.priority ?? 'medium'} onChange={event => void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'priority', payload: { id: selected.id, priority: event.target.value } }); setStatus('Priorità aggiornata.', 'success'); const items = await refresh(); setSelected(items.find(item => item.id === selected.id) ?? null); })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div> : null}

        </section></section><section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4" aria-label="Risposte"><h3 className="font-medium">Risposte</h3>{threadLoading ? <RepliesSkeleton /> : null}{!threadLoading && comments.map(comment => <div key={comment.id} className="rounded-lg border bg-background p-3 dark:bg-muted"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">{comment.authorName}</p><time dateTime={comment.created_at} className="text-xs text-muted-foreground">{formatReportDateTime(comment.created_at)}</time></div><p className="whitespace-pre-wrap break-words">{comment.body}</p></div>)}
        <form className="grid gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'reply', payload: { id: selected.id, body: reply } }); setStatus('Risposta inviata.', 'success'); setReply(''); const result = await loadThread(selected.id); setComments(result.data.comments); }); }}><Label htmlFor="reply">Aggiungi una risposta</Label><textarea id="reply" className="rounded-lg border bg-background p-2" maxLength={10000} required value={reply} onChange={event => setReply(event.target.value)} /><Button type="submit" disabled={busy || !reply.trim()}>Rispondi</Button></form>
        </section><footer className="rounded-xl border bg-muted/50 dark:bg-card p-4 text-xs text-muted-foreground"><p>Segnalata da {selected.authorName}</p><p>Viewport originale: {selected.context.viewport.width} × {selected.context.viewport.height} · scroll {Math.round(selected.context.scroll.y)} px</p></footer>{selected.canEdit ? <section aria-label="Zona pericolosa" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="text-sm font-semibold text-destructive">Zona pericolosa</h3><div className="flex justify-end"><DeleteConfirm fullWidth disabled={busy} description="Eliminare questa segnalazione e tutte le sue risposte? Questa operazione è definitiva." onConfirm={() => run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'delete', payload: { id: selected.id } }); setStatus('Segnalazione eliminata.', 'success'); setSelected(null); await refresh(); })} /></div></section> : null}
      </div> : <div className="flex min-h-0 flex-1 flex-col gap-5">
  <input aria-label="Cerca segnalazioni" placeholder="Cerca commento o pagina…" className="h-10 w-full rounded-lg border bg-background px-3" value={search} onChange={event => setSearch(event.target.value)} />
  <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-3">
    <ReportFilter label="Stato" options={Object.entries(statusLabels).map(([value,label]) => ({value,label}))} selected={statuses} onChange={values => { setStatuses(values); setShowResolved(!values.length || values.includes('resolved')); }} />
    <ReportFilter label="Priorità" options={Object.entries(priorityLabels).map(([value,label]) => ({value,label}))} selected={priorities} onChange={setPriorities} />
    </div><div className="flex items-center gap-2"><span id="reporty-resolved-label" className="text-sm">Mostra risolte</span><button type="button" role="switch" aria-checked={showResolved} aria-labelledby="reporty-resolved-label" className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${showResolved ? 'bg-primary' : 'bg-input'}`} onClick={() => { const enabled = !showResolved; setShowResolved(enabled); setStatuses(items => enabled ? (items.length ? [...new Set([...items, 'resolved'])] : []) : (items.length ? items.filter(item => item !== 'resolved') : ['open', 'in_progress'])); }}><span aria-hidden="true" className={`size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${showResolved ? 'translate-x-5' : 'translate-x-0'}`} /></button></div>
  </div>
  {filters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri attivi">{filters.map(filter => <button key={filter.key} type="button" onClick={filter.remove} aria-label={`Rimuovi filtro ${filter.label}`} title={filter.label} className="inline-flex max-w-full items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className="truncate">{filter.label}</span><X className="size-3 shrink-0" aria-hidden="true" /></button>)}</div> : null}

  <section className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1" aria-label="Lista segnalazioni">
    {listLoading ? <ReportRowsSkeleton /> : null}
    {!listLoading && !filtered.length ? <p className="p-6 text-muted-foreground">Nessuna segnalazione trovata.</p> : null}
    {!listLoading && filtered.map(report => <button key={report.id} className="block w-full space-y-3 rounded-xl border bg-card p-4 text-left hover:bg-accent" onClick={() => void view(report)}>
      <div className="flex flex-wrap items-start justify-between gap-3"><p className="min-w-0 flex-1 line-clamp-3 break-words font-medium">{report.body}</p><div className="flex shrink-0 flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${statusColors[report.status]}`}>{statusLabels[report.status]}</span><span className={`rounded-full px-2 py-1 ${priorityColors[report.priority ?? 'medium']}`}>Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</span></div></div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"><div className="flex min-w-0 flex-wrap gap-2"><span>{report.authorName}</span><span className="break-all">· {report.page_path}</span></div><time dateTime={report.created_at} className="ml-auto shrink-0 text-right">{formatReportDateTime(report.created_at)}</time></div>
    </button>)}
  </section>
</div>}
      </div>
      <Button aria-label={modalOpen ? 'Chiudi segnalazioni' : 'Apri lista segnalazioni'} aria-expanded={modalOpen} className="pointer-events-auto fixed size-7 rounded-full p-0 shadow-xl" style={{ [top ? 'top' : 'bottom']: 36, [left ? 'left' : 'right']: 88 }} onClick={() => { if (modalOpen) { setModalOpen(false); } else { setOpen(false); setSelected(null); setModalOpen(true); void run(async () => { await refresh(); }); } }}>{modalOpen ? <X className="size-4" /> : <Menu className="size-4" />}</Button>
    </dialog>
  </>;
}
