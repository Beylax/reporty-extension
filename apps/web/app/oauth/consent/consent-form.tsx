'use client';
import { useRef, useState, useTransition } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { decideMcpConsent } from './actions';

export function ConsentForm({ authorizationId, projects, initialProject }: { authorizationId: string; projects: { id: string; name: string }[]; initialProject?: string }) {
  const [project, setProject] = useState(initialProject ?? projects[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);
  const busy = useRef(false);
  const toast = useToastManager();
  function decide(approve: boolean) {
    if (busy.current || completed) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await decideMcpConsent(authorizationId, project, approve);
        if (result.error || !result.redirect) {
          toast.add({ title: 'Collegamento non riuscito', description: result.error, type: 'error' });
          return;
        }
        setCompleted(true);
        toast.add({ title: approve ? 'Progetto autorizzato in sola lettura' : 'Autorizzazione rifiutata', type: 'success' });
        window.location.assign(result.redirect);
      } catch {
        toast.add({ title: 'Collegamento non riuscito', description: 'Riprova tra poco.', type: 'error' });
      } finally { busy.current = false; }
    });
  }
  return <form className="space-y-5" onSubmit={event => { event.preventDefault(); decide(true); }}>
    <div className="grid gap-2"><Label htmlFor="mcp-project">Progetto da collegare</Label>
      <SelectField id="mcp-project" value={project} onValueChange={setProject} disabled={pending || completed || !!initialProject || !projects.length} options={projects.map(item => ({ value: item.id, label: item.name }))} />
      {initialProject ? <p className="text-sm text-muted-foreground">Client già associato a questo progetto. Per cambiarlo, revoca prima il collegamento dalle impostazioni del progetto.</p> : null}
      {!projects.length ? <p className="text-sm text-muted-foreground">Crea un progetto nella dashboard, poi riavvia il collegamento da Codex.</p> : null}
    </div>
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={!project || pending || completed}>{pending ? <><span className="sr-only">Collegamento in corso</span><Skeleton className="h-4 w-36 bg-current opacity-30" /></> : 'Autorizza sola lettura'}</Button><Button type="button" variant="outline" disabled={pending || completed} onClick={() => decide(false)}>Rifiuta</Button></div>
  </form>;
}
