'use client';
import { useRef, useState, type ComponentProps } from 'react';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

export function DeleteConfirm({ description, onConfirm, disabled, fullWidth = false, triggerProps, children = 'Elimina' }: { description: string; onConfirm: () => Promise<void>; disabled?: boolean; fullWidth?: boolean; triggerProps?: Pick<ComponentProps<typeof Button>, 'size' | 'className' | 'aria-label' | 'title'>; children?: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  return <>
    <Button variant="destructive" size={fullWidth ? 'lg' : 'default'} className={fullWidth ? 'w-full' : undefined} {...triggerProps} disabled={disabled} onClick={() => dialog.current?.showModal()}>{children}</Button>
    <dialog ref={dialog} aria-label="Conferma eliminazione" className="fixed inset-0 m-auto w-[calc(100vw-2rem)] max-w-md rounded-xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/60" onClose={event => event.stopPropagation()} onCancel={event => { event.stopPropagation(); if (lock.current) event.preventDefault(); }} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <div className="space-y-4"><h2 className="text-lg font-semibold">Conferma eliminazione</h2><p className="text-sm text-muted-foreground">{description}</p><div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => dialog.current?.close()}>Annulla</Button><Button variant="destructive" disabled={pending} onClick={() => { if (lock.current) return; lock.current = true; setPending(true); void (async () => { try { await onConfirm(); dialog.current?.close(); } finally { lock.current = false; setPending(false); } })(); }}>{pending ? <Skeleton className="h-4 w-20 bg-current opacity-30" /> : 'Elimina'}</Button></div></div>
    </dialog>
  </>;
}
