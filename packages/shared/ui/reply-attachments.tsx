'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { Skeleton } from './skeleton';
import { Download, Eye, Paperclip, Send, X } from 'lucide-react';
import { MAX_ATTACHMENT_BYTES, MAX_REPLY_ATTACHMENTS, isPreviewImage, type AttachmentRequest, type ReplyAttachment } from '../src/attachments';

type RequestFile = (input: AttachmentRequest) => Promise<{ url?: string; id?: string }>;
const pill = 'inline-flex min-w-0 max-w-[min(20rem,100%)] items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50';
const button = 'gap-2';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Operazione non riuscita.';
const fileLabel = (size: number) => `${(size / 1000000).toLocaleString('it',{maximumFractionDigits:2})} MB`;
function encodeFile(file: File): Promise<string> {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]!);
    reader.readAsDataURL(file);
  });
}

export function ReplyComposer({ requestFile, submit, onError, onBusyChange, disabled = false }: {
  requestFile: RequestFile; submit: (body: string, attachments: string[], replyId: string) => Promise<void>;
  onError: (message: string) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const labelId = useId();
  const [body,setBody] = useState('');
  const [files,setFiles] = useState<{ id: string; file: File; uploaded: boolean }[]>([]);
  const [removing,setRemoving] = useState(false);
  const [progress,setProgress] = useState<number | null>(null);
  const lock = useRef(false);
  const draftId = useRef<string | null>(null);
  const pending = useRef<string[]>([]);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const requestRef = useRef(requestFile);
  requestRef.current = requestFile;
  useEffect(() => () => {
    // Used attachments cannot be removed by this operation; an uncertain reply remains safe.
    for (const id of pending.current) void requestRef.current({ operation:'remove',id }).catch(() => errorRef.current('Pulizia degli allegati temporanei incompleta.'));
  },[]);
  const busy = disabled || progress !== null;
  return <form className="grid min-w-0 grid-cols-1 gap-3" aria-busy={progress !== null} onSubmit={event => {
    event.preventDefault();
    if (lock.current || busy || !body.trim()) return;
    lock.current = true;
    draftId.current ??= crypto.randomUUID();
    setProgress(0); onBusyChange?.(true);
    void (async () => {
      try {
        const ids: string[] = [];
        for (let index=0; index<files.length; index++) {
          const item = files[index]!;
          if (!item.uploaded) {
            if (!pending.current.includes(item.id)) pending.current.push(item.id);
            await requestFile({ operation:'upload',id:item.id,name:item.file.name,content:await encodeFile(item.file) });
            setFiles(previous => previous.map(file => file.id === item.id ? { ...file,uploaded:true } : file));
          }
          ids.push(item.id); setProgress(index + 1);
        }
        await submit(body,ids,draftId.current!);
        pending.current = []; draftId.current = null; setBody(''); setFiles([]);
      } catch (error) { onError(errorText(error)); }
      finally { lock.current = false; setProgress(null); onBusyChange?.(false); }
    })();
  }}>
    <label htmlFor={labelId} className="text-sm font-medium">Aggiungi una risposta</label>
    <Textarea id={labelId} required maxLength={10000} disabled={busy} value={body} onChange={event => setBody(event.target.value)} className="min-h-24 w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" />
    <label className="grid gap-1 text-sm"><span className="flex items-center gap-2"><Paperclip className="size-4" aria-hidden="true" />Allega file</span><Input type="file" multiple disabled={busy || files.length >= MAX_REPLY_ATTACHMENTS} className="h-auto min-w-0 max-w-full rounded-lg border bg-background p-2 text-sm" onChange={event => {
      const chosen = Array.from(event.target.files ?? []); event.target.value = '';
      if (files.length + chosen.length > MAX_REPLY_ATTACHMENTS) { onError('Puoi allegare al massimo 5 file per risposta.'); return; }
      if (chosen.some(file => !file.size || file.size > MAX_ATTACHMENT_BYTES || file.name.length > 255)) { onError('Ogni file deve avere un nome entro 255 caratteri, non essere vuoto e pesare al massimo 2,5 MB.'); return; }
      setFiles(previous => [...previous,...chosen.map(file => ({ id:crypto.randomUUID(),file,uploaded:false }))]);
    }} /><span className="text-xs text-muted-foreground">Massimo 5 file, fino a 2,5 MB ciascuno. Il testo è obbligatorio.</span></label>
    {files.length ? <div className="flex flex-wrap gap-2" aria-label="Allegati da inviare">{files.map(item => <span key={item.id} className={pill}><Paperclip className="size-4 shrink-0" aria-hidden="true" /><span className="truncate" title={item.file.name}>{item.file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{fileLabel(item.file.size)}</span><Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={`Rimuovi ${item.file.name}`} className="size-5 shrink-0 rounded-full" onClick={() => {
      if (lock.current) return;
      lock.current = true; setRemoving(true); setProgress(files.length); onBusyChange?.(true);
      void (async () => {
        try {
          if (pending.current.includes(item.id)) await requestFile({ operation:'remove',id:item.id });
          pending.current = pending.current.filter(id => id !== item.id);
          setFiles(previous => previous.filter(file => file.id !== item.id));
        } catch (error) { onError(errorText(error)); }
        finally { lock.current = false; setRemoving(false); setProgress(null); onBusyChange?.(false); }
      })();
    }}><X className="size-4" /></Button></span>)}</div> : null}
    {progress !== null ? <div role="status" className="space-y-2"><p className="text-xs text-muted-foreground">{removing ? 'Rimozione allegato…' : progress < files.length ? `Caricamento allegato ${progress + 1} di ${files.length}…` : 'Invio risposta…'}</p><div className="flex flex-wrap gap-2" aria-hidden="true">{files.map(item => <Skeleton key={item.id} className="h-8 w-32 rounded-full" />)}</div></div> : null}
    <Button type="submit" className={button} disabled={busy || !body.trim()}><Send className="size-4" aria-hidden="true" />Invia risposta</Button>
  </form>;
}

export function ReplyAttachmentList({ attachments = [], requestFile, onError, label = 'Allegati della risposta' }: { attachments?: ReplyAttachment[]; requestFile: RequestFile; onError: (message: string) => void; label?: string }) {
  const [opening,setOpening] = useState<string | null>(null);
  const [preview,setPreview] = useState<{name:string;url:string} | null>(null);
  const [loaded,setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  useEffect(() => { if (preview) dialog.current?.showModal(); },[preview]);
  return <>
    {attachments.length ? <div className="mt-3 flex flex-wrap gap-2" aria-label={label}>{attachments.map(item => <Button key={item.id} type="button" variant="outline" className={pill} disabled={opening !== null} aria-label={`${isPreviewImage(item.mime) ? 'Visualizza' : 'Scarica'} ${item.name}`} onClick={() => {
      if (lock.current) return;
      lock.current = true; setOpening(item.id);
      void (async () => {
        try {
          const result = await requestFile({ operation:'read',id:item.id });
          if (!result.url) throw new Error('Allegato non disponibile.');
          if (isPreviewImage(item.mime)) { setLoaded(false); setPreview({name:item.name,url:result.url}); }
          else {
            const anchor = document.createElement('a'); anchor.href=result.url; anchor.download=item.name;
            anchor.rel='noopener'; anchor.click();
          }
        } catch (error) { onError(errorText(error)); }
        finally { lock.current=false; setOpening(null); }
      })();
    }}>{opening === item.id ? <span role="status" aria-label="Caricamento allegato" className="h-4 w-4 animate-pulse rounded bg-muted motion-reduce:animate-none" /> : isPreviewImage(item.mime) ? <Eye className="size-4 shrink-0" aria-hidden="true" /> : <Download className="size-4 shrink-0" aria-hidden="true" />}<span className="truncate" title={item.name}>{item.name}</span><span className="shrink-0 text-xs text-muted-foreground">{fileLabel(item.size)}</span></Button>)}</div> : null}
    {preview ? <dialog ref={dialog} aria-label={`Anteprima ${preview.name}`} onClose={event => { event.stopPropagation(); setPreview(null); }} onCancel={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }} className="fixed inset-0 m-auto h-[90dvh] w-[95vw] max-w-none rounded-xl border bg-background p-4 text-foreground shadow-xl backdrop:bg-black/80">
      <header className="mb-3 flex items-center justify-between gap-3"><h2 className="truncate font-semibold">{preview.name}</h2><Button variant="outline" className={button} type="button" aria-label="Chiudi anteprima" onClick={() => dialog.current?.close()}><X className="size-4" /></Button></header>
      <div className="relative h-[calc(100%_-_3rem)] overflow-auto">{!loaded ? <div role="status" aria-label="Caricamento immagine" className="h-full w-full"><Skeleton className="h-full w-full rounded-lg" /></div> : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- private signed image loaded only on request */}
        <img src={preview.url} alt={preview.name} onLoad={() => setLoaded(true)} onError={() => { dialog.current?.close(); onError('Immagine non disponibile o file non valido.'); }} className={`${loaded ? '' : 'hidden'} mx-auto h-full max-w-full object-contain`} />
      </div>
    </dialog> : null}
  </>;
}
