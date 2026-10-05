'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { createHandoff } from './actions';

type ChromeWeb = { runtime?: { sendMessage: (id: string, message: unknown, callback: (response?: { ok?: boolean; error?: string }) => void) => void; lastError?: { message?: string } } };

export function ConnectButton({ extensionId, nonce, projectId }: { extensionId: string; nonce: string; projectId?: string }) {
  return <ConnectionControl extensionId={extensionId} nonce={nonce} projectId={projectId} />;
}

function ConnectionControl({ extensionId, nonce, projectId }: { extensionId: string; nonce: string; projectId?: string }) {
  const toast = useToastManager();
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  function failure(description: string) { toast.add({ title: 'Collegamento non riuscito', description, type: 'error', priority: 'high' }); }
  async function connect() {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    let succeeded = false;
    try {
      const chrome = (window as unknown as { chrome?: ChromeWeb }).chrome;
      if (!chrome?.runtime?.sendMessage) { failure('Apri questa pagina dal pulsante Collega nell’estensione Chrome o Edge.'); return; }
      const result = await createHandoff(projectId);
      if (!result.code) { failure(result.error ?? 'Collegamento non riuscito.'); return; }
      const runtime = chrome.runtime;
      await new Promise<void>(resolve => runtime.sendMessage(extensionId, { type: 'REPORTY_CONNECT', nonce, code: result.code }, response => {
        const error = runtime.lastError;
        if (!error && response?.ok) {
          succeeded = true;
          setConnected(true);
          toast.add({ title: 'Estensione collegata', description: 'Puoi aprirla sul sito da revisionare.', type: 'success' });
        } else failure('Riapri questa pagina dal pulsante Collega dell’estensione.');
        resolve();
      }));
    } catch { failure('Collegamento non riuscito. Riprova.'); }
    finally { locked.current = succeeded; setPending(false); }
  }
  return <Button disabled={pending || connected} onClick={connect}>{connected ? 'Estensione collegata' : pending ? <Skeleton className="h-4 w-32 bg-current opacity-30" /> : 'Conferma collegamento'}</Button>;
}
