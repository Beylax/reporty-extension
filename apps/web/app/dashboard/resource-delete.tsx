'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToastManager } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { deletePlatformResource } from './resource-actions';

export function ResourceDelete({ id, kind, name }: { id: string; kind: 'project' | 'environment'; name: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToastManager();
  const router = useRouter();
  return <div className="space-y-2"><Button variant="destructive" disabled={pending} onClick={() => {
    if (!confirm(`Eliminare definitivamente ${name}? Verranno eliminate anche tutte le segnalazioni e le risposte${kind === 'project' ? ', gli ambienti e gli accessi del progetto' : ' di questo ambiente'}.`)) return;
    startTransition(async () => {
      try {
        const result = await deletePlatformResource(id, kind);
        if (result.error) { toast.add({ title: 'Eliminazione non riuscita', description: result.error, type: 'error' }); return; }
        if (kind === 'project') router.push('/dashboard');
        router.refresh();
        toast.add({ title: result.warning ? 'Eliminazione completata con avviso' : kind === 'project' ? 'Progetto eliminato' : 'Ambiente eliminato', description: result.warning, type: result.warning ? 'error' : 'success' });
      } catch { toast.add({ title: 'Eliminazione non riuscita', description: 'Riprova.', type: 'error' }); }
    });
  }}>{pending ? <Skeleton className="h-4 w-24 bg-current opacity-30" /> : kind === 'project' ? 'Elimina progetto' : 'Elimina ambiente'}</Button></div>;
}
