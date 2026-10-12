'use client';
import { ReportPagination, useReportPagination, REPORT_PAGE_SIZE } from '@/components/report-pagination';
import { FilterPill } from '@/components/filter-pill';
import { ReportIcon } from '@/components/report-icon';
import { Textarea } from '@/components/ui/textarea';
import { RadioButtons } from '@/components/ui/radio-buttons';
import { DeleteConfirm } from '@/components/delete-confirm';

import { useToastManager } from '@/components/ui/toast';
import { RepliesSkeleton } from '@/components/page-skeletons';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import { useRef, useState, useOptimistic, useTransition } from 'react';
import { ReportKanban } from './report-kanban';
import { useRouter } from 'next/navigation';
import { matchesReportUsers, compareReports, formatReportDateTime, priorityLabels, type ProjectParticipant, type Report, type ReportComment } from '@reporty/shared';
import { getReportThread, mutateReport } from './report-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Eye, Pencil, ExternalLink, X, List, Columns3 } from 'lucide-react';
import { ReportFilter } from './report-filter';
import { Badge } from '@/components/ui/badge';

const statusColors = { open: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', in_progress: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200', validation: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200', resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' };
const priorityColors = { low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', medium: 'bg-amber-100 text-amber-800 dark:bg-orange-950 dark:text-orange-200', high: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' };
const labels = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
export function ReportList({ reports, environments, participants }: { participants: ProjectParticipant[]; reports: Report[]; environments: { id: string; name: string; origin: string }[] }) {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'kanban'>('kanban');
  const [moving, startMove] = useTransition();
  const moveLock = useRef(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [displayReports, updateOptimisticStatus] = useOptimistic(reports, (items, change: { id: string; status?: Report['status']; priority?: Report['priority'] }) => items.map(item => item.id === change.id ? { ...item, ...change } : item));
  const selectionVersion = useRef(0);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState<string[]>([]), [priority, setPriority] = useState<string[]>([]), [environment, setEnvironment] = useState<string[]>([]), [page, setPage] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const pages = [...new Set(reports.filter(report => !environment.length || environment.includes(report.environment_id)).map(report => report.page_path))].sort();
  const [selected, setSelected] = useState<Report | null>(null), [comments, setComments] = useState<ReportComment[]>([]);
  const [reply, setReply] = useState(''), [edited, setEdited] = useState(''), [image, setImage] = useState('');
  const toast = useToastManager();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const current = displayReports.find(report => report.id === selected?.id) ?? null;
  const filtered = displayReports.filter(report => matchesReportUsers(report, users) && (!page.length || page.includes(report.page_path)) && (!priority.length || priority.includes(report.priority ?? 'medium')) && (view === 'kanban' || !filter.length || filter.includes(report.status)) && (!environment.length || environment.includes(report.environment_id)) && `${report.body} ${report.page_path}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))).sort(compareReports);
  const pagination = useReportPagination(filtered.length, JSON.stringify([search, filter, priority, environment, page, users]));
  const paginated = filtered.slice(pagination.start, pagination.start + REPORT_PAGE_SIZE);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeFilters = [
    ...users.map(value => ({ key: `user-${value}`, label: `Utente: ${participants.find(person => person.key === value)?.name ?? value}`, remove: () => setUsers(items => items.filter(item => item !== value)) })),
    ...(view === 'list' ? filter : []).map(value => ({ key: `status-${value}`, label: `Stato: ${labels[value as keyof typeof labels]}`, remove: () => setFilter(values => values.filter(item => item !== value)) })),
    ...priority.map(value => ({ key: `priority-${value}`, label: `Priorità: ${priorityLabels[value as keyof typeof priorityLabels]}`, remove: () => setPriority(values => values.filter(item => item !== value)) })),
    ...environment.map(value => ({ key: `environment-${value}`, label: `Ambiente: ${environments.find(item => item.id === value)?.name ?? value}`, remove: () => { setEnvironment(values => values.filter(item => item !== value)); setPage([]); } })),
    ...page.map(value => ({ key: `page-${value}`, label: `Pagina: ${value}`, remove: () => setPage(values => values.filter(item => item !== value)) })),
    ...(search.trim() ? [{ key: 'search', label: `Ricerca: ${search}`, remove: () => setSearch('') }] : []),
  ];
  async function loadThread(environmentId: string, id: string) {
    setThreadLoading(true);
    try { return await getReportThread(environmentId, id); } finally { setThreadLoading(false); }
  }
  async function run(work: () => Promise<void>) { setBusy(true); try { await work(); } catch (error) { toast.add({ title: 'Operazione non riuscita', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); } finally { setBusy(false); } }
  async function mutate(operation: string, payload: { body?: string; status?: string; priority?: string }) {
    if (!current) return;
    const result = await mutateReport(current.environment_id, operation, { id: current.id, ...payload });
    if (result.error) throw new Error(result.error);
    toast.add({ title: operation === 'delete' ? 'Segnalazione eliminata' : operation === 'reply' ? 'Risposta aggiunta' : 'Modifiche salvate', type: 'success' });
    router.refresh();
  }
  function openReport(report: Report) {
    if (busy || moving) return;
    void run(async () => { const version = ++selectionVersion.current; setSelected(report); setEditing(false); setGalleryOpen(false); setEdited(report.body); setImage(''); setReply(''); setComments([]); const result = await loadThread(report.environment_id, report.id); if (result.error) throw new Error(result.error); if (version === selectionVersion.current) setComments(result.data.comments); });
  }
  function moveReport(report: Report, status: Report['status'], priority?: Report['priority']) {
    if (moveLock.current || busy || moving || !report.canChangeStatus || (priority ? report.priority === priority : report.status === status)) return;
    moveLock.current = true;
    setMovingId(report.id);
    startMove(async () => {
      updateOptimisticStatus({ id: report.id, ...(priority ? { priority } : { status }) });
      try {
        const result = await mutateReport(report.environment_id, priority ? 'priority' : 'status', { id: report.id, ...(priority ? { priority } : { status }) });
        if (result.error) throw new Error(result.error);
        toast.add({ title: priority ? `Priorità aggiornata: ${priorityLabels[priority]}` : `Segnalazione spostata in ${labels[status]}`, type: 'success' });
        router.refresh();
      } catch (error) { toast.add({ title: priority ? 'Aggiornamento priorità non riuscito' : 'Spostamento non riuscito', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); }
      finally { moveLock.current = false; setMovingId(null); }
    });
  }
  function pageUrl(report: Report) {
    try { const url = new URL(report.context.url); url.searchParams.set('__reporty_issue', report.id); return ['http:', 'https:'].includes(url.protocol) && url.origin === environments.find(item => item.id === report.environment_id)?.origin ? url.href : '#'; } catch { return '#'; }
  }
  return <section className="space-y-5" aria-labelledby="reports-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="reports-title" className="text-xl font-semibold">Segnalazioni ({reports.length})</h2><div role="group" aria-label="Modalità di visualizzazione" className="inline-flex gap-1 rounded-lg border bg-background p-1"><Button variant={view === 'list' ? 'default' : 'ghost'} aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="size-4" />Lista</Button><Button variant={view === 'kanban' ? 'default' : 'ghost'} aria-pressed={view === 'kanban'} onClick={() => setView('kanban')}><Columns3 className="size-4" />Kanban</Button></div></div>
    <div><Input aria-label="Cerca segnalazioni" className="w-full" placeholder="Cerca commento o pagina…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">{view === 'list' ? <ReportFilter label="Stato" options={Object.entries(labels).map(([value, label]) => ({ value, label }))} selected={filter} onChange={setFilter} /> : null}<ReportFilter label="Priorità" options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} selected={priority} onChange={setPriority} /><ReportFilter label="Ambienti" options={environments.map(item => ({ value: item.id, label: item.name }))} selected={environment} onChange={values => { setEnvironment(values); setPage([]); }} /><ReportFilter label="Pagine" options={pages.map(path => ({ value: path, label: path }))} selected={page} onChange={setPage} /><ReportFilter label="Utente" options={participants.map(person => ({ value: person.key, label: `${person.name} · ${person.kind === 'guest' ? 'Guest' : 'Sviluppatore'}` }))} selected={users} onChange={setUsers} /></div>
    {activeFilters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri attivi">{activeFilters.map(item => <FilterPill key={item.key} label={item.label} onRemove={item.remove}><ReportIcon value={item.key.replace(/^(status|priority)-/, "")} /></FilterPill>)}</div> : null}

    <div className="space-y-5">{view === 'kanban' ? <ReportKanban key={JSON.stringify([search, priority, environment, page, users])} reports={filtered} environments={environments} busy={busy || moving} movingId={movingId} onOpen={openReport} onMove={moveReport} onPriorityChange={(report, priority) => moveReport(report, report.status, priority)} /> : <><div ref={listRef} className="space-y-3">
      {!filtered.length ? <p className="py-8 text-sm text-muted-foreground">Nessuna segnalazione trovata.</p> : null}
      {paginated.map(report => <button key={report.id} className="block w-full space-y-3 rounded-xl border bg-card p-4 text-left transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none" disabled={busy} onClick={() => openReport(report)}><div className="flex flex-wrap items-start justify-between gap-3"><p className="min-w-0 flex-1 line-clamp-3 break-words font-medium">{report.body}</p><div className="flex shrink-0 flex-wrap gap-2"><Badge className={`border-[color-mix(in_oklab,currentColor_25%,transparent)] ${statusColors[report.status]}`}><ReportIcon value={report.status} />{labels[report.status]}</Badge><Badge className={`border-[color-mix(in_oklab,currentColor_25%,transparent)] ${priorityColors[report.priority ?? 'medium']}`} ><ReportIcon value={report.priority ?? 'medium'} />Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</Badge></div></div><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"><div className="flex flex-wrap gap-2"><span>{report.authorName}</span><span className="break-all">· {environments.find(item => item.id === report.environment_id)?.name} · {report.page_path}</span></div><time dateTime={report.created_at} className="ml-auto shrink-0 text-right">{formatReportDateTime(report.created_at)}</time></div></button>)}
    </div>
    <ReportPagination total={filtered.length} page={pagination.page} pages={pagination.pages} onChange={next => { pagination.setPage(next); listRef.current?.scrollIntoView({ block: 'start' }); }} /></>}
    <Dialog showClose={false} open={Boolean(current)} onOpenChange={open => { if (!open) { selectionVersion.current++; setSelected(null); setImage(''); } }}>{current ? <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><DialogTitle className="text-xl font-semibold">Dettaglio segnalazione</DialogTitle><div className="ml-auto flex items-center gap-2"><DialogClose render={<Button variant="outline" size="icon" aria-label="Chiudi dettaglio" />}><X className="size-4" aria-hidden="true" /></DialogClose></div></header><DialogDescription className="sr-only">Dati e gestione della segnalazione</DialogDescription>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><Badge className={`border-[color-mix(in_oklab,currentColor_25%,transparent)] ${statusColors[current.status]}`}><ReportIcon value={current.status} />{labels[current.status]}</Badge><Badge className={`border-[color-mix(in_oklab,currentColor_25%,transparent)] ${priorityColors[current.priority ?? 'medium']}`} ><ReportIcon value={current.priority ?? 'medium'} />Priorità {priorityLabels[current.priority ?? 'medium'].toLowerCase()}</Badge></div><div className="flex flex-wrap gap-2">{current.screenshot_path ? <Button variant="outline" disabled={busy || imageLoading} onClick={() => { setImage(''); setGalleryOpen(true); setImageLoading(true); void run(async () => { try { const version = selectionVersion.current; const response = await fetch(`/api/reports/${current.id}/screenshot`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Screenshot non disponibile.'); if (version === selectionVersion.current) setImage(data.url); } catch (error) { setGalleryOpen(false); throw error; } }).finally(() => setImageLoading(false)); }}><Eye className="size-4" />Mostra screenshot</Button> : null}<Button variant="outline" nativeButton={false} render={<a href={pageUrl(current)} target="_blank" rel="noopener noreferrer" />}><ExternalLink className="size-4" aria-hidden="true" />Apri pagina originale</Button></div></div>
      <section aria-labelledby="report-description-title" className="space-y-3 rounded-xl border bg-muted/50 dark:bg-card p-4"><h3 id="report-description-title" className="text-sm font-semibold">Descrizione</h3>{editing ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (busy || !edited.trim() || edited.trim() === current.body.trim()) return; void run(async () => { await mutate('edit', {body:edited}); setEditing(false); }); }}><Textarea aria-label="Modifica descrizione" className="min-h-28 rounded-lg border bg-background p-3" value={edited} onChange={event => setEdited(event.target.value)} required maxLength={10000} /><div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={() => setEditing(false)}>Annulla</Button><Button disabled={busy || !edited.trim() || edited.trim() === current.body.trim()} type="submit">Salva testo</Button></div></form> : <><p className="whitespace-pre-wrap break-words leading-relaxed">{current.body}</p>{current.canEdit ? <div className="flex justify-end"><Button size="icon" variant="outline" aria-label="Modifica testo" onClick={() => { setEdited(current.body); setEditing(true); }}><Pencil className="size-4" /></Button></div> : null}</>}</section>
      {galleryOpen ? <ScreenshotGallery autoOpen loading={imageLoading || !image} onClose={() => { setGalleryOpen(false); setImage(''); }} src={image} aspectRatio={`${current.context.viewport.width} / ${current.context.viewport.height}`} /> : null}
      <section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4"><div className="grid gap-2"><Label htmlFor="dashboard-status">Stato</Label><RadioButtons label="Stato" id="dashboard-status" disabled={busy || moving || !current.canChangeStatus} value={current.status} onValueChange={value => moveReport(current, value as Report['status'])} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} /></div>
      <div className="grid gap-2"><Label htmlFor="dashboard-priority">Priorità</Label><RadioButtons label="Priorità" id="dashboard-priority" disabled={busy || moving || !current.canChangeStatus} value={current.priority ?? 'medium'} onValueChange={value => moveReport(current, current.status, value as Report['priority'])} options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} /></div>
      </section><section className="space-y-4 rounded-xl border bg-muted/50 dark:bg-card p-4">
      <h3 className="font-medium">Risposte</h3>{threadLoading ? <RepliesSkeleton /> : null}{!threadLoading && comments.map(comment => <div key={comment.id} className="rounded-lg border bg-background p-3 dark:bg-muted"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">{comment.authorName}</p><time dateTime={comment.created_at} className="text-xs text-muted-foreground">{formatReportDateTime(comment.created_at)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p></div>)}
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { const version = selectionVersion.current; await mutate('reply', { body: reply }); if (version === selectionVersion.current) setReply(''); const result = await loadThread(current.environment_id, current.id); if (result.error) throw new Error(result.error); if (version === selectionVersion.current) setComments(result.data.comments); }); }}><Label htmlFor="dashboard-reply">Rispondi</Label><Textarea id="dashboard-reply" className="rounded-lg border p-3" maxLength={10000} required value={reply} onChange={event => setReply(event.target.value)} /><Button type="submit" disabled={busy || !reply.trim()}>Aggiungi risposta</Button></form>
      </section><footer className="space-y-1 rounded-xl border bg-muted/50 dark:bg-card p-4 text-xs text-muted-foreground"><p>Segnalata da {current.authorName} · {formatReportDateTime(current.created_at)}</p><p>{current.updated_at ? <>Ultima modifica: {current.updatedByName ?? 'Utente'} · {formatReportDateTime(current.updated_at)}</> : 'Nessuna modifica registrata'}</p><p>Viewport originale: {current.context.viewport.width} × {current.context.viewport.height} · scroll {Math.round(current.context.scroll.y)} px</p></footer>{current.canEdit ? <section aria-label="Zona pericolosa" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="text-sm font-semibold text-destructive">Zona pericolosa</h3><div className="flex justify-end"><DeleteConfirm fullWidth disabled={busy} description="Eliminare questa segnalazione e tutte le sue risposte? Questa operazione è definitiva." onConfirm={() => run(async () => { await mutate('delete', {}); setSelected(null); })} /></div></section> : null}</div> : null}</Dialog>
    </div>
  </section>;
}
