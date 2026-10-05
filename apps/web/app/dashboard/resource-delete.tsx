'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { deletePlatformResource } from './resource-actions';

export function ResourceDelete({ id, kind, name }: { id: string; kind: 'project' | 'environment'; name: string }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState('');
  const router = useRouter();
  return <div className="space-y-2"><Button variant="destructive" disabled={pending} onClick={() => {
    if (!confirm(`Eliminare definitivamente ${name}? Verranno eliminate anche tutte le segnalazioni e le risposte${kind === 'project' ? ', gli ambienti e gli accessi del progetto' : ' di questo ambiente'}.`)) return;
    startTransition(async () => {
      setStatus('');
      try {
        const result = await deletePlatformResource(id, kind);
        if (result.error) { setStatus(result.error); return; }
        if (kind === 'project') router.push('/dashboard');
        router.refresh();
        setStatus(result.warning ?? 'Ambiente eliminato.');
      } catch { setStatus('Eliminazione non riuscita. Riprova.'); }
    });
  }}>{pending ? 'Eliminazione…' : kind === 'project' ? 'Elimina progetto' : 'Elimina ambiente'}</Button><p role="status" className="text-xs text-muted-foreground">{status}</p></div>;
}
