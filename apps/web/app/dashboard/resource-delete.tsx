'use client';
import { DeleteConfirm } from '@/components/delete-confirm';
import { Trash2 } from 'lucide-react';

import { useRouter } from 'next/navigation';
import { useToastManager } from '@/components/ui/toast';
import { deletePlatformResource } from './resource-actions';

export function ResourceDelete({ id, kind, name, fullWidth = false }: { fullWidth?: boolean; id: string; kind: 'project' | 'environment'; name: string }) {
  const toast = useToastManager();
  const router = useRouter();
  return <div className="space-y-2"><DeleteConfirm fullWidth={fullWidth} description={`Eliminare definitivamente ${name}? Verranno eliminate anche tutte le segnalazioni e le risposte${kind === 'project' ? ", gli ambienti e gli accessi del progetto" : ' di questo ambiente'}.`} onConfirm={async () => {


      try {
        const result = await deletePlatformResource(id, kind);
        if (result.error) { toast.add({ title: 'Eliminazione non riuscita', description: result.error, type: 'error' }); return; }
        if (kind === 'project') router.push('/dashboard');
        router.refresh();
        toast.add({ title: result.warning ? 'Eliminazione completata con avviso' : kind === 'project' ? 'Progetto eliminato' : 'Ambiente eliminato', description: result.warning, type: result.warning ? 'error' : 'success' });
      } catch { toast.add({ title: 'Eliminazione non riuscita', description: 'Riprova.', type: 'error' }); }

  }}><Trash2 className="size-4" aria-hidden="true" />{kind === 'project' ? 'Elimina progetto' : 'Elimina ambiente'}</DeleteConfirm></div>;
}
