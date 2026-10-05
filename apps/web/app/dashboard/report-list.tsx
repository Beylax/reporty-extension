'use client';

import { useToastManager } from '@/components/ui/toast';
import { RepliesSkeleton, ScreenshotSkeleton } from '@/components/page-skeletons';
import { LoadingImage } from '@/components/loading-image';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatReportDateTime, priorityLabels, type Report, type ReportComment } from '@reporty/shared';
import { getReportThread, mutateReport } from './report-actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Eye, EyeOff, ExternalLink, X } from 'lucide-react';
import { ReportFilter } from './report-filter';
import { Badge } from '@/components/ui/badge';

const statusColors = { open: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200', in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' };
const priorityColors = { low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', high: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' };
const labels = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' };
export function ReportList({ reports, environments }: { reports: Report[]; environments: { id: string; name: string; origin: string }[] }) {
  const router = useRouter();
  const selectionVersion = useRef(0);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState<string[]>(['open', 'in_progress']), [priority, setPriority] = useState<string[]>([]), [environment, setEnvironment] = useState<string[]>([]), [page, setPage] = useState<string[]>([]);
  const pages = [...new Set(reports.filter(report => !environment.length || environment.includes(report.environment_id)).map(report => report.page_path))].sort();
  const [selected, setSelected] = useState<Report | null>(null), [comments, setComments] = useState<ReportComment[]>([]);
  const [reply, setReply] = useState(''), [edited, setEdited] = useState(''), [image, setImage] = useState('');
  const toast = useToastManager();
  const [busy, setBusy] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const current = reports.find(report => report.id === selected?.id) ?? null;
  const filtered = reports.filter(report => (!page.length || page.includes(report.page_path)) && (!priority.length || priority.includes(report.priority ?? 'medium')) && (!filter.length || filter.includes(report.status)) && (!environment.length || environment.includes(report.environment_id)) && `${report.body} ${report.page_path}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority ?? 'medium'] - { high: 0, medium: 1, low: 2 }[b.priority ?? 'medium']));
  const activeFilters = [
    ...filter.map(value => ({ key: `status-${value}`, label: `Stato: ${labels[value as keyof typeof labels]}`, remove: () => setFilter(values => values.filter(item => item !== value)) })),
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
  function pageUrl(report: Report) {
    try { const url = new URL(report.context.url); return ['http:', 'https:'].includes(url.protocol) && url.origin === environments.find(item => item.id === report.environment_id)?.origin ? url.href : '#'; } catch { return '#'; }
  }
  return <section className="space-y-5" aria-labelledby="reports-title">
    <h2 id="reports-title" className="text-xl font-semibold">Segnalazioni ({reports.length})</h2>
    <div><Input aria-label="Cerca segnalazioni" className="max-w-sm" placeholder="Cerca commento o pagina…" value={search} onChange={event => setSearch(event.target.value)} /></div>
    <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1"><ReportFilter label="Stato" options={Object.entries(labels).map(([value, label]) => ({ value, label }))} selected={filter} onChange={setFilter} /><ReportFilter label="Priorità" options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} selected={priority} onChange={setPriority} /><ReportFilter label="Ambienti" options={environments.map(item => ({ value: item.id, label: item.name }))} selected={environment} onChange={values => { setEnvironment(values); setPage([]); }} /><ReportFilter label="Pagine" options={pages.map(path => ({ value: path, label: path }))} selected={page} onChange={setPage} /></div>
    {activeFilters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri attivi">{activeFilters.map(item => <button key={item.key} type="button" onClick={item.remove} aria-label={`Rimuovi filtro ${item.label}`} title={item.label} className="inline-flex max-w-full items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs text-secondary-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><span className="truncate">{item.label}</span><X className="size-3 shrink-0" aria-hidden="true" /></button>)}</div> : null}

    <div className="space-y-5"><Card><CardContent className="divide-y">
      {!filtered.length ? <p className="py-8 text-sm text-muted-foreground">Nessuna segnalazione trovata.</p> : null}
      {filtered.map(report => <button key={report.id} className="block w-full space-y-2 rounded-lg p-4 text-left hover:bg-accent" disabled={busy} onClick={() => void run(async () => { const version = ++selectionVersion.current; setSelected(report); setEdited(report.body); setImage(''); setReply(''); setComments([]); const result = await loadThread(report.environment_id, report.id); if (result.error) throw new Error(result.error); if (version === selectionVersion.current) setComments(result.data.comments); })}><p className="line-clamp-3 break-words">{report.body}</p><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{report.authorName}</span><time dateTime={report.created_at}>{formatReportDateTime(report.created_at)}</time></div><div className="flex flex-wrap gap-2"><Badge className={statusColors[report.status]}>{labels[report.status]}</Badge><Badge className={priorityColors[report.priority ?? 'medium']}>Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</Badge><span className="break-all text-xs text-muted-foreground">{environments.find(item => item.id === report.environment_id)?.name} · {report.page_path}</span></div></button>)}
    </CardContent></Card>
    <Dialog showClose={false} open={Boolean(current)} onOpenChange={open => { if (!open) { selectionVersion.current++; setSelected(null); setImage(''); } }}>{current ? <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><DialogTitle className="text-xl font-semibold">Dettaglio segnalazione</DialogTitle><div className="ml-auto flex items-center gap-2"><a href={pageUrl(current)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'sm' })}><ExternalLink className="size-4" aria-hidden="true" />Apri pagina originale</a><DialogClose render={<Button variant="ghost" size="icon" aria-label="Chiudi dettaglio" />}><X className="size-4" aria-hidden="true" /></DialogClose></div></header><DialogDescription className="break-all text-sm text-muted-foreground">{environments.find(item => item.id === current.environment_id)?.name} · {current.page_path}</DialogDescription>
      <section aria-labelledby="report-description-title" className="space-y-3 rounded-xl border bg-muted/40 p-4"><h3 id="report-description-title" className="text-sm font-semibold">Descrizione</h3><p className="whitespace-pre-wrap break-words leading-relaxed">{current.body}</p></section>
      {current.screenshot_path ? <Button variant="outline" disabled={busy} aria-expanded={Boolean(image)} aria-controls="report-screenshot" onClick={() => { if (image) { setImage(''); return; } setImageLoading(true); void run(async () => { const version = selectionVersion.current; const response = await fetch(`/api/reports/${current.id}/screenshot`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Screenshot non disponibile.'); if (version === selectionVersion.current) setImage(data.url); }).finally(() => setImageLoading(false)); }}>{image ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}{image ? 'Nascondi screenshot' : 'Mostra screenshot'}</Button> : null}
      {/* Signed private images are intentionally loaded without Next image caching. */}
      <div id="report-screenshot" hidden={!image && !imageLoading}>{imageLoading ? <ScreenshotSkeleton aspectRatio={`${current.context.viewport.width} / ${current.context.viewport.height}`} /> : null}{image ? <LoadingImage key={image} src={image} alt="Screenshot originale" aspectRatio={`${current.context.viewport.width} / ${current.context.viewport.height}`} /> : null}</div>
      <div className="space-y-4 border-t pt-5"><h3 className="font-semibold">Gestione della segnalazione</h3><div className="grid gap-2"><Label htmlFor="dashboard-status">Stato</Label><select id="dashboard-status" className="rounded-lg border bg-background p-2 text-sm" disabled={busy || !current.canChangeStatus} value={current.status} onChange={event => void run(async () => { await mutate('status', { status: event.target.value }); })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="grid gap-2"><Label htmlFor="dashboard-priority">Priorità</Label><select id="dashboard-priority" className="rounded-lg border bg-background p-2 text-sm" disabled={busy || !current.canChangeStatus} value={current.priority ?? 'medium'} onChange={event => void run(async () => { await mutate('priority', { priority: event.target.value }); })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {current.canEdit ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { await mutate('edit', { body: edited }); }); }}><Label htmlFor="edit-report">Modifica commento</Label><textarea id="edit-report" className="min-h-24 rounded-lg border p-3" value={edited} maxLength={10000} required onChange={event => setEdited(event.target.value)} /><Button type="submit" disabled={busy}>Salva testo</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => { if (confirm('Eliminare questa segnalazione e le sue risposte?')) void run(async () => { await mutate('delete', {}); setSelected(null); }); }}>Elimina segnalazione</Button></form> : null}
      <h3 className="font-medium">Risposte</h3>{threadLoading ? <RepliesSkeleton /> : null}{!threadLoading && comments.map(comment => <div key={comment.id} className="rounded-lg bg-muted p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">{comment.authorName}</p><time dateTime={comment.created_at} className="text-xs text-muted-foreground">{formatReportDateTime(comment.created_at)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p></div>)}
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { const version = selectionVersion.current; await mutate('reply', { body: reply }); if (version === selectionVersion.current) setReply(''); const result = await loadThread(current.environment_id, current.id); if (result.error) throw new Error(result.error); if (version === selectionVersion.current) setComments(result.data.comments); }); }}><Label htmlFor="dashboard-reply">Rispondi</Label><textarea id="dashboard-reply" className="rounded-lg border p-3" maxLength={10000} required value={reply} onChange={event => setReply(event.target.value)} /><Button type="submit" disabled={busy || !reply.trim()}>Aggiungi risposta</Button></form>
      </div><footer className="space-y-1 border-t pt-4 text-xs text-muted-foreground"><p>Segnalata da {current.authorName} · {formatReportDateTime(current.created_at)}</p><p>Viewport originale: {current.context.viewport.width} × {current.context.viewport.height} · scroll {Math.round(current.context.scroll.y)} px</p></footer></div> : null}</Dialog>
    </div>
  </section>;
}
