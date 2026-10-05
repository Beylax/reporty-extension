'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createHandoff } from './actions';

type ChromeWeb = { runtime?: { sendMessage: (id: string, message: unknown, callback: (response?: { ok?: boolean; error?: string }) => void) => void; lastError?: { message?: string } } };

export function ConnectButton({ extensionId, nonce, projectId }: { extensionId: string; nonce: string; projectId?: string }) {
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  async function connect() {
    setPending(true);
    try {
      const chrome = (window as unknown as { chrome?: ChromeWeb }).chrome;
      if (!chrome?.runtime?.sendMessage) { setStatus('Apri questa pagina dal pulsante Collega nell’estensione Chrome o Edge.'); return; }
      const result = await createHandoff(projectId);
      if (!result.code) { setStatus(result.error ?? 'Collegamento non riuscito.'); return; }
      const runtime = chrome.runtime;
      await new Promise<void>(resolve => runtime.sendMessage(extensionId, { type: 'REPORTY_CONNECT', nonce, code: result.code }, response => {
        const error = runtime.lastError;
        setStatus(!error && response?.ok ? 'Estensione collegata. Puoi aprirla sul sito da revisionare.' : 'Collegamento non riuscito. Riapri questa pagina dal pulsante Collega dell’estensione.');
        resolve();
      }));
    } catch { setStatus('Collegamento non riuscito. Riprova.'); }
    finally { setPending(false); }
  }
  return <div className="space-y-3"><Button disabled={pending} onClick={connect}>{pending ? 'Collegamento…' : 'Conferma collegamento'}</Button><p role="status" className="text-sm text-muted-foreground">{status}</p></div>;
}
