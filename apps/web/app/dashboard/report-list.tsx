'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Report, ReportComment } from '@reporty/shared';
import { getReportThread, mutateReport } from './report-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const labels = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' };
export function ReportList({ reports, environments }: { reports: Report[]; environments: { id: string; name: string; origin: string }[] }) {
  const router = useRouter();
  const [search, setSearch] = useState(''), [filter, setFilter] = useState(''), [environment, setEnvironment] = useState('');
  const [selected, setSelected] = useState<Report | null>(null), [comments, setComments] = useState<ReportComment[]>([]);
  const [reply, setReply] = useState(''), [edited, setEdited] = useState(''), [image, setImage] = useState('');
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
  const current = reports.find(report => report.id === selected?.id) ?? null;
  const filtered = reports.filter(report => (!filter || report.status === filter) && (!environment || report.environment_id === environment) && `${report.body} ${report.page_path}`.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it')));
  async function run(work: () => Promise<void>) { setBusy(true); setStatus(''); try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'); } finally { setBusy(false); } }
  async function mutate(operation: string, payload: { body?: string; status?: string }) {
    if (!current) return;
    const result = await mutateReport(current.environment_id, operation, { id: current.id, ...payload });
    if (result.error) throw new Error(result.error);
    router.refresh();
  }
  function pageUrl(report: Report) {
    try { const url = new URL(report.context.url); return ['http:', 'https:'].includes(url.protocol) && url.origin === environments.find(item => item.id === report.environment_id)?.origin ? url.href : '#'; } catch { return '#'; }
  }
  return <section className="space-y-5" aria-labelledby="reports-title">
    <h2 id="reports-title" className="text-xl font-semibold">Segnalazioni ({reports.length})</h2>
    <div className="flex flex-wrap gap-3"><Input aria-label="Cerca segnalazioni" className="max-w-sm" placeholder="Cerca commento o pagina…" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filtra stato" className="rounded-lg border bg-background p-2 text-sm" value={filter} onChange={event => setFilter(event.target.value)}><option value="">Tutti gli stati</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Filtra ambiente" className="rounded-lg border bg-background p-2 text-sm" value={environment} onChange={event => setEnvironment(event.target.value)}><option value="">Tutti gli ambienti</option>{environments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
    <p role="status" className="text-sm text-muted-foreground">{busy ? 'Operazione in corso…' : status}</p>
    <div className="grid gap-5 lg:grid-cols-2"><Card><CardContent className="divide-y">
      {!filtered.length ? <p className="py-8 text-sm text-muted-foreground">Nessuna segnalazione trovata.</p> : null}
      {filtered.map(report => <button key={report.id} className="block w-full space-y-2 rounded-lg p-4 text-left hover:bg-accent" disabled={busy} onClick={() => void run(async () => { setSelected(report); setEdited(report.body); setImage(''); setReply(''); setComments([]); const result = await getReportThread(report.environment_id, report.id); if (result.error) throw new Error(result.error); setComments(result.data.comments); })}><p className="line-clamp-3 break-words">{report.body}</p><div className="flex flex-wrap gap-2"><Badge variant="secondary">{labels[report.status]}</Badge><span className="break-all text-xs text-muted-foreground">{environments.find(item => item.id === report.environment_id)?.name} · {report.page_path}</span></div></button>)}
    </CardContent></Card>
    {current ? <Card><CardHeader><CardTitle>Dettaglio segnalazione</CardTitle></CardHeader><CardContent className="space-y-5">
      <p className="whitespace-pre-wrap break-words">{current.body}</p><p className="text-sm text-muted-foreground">{current.authorName}</p><p className="text-xs text-muted-foreground">Viewport originale: {current.context.viewport.width} × {current.context.viewport.height} · scroll {Math.round(current.context.scroll.y)} px</p>
      <a href={pageUrl(current)} target="_blank" rel="noreferrer" className="text-sm underline">Apri pagina originale con l’estensione ↗</a>
      <p className="text-xs text-muted-foreground">L’URL riapre la pagina; screenshot e contesto documentano lo stato originale senza ripristinare lo stato React.</p>
      {current.screenshot_path ? <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const response = await fetch(`/api/reports/${current.id}/screenshot`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Screenshot non disponibile.'); setImage(data.url); })}>Mostra screenshot</Button> : null}
      {/* Signed private images are intentionally loaded without Next image caching. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed images must bypass image caching */}
      {image ? <img src={image} alt="Screenshot originale" className="rounded-lg border" /> : null}
      <div className="grid gap-2"><Label htmlFor="dashboard-status">Stato</Label><select id="dashboard-status" className="rounded-lg border bg-background p-2 text-sm" disabled={busy} value={current.status} onChange={event => void run(async () => { await mutate('status', { status: event.target.value }); })}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {current.canEdit ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { await mutate('edit', { body: edited }); }); }}><Label htmlFor="edit-report">Modifica commento</Label><textarea id="edit-report" className="min-h-24 rounded-lg border p-3" value={edited} maxLength={10000} required onChange={event => setEdited(event.target.value)} /><Button type="submit" disabled={busy}>Salva testo</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => { if (confirm('Eliminare questa segnalazione e le sue risposte?')) void run(async () => { await mutate('delete', {}); setSelected(null); }); }}>Elimina segnalazione</Button></form> : null}
      <h3 className="font-medium">Risposte</h3>{comments.map(comment => <div key={comment.id} className="rounded-lg bg-muted p-3"><p className="text-xs font-medium">{comment.authorName}</p><p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p></div>)}
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void run(async () => { await mutate('reply', { body: reply }); setReply(''); const result = await getReportThread(current.environment_id, current.id); if (result.error) throw new Error(result.error); setComments(result.data.comments); }); }}><Label htmlFor="dashboard-reply">Rispondi</Label><textarea id="dashboard-reply" className="rounded-lg border p-3" maxLength={10000} required value={reply} onChange={event => setReply(event.target.value)} /><Button type="submit" disabled={busy || !reply.trim()}>Aggiungi risposta</Button></form>
    </CardContent></Card> : <Card><CardContent className="py-8 text-sm text-muted-foreground">Seleziona una segnalazione per leggere il contesto e le risposte.</CardContent></Card>}
    </div>
  </section>;
}
