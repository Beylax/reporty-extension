import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotify } from '@/components/ui/toast';

type IdentityResponse = { data: { needsName: boolean; displayName: string | null } };
type Request = (body: Record<string, unknown>) => Promise<IdentityResponse>;
type Pending = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };

export function useReviewerIdentity(request: Request, environmentId: string) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const notify = useNotify();

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  useEffect(() => {
    return () => {
      dialog.current?.close();
      pending.current?.reject(new Error('Consultazione terminata.'));
      pending.current = null;
    };
  }, [environmentId]);

  function finish(error?: Error) {
    setOpen(false);
    const work = pending.current;
    pending.current = null;
    if (error) work?.reject(error); else work?.resolve();
  }
  function ensureIdentity(): Promise<void> {
    if (pending.current) return pending.current.promise;
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
    const work = { promise, resolve, reject };
    pending.current = work;
    void request({ type: 'REPORTY_IDENTITY' }).then(result => {
      if (pending.current !== work) return;
      if (result.data.needsName) { setName(''); setOpen(true); }
      else finish();
    }).catch(error => { if (pending.current === work) finish(error instanceof Error ? error : new Error('Sessione non disponibile.')); });
    return promise;
  }
  async function save() {
    if (saveLock.current || !name.trim()) return;
    const work = pending.current;
    saveLock.current = true; setSaving(true);
    try {
      const result = await request({ type: 'REPORTY_IDENTITY', name: name.trim() });
      if (pending.current !== work) return;
      if (result.data.needsName) throw new Error('Inserisci il tuo nome.');
      notify('Nome salvato. Ora puoi intervenire sulle segnalazioni.', 'success');
      finish();
    } catch (error) { if (pending.current === work) notify(error instanceof Error ? error.message : 'Nome non salvato.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const nameDialog = <dialog ref={dialog} aria-labelledby="reporty-name-title" aria-describedby="reporty-name-description" className="pointer-events-auto m-auto w-[min(380px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-xl border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/45" onCancel={event => { event.preventDefault(); if (!saving) finish(new Error('Operazione annullata.')); }}>
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <h2 id="reporty-name-title" className="font-semibold">Come ti chiami?</h2>
      <p id="reporty-name-description" className="text-sm text-muted-foreground">Il nome è necessario per creare una segnalazione, rispondere o apportare modifiche. Verrà ricordato in questa sessione.</p>
      <div className="grid gap-2"><Label htmlFor="reporty-reviewer-name">Il tuo nome</Label><Input id="reporty-reviewer-name" autoComplete="name" required maxLength={80} value={name} disabled={saving} onChange={event => setName(event.target.value)} /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => finish(new Error('Operazione annullata.'))}>Annulla</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? <Skeleton className="h-4 w-20 bg-current opacity-30" /> : 'Continua'}</Button></div>
    </form>
  </dialog>;
  return { ensureIdentity, nameDialog };
}
