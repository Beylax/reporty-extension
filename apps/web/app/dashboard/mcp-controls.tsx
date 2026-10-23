'use client';
import { Copy, Unplug } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToastManager } from '@/components/ui/toast';
import { revokeMcpConnection } from './mcp-actions';

export function CopyMcpEndpoint({ endpoint }: { endpoint: string }) {
  const toast = useToastManager();
  return <Button variant="outline" onClick={async () => {
    try { await navigator.clipboard.writeText(endpoint); toast.add({ title: 'URL MCP copiato', type: 'success' }); }
    catch { toast.add({ title: 'Seleziona e copia l’URL dal campo.', type: 'error' }); }
  }}><Copy aria-hidden="true" className="size-4" />Copia URL MCP</Button>;
}
export function RevokeMcpConnection({ connectionId, revoked = false }: { connectionId: string; revoked?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const toast = useToastManager();
  return <Button variant="outline" size="sm" disabled={pending || done} onClick={() => {
    if (busy.current || done) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await revokeMcpConnection(connectionId);
        setDone(!result.error && !result.warning);
        toast.add({ title: result.error ? 'Revoca non riuscita' : result.warning ? 'Accesso revocato, sessione da terminare' : 'Collegamento revocato', description: result.error ?? result.warning, type: result.error || result.warning ? 'error' : 'success' });
      } catch { toast.add({ title: 'Revoca non riuscita', type: 'error' }); }
      finally { busy.current = false; }
    });
  }}><Unplug className="size-4" aria-hidden="true" />{pending ? <><span className="sr-only">Revoca in corso</span><Skeleton className="h-4 w-16" /></> : revoked ? 'Termina sessione OAuth' : 'Revoca'}</Button>;
}
