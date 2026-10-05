'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { startGuestReview } from './actions';

type Prepared = { extensionId: string; nonce: string };
function prepareExtension(): Promise<Prepared> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', listener); reject(new Error('Estensione non disponibile. Ricarica questa pagina dopo aver installato o aggiornato Reporty.')); }, 4000);
    function listener(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'REPORTY_GUEST_READY' || event.data.requestId !== requestId) return;
      clearTimeout(timer); window.removeEventListener('message', listener);
      const data = event.data.data;
      if (!event.data.ok || !data || !/^[a-p]{32}$/.test(data.extensionId) || !/^[0-9a-f]{64}$/.test(data.nonce)) reject(new Error('Collegamento non disponibile. Ricarica la pagina e riprova.'));
      else resolve(data);
    }
    window.addEventListener('message', listener);
    window.postMessage({ type: 'REPORTY_GUEST_PREPARE', requestId }, location.origin);
  });
}

export function ReviewForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [status, setStatus] = useState('');
  const locked = useRef(false);
  return <form className="grid gap-4" onSubmit={event => {
    event.preventDefault();
    if (locked.current) return;
    const form = new FormData(event.currentTarget);
    locked.current = true; setBusy(true); setStatus('');
    void (async () => {
      try {
        const prepared = await prepareExtension();
        const result = await startGuestReview(token, String(form.get('name') ?? ''));
        if (!result.code || !result.environmentId) throw new Error(result.error ?? 'Invito non disponibile.');
        const chrome = (window as unknown as { chrome?: { runtime?: { lastError?: unknown; sendMessage: (id: string, message: unknown, callback: (response?: { ok?: boolean }) => void) => void } } }).chrome;
        const runtime = chrome?.runtime;
        if (!runtime?.sendMessage) throw new Error('Apri il link con Chrome o Edge e Reporty installato.');
        await new Promise<void>((resolve, reject) => runtime.sendMessage(prepared.extensionId, { type: 'REPORTY_CONNECT', nonce: prepared.nonce, code: result.code, guestEnvironmentId: result.environmentId }, response => {
          if (runtime.lastError || !response?.ok) reject(new Error('Collegamento non riuscito. Riapri il link e riprova.'));
          else resolve();
        }));
        setDone(true); setStatus('Collegamento completato. Apertura della revisione…');
      } catch (error) { locked.current = false; setStatus(error instanceof Error ? error.message : 'Avvio non riuscito.'); }
      finally { setBusy(false); }
    })();
  }}><div className="grid gap-2"><Label htmlFor="guest-name">Il tuo nome</Label><Input id="guest-name" name="name" autoComplete="name" maxLength={80} required placeholder="Come ti chiami?" disabled={busy || done} /></div><Button type="submit" disabled={busy || done}>{done ? 'Revisione avviata' : busy ? 'Collegamento…' : 'Inizia revisione'}</Button><p role="status" className="text-sm text-muted-foreground">{status}</p></form>;
}
