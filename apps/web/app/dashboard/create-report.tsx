'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { getPageContext, MAX_REPORT_SCREENSHOTS, priorityLabels, reportRequestSchema, type AttachmentRequest, type AttachmentResponse, type ReportPriority } from '@reporty/shared';
import { uploadReportFile } from '@reporty/shared/report-file-upload';
import { ReportAttachmentPicker, type DraftReportFile, type ReportFileProgress } from '@reporty/shared/ui/report-attachments';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioButtons } from '@/components/ui/radio-buttons';
import { SelectField } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToastManager } from '@/components/ui/toast';
import { ScreenshotGallery } from '@/components/screenshot-gallery';
import { playgroundUrl } from '@/lib/playground';
import { readDraftScreenshot, type DraftScreenshot } from '@/lib/draft-screenshot';

type Environment = { id: string; name: string; origin: string };
type Draft = { id: string; environmentId: string; url: string; body: string; priority: ReportPriority; screenshots: DraftScreenshot[]; files: DraftReportFile[]; saved?: boolean };

export function CreateReport({ environments, disabled, onCreated }: { environments: Environment[]; disabled?: boolean; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button disabled={disabled || !environments.length} onClick={() => setOpen(true)}><Plus aria-hidden="true" />Nuova segnalazione</Button>
    {open && environments.length ? <CreateReportForm environments={environments} onCreated={onCreated} onClose={() => setOpen(false)} /> : null}
  </>;
}

function CreateReportForm({ environments, onCreated, onClose }: { environments: Environment[]; onCreated: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({ id: crypto.randomUUID(), environmentId: environments[0]!.id, url: environments[0]!.origin + '/', body: '', priority: 'medium', screenshots: [], files: [] }));
  const [busy, setBusy] = useState(false);
  const [readingImages, setReadingImages] = useState(false);
  const [gallery, setGallery] = useState<DraftScreenshot | null>(null);
  const [progress, setProgress] = useState<ReportFileProgress | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const pending = useRef(new Set<string>());
  const saved = useRef(false);
  const toast = useToastManager();
  const notifyCleanup = useRef(toast.add);
  useEffect(() => { notifyCleanup.current = toast.add; }, [toast.add]);
  const environment = environments.find(item => item.id === draft.environmentId)!;
  const locked = busy || readingImages;
  const snapshot = useRef(draft);
  useEffect(() => { snapshot.current = draft; }, [draft]);
  function error(message: string) { toast.add({ title: 'Operazione non riuscita', description: message, type: 'error' }); }
  async function attachmentRequest(input: AttachmentRequest): Promise<AttachmentResponse> {
    const current = snapshot.current;
    if (input.operation === 'begin_upload') pending.current.add(input.id);
    const response = await fetch('/api/attachments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, environmentId: current.environmentId, issueId: current.id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Allegato non disponibile.');
    if (input.operation === 'complete_upload' || result.completed) pending.current.delete(input.id);
    return result;
  }
  useEffect(() => {
    alive.current = true;
    const files = pending.current;
    return () => {
      alive.current = false;
      abort.current?.abort();
      const current = snapshot.current;
      for (const id of files) void fetch('/api/attachments', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'report', operation: 'remove', environmentId: current.environmentId, issueId: current.id, id }) }).then(response => { if (!response.ok) throw new Error(); }).catch(() => notifyCleanup.current({ title: 'Pulizia dei file temporanei incompleta.', type: 'error' }));
    };
  }, []);
  function close() {
    if (lock.current || readingImages) return;
    if (saved.current) onCreated();
    onClose();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || readingImages) return;
    lock.current = true; setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const context = { ...getPageContext(playgroundUrl(draft.url.trim(), environment.origin)), anchor: { kind: 'page' as const } };
      const request = reportRequestSchema.safeParse({ environmentId: environment.id, operation: 'create', payload: { id: draft.id, body: draft.body, priority: draft.priority, context } });
      if (!request.success) throw new Error('Inserisci una descrizione da 1 a 10.000 caratteri e un URL valido dell’ambiente.');
      if (!saved.current) {
        await sendReport(request.data, controller.signal);
        saved.current = true;
        if (alive.current) setDraft(current => ({ ...current, saved: true }));
      }
      for (const screenshot of draft.screenshots.filter(item => !item.uploaded)) {
        await sendReport({ environmentId: environment.id, operation: 'screenshot', payload: { id: draft.id, screenshotId: screenshot.id }, screenshot: screenshot.src }, controller.signal);
        if (alive.current) setDraft(current => ({ ...current, screenshots: current.screenshots.map(item => item.id === screenshot.id ? { ...item, uploaded: true } : item) }));
      }
      const files = draft.files.filter(item => !item.uploaded);
      for (const [index, item] of files.entries()) {
        if (alive.current) setProgress({ id: item.id, completed: index, total: files.length, percent: 0 });
        await uploadReportFile(item.file, item.id, attachmentRequest, percent => { if (alive.current) setProgress({ id: item.id, completed: index, total: files.length, percent }); }, controller.signal);
        if (alive.current) setDraft(current => ({ ...current, files: current.files.map(file => file.id === item.id ? { ...file, uploaded: true } : file) }));
      }
      toast.add({ title: 'Segnalazione creata', type: 'success' });
      if (alive.current) { onCreated(); onClose(); }
    } catch (cause) {
      if (alive.current) error((saved.current ? 'Segnalazione salvata. Completa l’invio degli allegati mancanti. ' : '') + (cause instanceof Error ? cause.message : 'Riprova.'));
    } finally {
      lock.current = false; abort.current = null;
      if (alive.current) { setBusy(false); setProgress(null); }
    }
  }
  return <Dialog open onOpenChange={next => { if (!next) close(); }} showClose={false}>
    <div className="mb-6 flex items-start justify-between gap-4"><div className="space-y-2"><DialogTitle className="text-lg font-semibold">Nuova segnalazione</DialogTitle><DialogDescription className="text-sm text-muted-foreground">Collega la segnalazione a una pagina dell’ambiente e aggiungi gli allegati utili.</DialogDescription></div><Button type="button" variant="outline" size="icon" aria-label="Chiudi creazione segnalazione" disabled={locked} onClick={close}><X aria-hidden="true" /></Button></div>
    <form className="grid min-w-0 gap-5" onSubmit={submit}>
      <div className="grid gap-2"><Label htmlFor="new-report-environment">Ambiente</Label><SelectField id="new-report-environment" label="Ambiente" value={draft.environmentId} options={environments.map(item => ({ value: item.id, label: item.name }))} disabled={locked || draft.saved} onValueChange={environmentId => { const next = environments.find(item => item.id === environmentId)!; setDraft({ ...draft, environmentId, url: next.origin + '/' }); }} /></div>
      <div className="grid gap-2"><Label htmlFor="new-report-url">URL della pagina</Label><Input id="new-report-url" required type="url" maxLength={8192} disabled={locked || draft.saved} value={draft.url} onChange={event => setDraft({ ...draft, url: event.target.value })} aria-describedby="new-report-url-help" /><p id="new-report-url-help" className="break-all text-xs text-muted-foreground">Deve appartenere a {environment.origin}.</p></div>
      <div className="grid gap-2"><Label htmlFor="new-report-body">Descrizione</Label><Textarea id="new-report-body" required maxLength={10000} rows={4} disabled={locked || draft.saved} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></div>
      <div className="grid min-w-0 gap-2"><Label htmlFor="new-report-priority">Priorità</Label><RadioButtons id="new-report-priority" label="Priorità" variant="standard" value={draft.priority} disabled={locked || draft.saved} onValueChange={priority => setDraft({ ...draft, priority: priority as ReportPriority })} options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} /></div>
      <section className="grid min-w-0 gap-3" aria-label="Screenshot da allegare"><Label htmlFor="new-report-screenshots">Aggiungi screenshot</Label><Input id="new-report-screenshots" type="file" accept="image/jpeg,image/png,image/webp" multiple className="h-auto min-w-0 max-w-full p-2" disabled={locked || draft.saved || draft.screenshots.length >= MAX_REPORT_SCREENSHOTS} onChange={async event => {
        const files = Array.from(event.target.files ?? []); event.target.value = '';
        if (!files.length) return;
        if (draft.screenshots.length + files.length > MAX_REPORT_SCREENSHOTS) { error('Puoi allegare al massimo 5 screenshot.'); return; }
        setReadingImages(true);
        try {
          const images: DraftScreenshot[] = [];
          for (const file of files) images.push(await readDraftScreenshot(file));
          if (alive.current) setDraft(current => ({ ...current, screenshots: [...current.screenshots, ...images] }));
        } catch (cause) { if (alive.current) error(cause instanceof Error ? cause.message : 'Impossibile leggere l’immagine.'); }
        finally { if (alive.current) setReadingImages(false); }
      }} /><p className="text-xs text-muted-foreground">Massimo 5 screenshot JPG, PNG o WebP, fino a 5 MB ciascuno.</p>
        {readingImages ? <div role="status" aria-label="Preparazione screenshot" className="grid grid-cols-2 gap-3"><Skeleton className="aspect-video w-full rounded-lg" /><Skeleton className="aspect-video w-full rounded-lg" /></div> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{draft.screenshots.map((image, index) => <div key={image.id} className="relative min-w-0"><button type="button" className="block w-full overflow-hidden rounded-lg border focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Rivedi screenshot ${index + 1}`} onClick={() => setGallery(image)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local screenshot previews */}
          <img src={image.src} alt={`Screenshot ${index + 1}`} className="aspect-video w-full object-contain" />
        </button><Button type="button" variant="outline" size="icon-xs" className="absolute right-1 top-1 bg-background shadow" aria-label={`Rimuovi screenshot ${index + 1}`} disabled={locked || draft.saved} onClick={() => setDraft(current => ({ ...current, screenshots: current.screenshots.filter(item => item.id !== image.id) }))}><Trash2 aria-hidden="true" /></Button></div>)}</div>
      </section>
      <ReportAttachmentPicker files={draft.files} disabled={locked} saved={draft.saved} progress={progress} onChange={files => setDraft(current => ({ ...current, files }))} onRemove={id => setDraft(current => ({ ...current, files: current.files.filter(item => item.id !== id) }))} onError={error} />
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={locked} onClick={close}>Chiudi</Button><Button type="submit" disabled={locked || !draft.body.trim()}>{busy ? 'Invio in corso…' : draft.saved ? 'Completa invio' : 'Crea segnalazione'}</Button></div>
    </form>
    {gallery ? <ScreenshotGallery autoOpen src={gallery.src} sources={draft.screenshots.map(image => image.src)} aspectRatio={`${gallery.width} / ${gallery.height}`} onClose={() => setGallery(null)} /> : null}
  </Dialog>;
}

async function sendReport(input: unknown, signal: AbortSignal) {
  const response = await fetch('/api/reports', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok || result.warning) throw new Error(result.error ?? result.warning ?? 'Invio non riuscito.');
  return result;
}
