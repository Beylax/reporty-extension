'use client';
import { ReportPagination, useReportPagination, REPORT_PAGE_SIZE } from '@/components/report-pagination';
import { FilterPill } from '@/components/filter-pill';
import { ReportOrder } from '@/components/report-order';
import { ReportIcon } from '@/components/report-icon';
import { Textarea } from '@/components/ui/textarea';
import { RadioButtons } from '@/components/ui/radio-buttons';
import { DeleteConfirm } from '@/components/delete-confirm';

import { useToastManager } from '@/components/ui/toast';
import { RepliesSkeleton } from '@/components/page-skeletons';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import { useEffect, useEffectEvent, useRef, useState, useOptimistic, useTransition } from 'react';
import { ReportKanban } from './report-kanban';
import { useRouter } from 'next/navigation';
import { matchesReportUsers, compareReportsBy, type ReportSort, formatReportDateTime, priorityLabels, type BulkReportRequest, type ProjectParticipant, type Report, type ReportComment } from '@reporty/shared';
import { NOTIFICATIONS_CHANGED } from '@/lib/notification-polling';
import { getReportThread, mutateReport, mutateReportsBulk } from './report-actions';
import { ReportBulkToolbar } from './report-bulk-toolbar';
import { Checkbox } from '@/components/ui/checkbox';
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
export function ReportList({ reports, environments, participants, initialReportId }: { initialReportId?: string; participants: ProjectParticipant[]; reports: Report[]; environments: { id: string; name: string; origin: string }[] }) {
  const router = useRouter();
  const [bulkSelection, setBulkSelection] = useState<{ scope: string; ids: string[] }>({ scope: '', ids: [] });
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number; operation: BulkReportRequest['operation'] } | null>(null);
  const bulkLock = useRef(false);
  const [listOrder, setListOrder] = useState<ReportSort>({ field: 'status', direction: 'asc' });
  const [kanbanOrder, setKanbanOrder] = useState<ReportSort>({ field: 'priority', direction: 'asc' });
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
  const order = view === 'kanban' ? kanbanOrder : listOrder;
  const filtered = displayReports.filter(report => matchesReportUsers(report, users) && (!page.length || page.includes(report.page_path)) && (!priority.length || priority.includes(report.priority ?? 'medium')) && (view === 'kanban' || !filter.length || filter.includes(report.status)) && (!environment.length || environment.includes(report.environment_id)) && `${report.body} ${report.page_path}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))).sort((a, b) => compareReportsBy(a, b, order));
  const pagination = useReportPagination(filtered.length, JSON.stringify([search, filter, priority, environment, page, users, order]));
  const bulkScope = JSON.stringify([view,search,filter,priority,environment,page,users]);
  if (bulkSelection.scope !== bulkScope) setBulkSelection({ scope: bulkScope, ids: [] });
  const selectedIds = new Set(bulkSelection.scope === bulkScope ? bulkSelection.ids : []);
  const selectedReports = filtered.filter(report => selectedIds.has(report.id));
  const bulkDisabled = busy || moving || Boolean(bulkProgress);
  function selectReport(id: string, checked: boolean) {
    setBulkSelection(previous => ({ scope: bulkScope, ids: checked ? [...new Set([...previous.ids,id])] : previous.ids.filter(item => item !== id) }));
  }
  async function applyBulk(operation: BulkReportRequest['operation'], value?: Report['status'] | Report['priority']) {
    if (view !== 'list' || bulkLock.current || bulkDisabled || !selectedReports.length) return;
    const targets = selectedReports.map(report => ({ id: report.id, environmentId: report.environment_id }));
    const succeeded = new Set<string>();
    let storageWarnings = 0;
    bulkLock.current = true;
    setBulkProgress({ completed: 0, total: targets.length, operation });
    try {
      for (let start = 0; start < targets.length; start += 25) {
        const batch = targets.slice(start,start + 25);
        const result = await mutateReportsBulk({ operation, ...(operation !== 'delete' ? { value } : {}), targets: batch });
        if (result.error || !result.data) throw new Error(result.error ?? 'Risultato non disponibile.');
        result.data.succeeded.forEach(id => succeeded.add(id));
        storageWarnings += result.data.storageWarnings.length;
        setBulkProgress({ completed: Math.min(start + batch.length, targets.length), total: targets.length, operation });
      }
      if (succeeded.size) toast.add({ title: `${succeeded.size} segnalazioni ${operation === 'delete' ? 'eliminate' : 'aggiornate'}`, type: 'success' });
      const failures = targets.length - succeeded.size;
      if (failures) toast.add({ title: 'Azione completata solo in parte', description: `${failures} segnalazioni non aggiornate. Restano selezionate per riprovare.`, type: 'error' });
    } catch (error) {
      toast.add({ title: 'Azione in blocco interrotta', description: `${succeeded.size} operazioni confermate su ${targets.length}. ${error instanceof Error ? error.message : 'Riprova.'} Verifica la lista prima di riprovare le altre.`, type: 'error' });
    } finally {
      setBulkSelection(previous => ({ ...previous, ids: previous.ids.filter(id => !succeeded.has(id)) }));
      if (storageWarnings) toast.add({ title: 'Pulizia screenshot incompleta', description: `${storageWarnings} segnalazioni eliminate, ma alcuni screenshot non sono stati rimossi.`, type: 'error' });
      if (operation === 'status' || operation === 'delete') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      router.refresh();
      bulkLock.current = false;
      setBulkProgress(null);
    }
  }
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
    if (operation === 'status' || operation === 'reply') window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    router.refresh();
  }
  function openReport(report: Report) {
    if (busy || moving || bulkLock.current) return;
    void run(async () => { const version = ++selectionVersion.current; setSelected(report); setEditing(false); setGalleryOpen(false); setEdited(report.body); setImage(''); setReply(''); setComments([]); const result = await loadThread(report.environment_id, report.id); if (result.error) throw new Error(result.error); if (version === selectionVersion.current) setComments(result.data.comments); });
  }
  const openedLink = useRef<string | undefined>(undefined);
  const openLinkedReport = useEffectEvent(() => {
    if (!initialReportId || openedLink.current === initialReportId) return;
    openedLink.current = initialReportId;
    const report = reports.find(item => item.id === initialReportId);
    if (report) openReport(report);
    else toast.add({ title: 'Segnalazione non disponibile', type: 'error' });
  });
  useEffect(() => { openLinkedReport(); }, [initialReportId, reports]);
  function moveReport(report: Report, status: Report['status'], priority?: Report['priority']) {
    if (moveLock.current || busy || moving || bulkLock.current || !report.canChangeStatus || (priority ? report.priority === priority : report.status === status)) return;
    moveLock.current = true;
    setMovingId(report.id);
    startMove(async () => {
      updateOptimisticStatus({ id: report.id, ...(priority ? { priority } : { status }) });
      try {
        const result = await mutateReport(report.environment_id, priority ? 'priority' : 'status', { id: report.id, ...(priority ? { priority } : { status }) });
        if (result.error) throw new Error(result.error);
        toast.add({ title: priority ? `Priorità aggiornata: ${priorityLabels[priority]}` : `Segnalazione spostata in ${labels[status]}`, type: 'success' });
        if (!priority) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
        router.refresh();
      } catch (error) { toast.add({ title: priority ? 'Aggiornamento priorità non riuscito' : 'Spostamento non riuscito', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); }
      finally { moveLock.current = false; setMovingId(null); }
    });
  }
  function pageUrl(report: Report) {
    try { const url = new URL(report.context.url); url.searchParams.set('__reporty_issue', report.id); return ['http:', 'https:'].includes(url.protocol) && url.origin === environments.find(item => item.id === report.environment_id)?.origin ? url.href : '#'; } catch { return '#'; }
  }
  return <section className="space-y-5" aria-labelledby="reports-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="reports-title" className="text-xl font-semibold">Segnalazioni ({reports.length})</h2><div role="group" aria-label="Modalità di visualizzazione" className="inline-flex gap-1 rounded-lg border bg-background p-1"><Button variant={view === 'list' ? 'default' : 'ghost'} aria-pressed={view === 'list'} disabled={bulkDisabled} onClick={() => setView('list')}><List className="size-4" />Lista</Button><Button variant={view === 'kanban' ? 'default' : 'ghost'} aria-pressed={view === 'kanban'} disabled={bulkDisabled} onClick={() => setView('kanban')}><Columns3 className="size-4" />Kanban</Button></div></div>
    <div><Input disabled={Boolean(bulkProgress)} aria-label="Cerca segnalazioni" className="w-full" placeholder="Cerca commento o pagina…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    <fieldset disabled={Boolean(bulkProgress)} className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">{view === 'list' ? <ReportFilter label="Stato" options={Object.entries(labels).map(([value, label]) => ({ value, label }))} selected={filter} onChange={setFilter} /> : null}<ReportFilter label="Priorità" options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} selected={priority} onChange={setPriority} /><ReportFilter label="Ambienti" options={environments.map(item => ({ value: item.id, label: item.name }))} selected={environment} onChange={values => { setEnvironment(values); setPage([]); }} /><ReportFilter label="Pagine" options={pages.map(path => ({ value: path, label: path }))} selected={page} onChange={setPage} /><ReportFilter label="Utente" options={participants.map(person => ({ value: person.key, label: `${person.name} · ${person.kind === 'guest' ? 'Guest' : 'Sviluppatore'}` }))} selected={users} onChange={setUsers} /><ReportOrder value={order} onChange={view === 'kanban' ? setKanbanOrder : setListOrder} kanban={view === 'kanban'} /></fieldset>
    {activeFilters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri attivi">{activeFilters.map(item => <FilterPill key={item.key} label={item.label} onRemove={() => { if (!bulkProgress) item.remove(); }}><ReportIcon value={item.key.replace(/^(status|priority)-/, "")} /></FilterPill>)}</div> : null}

    <div className="space-y-5">{view === 'kanban' ? <ReportKanban key={JSON.stringify([search, priority, environment, page, users, order])} reports={filtered} environments={environments} busy={busy || moving} movingId={movingId} onOpen={openReport} onMove={moveReport} onPriorityChange={(report, priority) => moveReport(report, report.status, priority)} /> : <><ReportBulkToolbar count={bulkProgress?.total ?? selectedReports.length} total={filtered.length} allSelected={filtered.length > 0 && selectedReports.length === filtered.length} disabled={bulkDisabled} pending={bulkProgress} canUpdate={selectedReports.every(report => report.canChangeStatus)} canDelete={selectedReports.every(report => report.canEdit)} onSelectAll={checked => setBulkSelection({ scope: bulkScope, ids: checked ? filtered.map(report => report.id) : [] })} onApply={applyBulk} /><div ref={listRef} role="region" aria-label="Tabella segnalazioni, scorrimento orizzontale" tabIndex={0} className="overflow-x-auto rounded-xl border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <table className="w-full min-w-[1040px] text-sm">
        <caption className="sr-only">Segnalazioni del progetto. Apri una segnalazione dalla descrizione oppure selezionala per le azioni in blocco.</caption>
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">Selezione</span></th>
            <th scope="col" className="px-4 py-3 font-medium">Segnalazione</th>
            <th scope="col" className="px-4 py-3 font-medium">Stato</th>
            <th scope="col" className="px-4 py-3 font-medium">Priorità</th>
            <th scope="col" className="px-4 py-3 font-medium">Ambiente / Pagina</th>
            <th scope="col" className="px-4 py-3 font-medium">Autore</th>
            <th scope="col" className="px-4 py-3 font-medium">Creata il</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {!filtered.length ? <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nessuna segnalazione trovata.</td></tr> : null}
          {paginated.map(report => <tr key={report.id} className={`align-top transition-colors hover:bg-primary/5 motion-reduce:transition-none ${selectedIds.has(report.id) ? 'bg-primary/5' : ''}`}>
            <td className="px-4 py-4"><Checkbox aria-label={`Seleziona segnalazione: ${report.body.slice(0,100)}`} checked={selectedIds.has(report.id)} disabled={bulkDisabled} onCheckedChange={checked => selectReport(report.id,Boolean(checked))} /></td>
            <td className="min-w-64 max-w-md px-4 py-4"><button type="button" disabled={bulkDisabled} onClick={() => openReport(report)} className="block w-full rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="line-clamp-3 break-words">{report.body}</span></button></td>
            <td className="px-4 py-4"><Badge className={`whitespace-nowrap border-[color-mix(in_oklab,currentColor_25%,transparent)] ${statusColors[report.status]}`}><ReportIcon value={report.status} />{labels[report.status]}</Badge></td>
            <td className="px-4 py-4"><Badge className={`whitespace-nowrap border-[color-mix(in_oklab,currentColor_25%,transparent)] ${priorityColors[report.priority ?? 'medium']}`}><ReportIcon value={report.priority ?? 'medium'} />{priorityLabels[report.priority ?? 'medium']}</Badge></td>
            <td className="max-w-60 px-4 py-4"><p className="font-medium">{environments.find(item => item.id === report.environment_id)?.name}</p><p className="mt-1 line-clamp-2 break-all text-xs text-muted-foreground" title={report.page_path}>{report.page_path}</p></td>
            <td className="max-w-48 px-4 py-4"><span className="block truncate text-muted-foreground" title={report.authorName}>{report.authorName}</span></td>
            <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground"><time dateTime={report.created_at}>{formatReportDateTime(report.created_at)}</time></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <ReportPagination total={filtered.length} page={pagination.page} pages={pagination.pages} onChange={next => { pagination.setPage(next); listRef.current?.scrollIntoView({ block: 'start' }); }} /></>}
    <Dialog showClose={false} open={Boolean(current)} onOpenChange={open => { if (!open) { selectionVersion.current++; setSelected(null); setImage(''); if (initialReportId) { const url = new URL(window.location.href); url.searchParams.delete('report'); router.replace(url.pathname + url.search, { scroll: false }); } } }}>{current ? <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><DialogTitle className="text-xl font-semibold">Dettaglio segnalazione</DialogTitle><div className="ml-auto flex items-center gap-2"><DialogClose render={<Button variant="outline" size="icon" aria-label="Chiudi dettaglio" />}><X className="size-4" aria-hidden="true" /></DialogClose></div></header><DialogDescription className="sr-only">Dati e gestione della segnalazione</DialogDescription>
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
