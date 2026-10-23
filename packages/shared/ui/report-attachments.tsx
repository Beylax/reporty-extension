'use client';
import { Paperclip, X } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Skeleton } from './skeleton';
import { MAX_REPORT_ATTACHMENTS, MAX_REPORT_ATTACHMENT_BYTES } from '../src/attachments';

export type DraftReportFile = { id: string; file: File; uploaded?: boolean };
export type ReportFileProgress = { id: string; completed: number; total: number; percent: number };

export function ReportAttachmentPicker({ files, disabled, saved, progress, onChange, onRemove, onError }: {
  files: DraftReportFile[]; disabled: boolean; saved?: boolean; progress?: ReportFileProgress | null;
  onChange: (files: DraftReportFile[]) => void; onRemove: (id: string) => void; onError: (message: string) => void;
}) {
  return <section className="grid min-w-0 gap-2" aria-label="File della segnalazione">
    <label className="grid min-w-0 gap-2 text-sm"><span className="flex items-center gap-2 font-medium"><Paperclip className="size-4" aria-hidden="true" />Allega file</span>
      <Input type="file" multiple disabled={disabled || saved || files.length >= MAX_REPORT_ATTACHMENTS} className="h-auto min-w-0 max-w-full p-2" onChange={event => {
        const selected = Array.from(event.target.files ?? []); event.target.value = '';
        if (files.length + selected.length > MAX_REPORT_ATTACHMENTS) { onError(`Puoi allegare al massimo ${MAX_REPORT_ATTACHMENTS} file per segnalazione.`); return; }
        if (selected.some(file => !file.size || file.size > MAX_REPORT_ATTACHMENT_BYTES || !file.name.trim() || file.name.length > 255)) { onError('Ogni file deve avere un nome entro 255 caratteri, non essere vuoto e pesare al massimo 5 MB.'); return; }
        onChange([...files, ...selected.map(file => ({ id: crypto.randomUUID(), file }))]);
      }} />
      <span className="text-xs text-muted-foreground">Massimo 5 file, fino a 5 MB ciascuno. Gli screenshot hanno un limite separato.</span>
    </label>
    {files.length ? <ul className="grid min-w-0 gap-2" aria-label="File da allegare">{files.map(item => <li key={item.id} className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs"><Paperclip className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 truncate" title={item.file.name}>{item.file.name}</span><span className="shrink-0 text-muted-foreground">{(item.file.size / 1000000).toLocaleString('it', { maximumFractionDigits: 2 })} MB</span><Button type="button" variant="ghost" size="icon-xs" aria-label={`Rimuovi ${item.file.name}`} disabled={disabled || item.uploaded} onClick={() => onRemove(item.id)}><X className="size-4" aria-hidden="true" /></Button></li>)}</ul> : null}
    {progress ? <div role="status" className="space-y-2"><p className="text-xs text-muted-foreground">Caricamento file {progress.completed + 1} di {progress.total}: {progress.percent}%</p><progress className="h-2 w-full accent-primary" max={100} value={progress.percent} aria-label="Avanzamento caricamento file" /><div aria-hidden="true" className="flex items-center gap-2 rounded-lg border p-2"><Skeleton className="size-4 shrink-0" /><Skeleton className="h-3 flex-1" /><Skeleton className="h-3 w-12" /></div></div> : null}
  </section>;
}
