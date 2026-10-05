import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, Crosshair, Eye, EyeOff, MapPin, Plus } from 'lucide-react';
import { getPageContext, priorityLabels, type ReportPriority, type Anchor, type Report, type ReportComment, type ReportContext } from '@reporty/shared';
import type { Environment, Site } from '@/lib/session';
import { captureHighlightedScreenshot } from '@/lib/screenshot';
import { elementAnchor, anchorPosition } from '@/lib/anchor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { anchorPosition as locate } from '@/lib/anchor';

async function message(body: object) {
  const response = await browser.runtime.sendMessage(body);
  if (!response?.ok) throw new Error(response?.error ?? 'Operazione non riuscita.');
  return response.data;
}
const statusLabels = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' };
const statusColors = { open: 'bg-blue-100 text-blue-800', in_progress: 'bg-amber-100 text-amber-800', resolved: 'bg-emerald-100 text-emerald-800' };
const priorityColors = { low: 'bg-slate-100 text-slate-700', medium: 'bg-amber-100 text-amber-800', high: 'bg-red-100 text-red-800' };
const box = 'space-y-3 rounded-xl border bg-card p-4 shadow-sm';
type Draft = { id: string; context: ReportContext; screenshot?: string; body: string; priority: ReportPriority };

export function ReviewOverlay({ site, environment, host }: { site: Site; environment: Environment; host: HTMLElement }) {
  const [page, setPage] = useState(getPageContext(location.href));
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState<'element' | 'pin' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);
  const [comments, setComments] = useState<ReportComment[]>([]);
  const [reply, setReply] = useState('');
  const [edit, setEdit] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const [hover, setHover] = useState<DOMRect | null>(null);
  async function refresh() {
    const result = await message({ type: 'REPORTY_REPORT', operation: 'list', payload: { pagePath: getPageContext(location.href).pagePath } });
    setReports(result.data);
    return result.data as Report[];
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setStatus('');
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'); }
    finally { setBusy(false); }
  }
  async function view(report: Report) {
    setSelected(report); setReply(''); setDraft(null); setEdit(null); setComments([]); setImageUrl(''); setOpen(true);
    await run(async () => {
      const result = await message({ type: 'REPORTY_REPORT', operation: 'thread', payload: { id: report.id } });
      setComments(result.data.comments);
    });
  }
  useEffect(() => {
    let disposed = false;
    void refresh().catch(error => { if (!disposed) setStatus(error.message); });
    setSelected(null); setComments([]); setImageUrl('');
    return () => { disposed = true; };
  }, [page.pagePath, environment.id]);
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
        const screenshot = await captureHighlightedScreenshot(host, context, () => message({ type: 'REPORTY_CAPTURE' }));
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
  const top = site.position.startsWith('top'), left = site.position.endsWith('left');
  const panelPosition = { [top ? 'top' : 'bottom']: 88, [left ? 'left' : 'right']: 24 };
  return <>
    {hover && mode ? <div className="pointer-events-none fixed border-2 border-indigo-500 bg-indigo-500/10" style={{ left: hover.left, top: hover.top, width: hover.width, height: hover.height }} /> : null}
    {mode ? <div className="pointer-events-auto fixed left-1/2 top-4 -translate-x-1/2 rounded-lg border bg-card p-3 text-sm shadow-xl">{mode === 'element' ? 'Seleziona un elemento' : 'Posiziona un pin'} · Esc per annullare <Button size="sm" variant="outline" onClick={() => { setMode(null); setOpen(true); }}>Annulla</Button></div> : null}
    {!mode && !draft ? reports.map((report, index) => {
      const position = anchorPosition(report.context.anchor);
      if (!position) return null;
      return <button key={report.id} aria-label={`Segnalazione ${index + 1}: ${report.body.slice(0, 60)}`} className="pointer-events-auto fixed flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-xs font-semibold text-white shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500" style={{ left: position.x, top: position.y }} onClick={() => void view(report)}>{index + 1}</button>;
    }) : null}
    <Button aria-label={open ? "Chiudi segnalazioni Reporty" : "Apri segnalazioni Reporty"} aria-expanded={open} className="pointer-events-auto fixed size-13 rounded-full shadow-xl transition-transform duration-200 hover:scale-110 motion-reduce:transition-none" style={{ [top ? 'top' : 'bottom']: 24, [left ? 'left' : 'right']: 24 }} onClick={() => { setOpen(!open); if (!open) void run(async () => { await refresh(); }); }}><span className="flex transition-transform duration-200 motion-reduce:transition-none" style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}><Plus className="size-6" aria-hidden="true" /></span></Button>
    {open && !mode ? <section aria-label="Segnalazioni Reporty" className="pointer-events-auto fixed flex max-h-[75vh] w-[min(380px,calc(100vw-48px))] flex-col gap-4 overflow-y-auto rounded-xl border bg-muted/50 p-4 text-sm text-card-foreground shadow-2xl" style={panelPosition}>
      <div className="flex items-center justify-between gap-2">{selected ? <Button variant="outline" size="sm" onClick={() => { setSelected(null); setListOpen(true); }}><ArrowLeft className="size-4" aria-hidden="true" />Torna alle segnalazioni</Button> : <span className="font-semibold">Reporty</span>}<Button size="sm" variant="ghost" aria-label="Chiudi" onClick={() => setOpen(false)}>×</Button></div>
      <header className="rounded-xl border bg-card p-4"><h2 className="font-semibold">{environment.projectName}</h2><p className="break-all text-xs text-muted-foreground">{environment.name} · {page.pagePath}</p></header>
      <p role="status" className="text-xs text-muted-foreground">{busy ? 'Operazione in corso…' : status}</p>
      {draft ? <form className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm" onSubmit={event => { event.preventDefault(); void run(async () => {
        const result = await message({ type: 'REPORTY_REPORT', operation: 'create', payload: { id: draft.id, body: draft.body, priority: draft.priority, context: draft.context }, screenshot: draft.screenshot });
        setDraft(null); await refresh(); setStatus(result.warning ?? 'Segnalazione inviata.');
      }); }}>
        <h3 className="font-medium">Nuova segnalazione</h3><Label htmlFor="report-body">Fix da effettuare</Label><textarea id="report-body" className="min-h-28 rounded-lg border bg-background p-3" value={draft.body} maxLength={10000} required onChange={event => setDraft({ ...draft, body: event.target.value })} />
        <Label htmlFor="report-priority">Priorità</Label><select id="report-priority" className="rounded-lg border bg-background p-2" disabled={busy} value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as ReportPriority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {draft.screenshot ? <><img alt="Anteprima screenshot da inviare" src={draft.screenshot} className="rounded-lg border" /><Button type="button" variant="outline" onClick={() => setDraft({ ...draft, screenshot: undefined })}>Rimuovi screenshot</Button></> : <div className="grid gap-2"><p className="text-xs text-muted-foreground">Nessuno screenshot allegato.</p><Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => {
          if (location.href !== draft.context.url || Math.abs(scrollY - draft.context.scroll.y) > 2 || Math.abs(scrollX - draft.context.scroll.x) > 2) throw new Error('Torna alla pagina e alla posizione originali prima di acquisire lo screenshot.');
          const screenshot = await captureHighlightedScreenshot(host, draft.context, () => message({ type: 'REPORTY_CAPTURE' }));
          if (screenshot.length > 3500000) throw new Error('Screenshot troppo grande.');
          setDraft(previous => previous ? { ...previous, screenshot } : previous);
        })}>Acquisisci screenshot</Button></div>}
        <Button type="submit" disabled={busy || !draft.body.trim()}>Invia segnalazione</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>Annulla</Button>
      </form> : selected ? <div className="space-y-4">
        <section className={box} aria-label="Descrizione e screenshot"><h3 className="font-semibold">Segnalazione</h3>
        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm leading-relaxed">{selected.body}</p>
        {selected.screenshot_path ? <Button variant="outline" disabled={busy} aria-expanded={Boolean(imageUrl)} onClick={() => { if (imageUrl) { setImageUrl(''); return; } void run(async () => { const result = await message({ type: 'REPORTY_SCREENSHOT', id: selected.id }); setImageUrl(result.url); }); }}>{imageUrl ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}{imageUrl ? 'Nascondi screenshot' : 'Mostra screenshot'}</Button> : null}
        {imageUrl ? <img alt="Screenshot originale della segnalazione" src={imageUrl} className="rounded-lg border" /> : null}
        <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${statusColors[selected.status]}`}>{statusLabels[selected.status]}</span><span className={`rounded-full px-2 py-1 ${priorityColors[selected.priority ?? 'medium']}`}>Priorità {priorityLabels[selected.priority ?? 'medium'].toLowerCase()}</span></div>
        {!locate(selected.context.anchor) ? <p className="rounded-lg bg-muted p-3">Elemento non trovato o modificato. Consulta lo screenshot originale.</p> : null}
        <Button variant="outline" disabled={busy} onClick={() => {
          const point = locate(selected.context.anchor);
          if (point) window.scrollBy({ top: point.y - innerHeight / 2, left: 0, behavior: 'smooth' });
          else window.scrollTo({ top: selected.context.scroll.y, left: selected.context.scroll.x, behavior: 'smooth' });
        }}>Vai al punto</Button></section>
        <section className={box} aria-label="Gestione segnalazione"><h3 className="font-medium">Gestisci segnalazione</h3>
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="report-status">Stato</Label><select id="report-status" className="rounded-lg border bg-background p-2" disabled={busy} value={selected.status} onChange={event => void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'status', payload: { id: selected.id, status: event.target.value } }); const items = await refresh(); setSelected(items.find(item => item.id === selected.id) ?? null); })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div> : null}
        {selected.canChangeStatus ? <div className="grid gap-2"><Label htmlFor="selected-priority">Priorità</Label><select id="selected-priority" className="rounded-lg border bg-background p-2" disabled={busy} value={selected.priority ?? 'medium'} onChange={event => void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'priority', payload: { id: selected.id, priority: event.target.value } }); const items = await refresh(); setSelected(items.find(item => item.id === selected.id) ?? null); })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div> : null}
        {selected.canEdit ? <div className="space-y-2">{edit === null ? <Button variant="outline" onClick={() => setEdit(selected.body)}>Modifica testo</Button> : <form className="grid gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'edit', payload: { id: selected.id, body: edit } }); const items = await refresh(); setSelected(items.find(item => item.id === selected.id) ?? null); setEdit(null); }); }}><textarea className="rounded-lg border p-2" required value={edit} maxLength={10000} onChange={event => setEdit(event.target.value)} /><Button type="submit" disabled={busy}>Salva testo</Button></form>}<Button variant="destructive" disabled={busy} onClick={() => { if (confirm('Eliminare questa segnalazione e le sue risposte?')) void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'delete', payload: { id: selected.id } }); setSelected(null); await refresh(); }); }}>Elimina</Button></div> : null}
        </section><section className={box} aria-label="Risposte"><h3 className="font-medium">Risposte</h3>{comments.map(comment => <div key={comment.id} className="rounded-lg bg-muted p-3"><p className="text-xs font-medium">{comment.authorName}</p><p className="whitespace-pre-wrap break-words">{comment.body}</p></div>)}
        <form className="grid gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await message({ type: 'REPORTY_REPORT', operation: 'reply', payload: { id: selected.id, body: reply } }); setReply(''); const result = await message({ type: 'REPORTY_REPORT', operation: 'thread', payload: { id: selected.id } }); setComments(result.data.comments); }); }}><Label htmlFor="reply">Aggiungi una risposta</Label><textarea id="reply" className="rounded-lg border bg-background p-2" maxLength={10000} required value={reply} onChange={event => setReply(event.target.value)} /><Button type="submit" disabled={busy || !reply.trim()}>Rispondi</Button></form>
        </section><footer className="rounded-xl border bg-card p-4 text-xs text-muted-foreground"><p>Segnalata da {selected.authorName}</p><p>Viewport originale: {selected.context.viewport.width} × {selected.context.viewport.height} · scroll {Math.round(selected.context.scroll.y)} px</p></footer>
      </div> : <>
        <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm"><h3 className="font-semibold">Crea una segnalazione</h3><Button className="w-full justify-start" disabled={busy} onClick={() => { setMode('element'); setOpen(false); }}><Crosshair className="size-4" aria-hidden="true" />Seleziona elemento</Button><Button className="w-full justify-start" disabled={busy} variant="outline" onClick={() => { setMode('pin'); setOpen(false); }}><MapPin className="size-4" aria-hidden="true" />Pin libero</Button></div>
        <section className={box} aria-label="Lista segnalazioni"><Button className="w-full justify-between" variant="outline" aria-expanded={listOpen} aria-controls="reporty-page-reports" onClick={() => setListOpen(previous => !previous)}>Segnalazioni della pagina ({reports.length})<span className="flex transition-transform duration-200 motion-reduce:transition-none" style={{ transform: listOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}><ChevronDown className="size-4" aria-hidden="true" /></span></Button>
        <div id="reporty-page-reports" hidden={!listOpen} className={listOpen ? "grid gap-2" : "hidden"}>
          {!reports.length ? <p className="text-muted-foreground">Nessuna segnalazione su questa pagina.</p> : null}
          {reports.map((report, index) => <button key={report.id} className="rounded-lg border p-3 text-left hover:bg-accent" onClick={() => void view(report)}><p className="line-clamp-3 break-words">{index + 1}. {report.body}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${statusColors[report.status]}`}>{statusLabels[report.status]}</span><span className={`rounded-full px-2 py-1 ${priorityColors[report.priority ?? 'medium']}`}>Priorità {priorityLabels[report.priority ?? 'medium'].toLowerCase()}</span>{!anchorPosition(report.context.anchor) ? <span className="text-muted-foreground">Elemento non trovato</span> : null}</div></button>)}
        </div></section>
      </>}
    </section> : null}
  </>;
}
