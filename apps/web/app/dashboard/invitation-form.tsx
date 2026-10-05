'use client';

import { useActionState, useState } from 'react';
import { createInvitation, revokeInvitation } from './invitation-actions';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function InvitationForm({ projectId, kind }: { projectId: string; kind: 'member' | 'guest' }) {
  const [state, action] = useActionState(createInvitation, {});
  const [copyStatus, setCopyStatus] = useState('');
  return <div className="space-y-4">
    <form action={action} className="grid gap-3">
      <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="kind" value={kind} />
      {kind === 'member' ? <div className="grid gap-2"><Label htmlFor="invite-email">Email del membro</Label><Input id="invite-email" name="email" type="email" required maxLength={254} placeholder="nome@azienda.it" /></div> : null}
      <div><SubmitButton pendingLabel="Creazione…">{kind === 'member' ? 'Crea invito membro' : 'Crea link ospite'}</SubmitButton></div>
    </form>
    {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    {state.link ? <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
      <Label htmlFor={`link-${kind}`}>Link da condividere</Label><Input id={`link-${kind}`} readOnly value={state.link} onFocus={event => event.target.select()} />
      <Button type="button" variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(state.link!); setCopyStatus('Link copiato.'); }
        catch { setCopyStatus('Seleziona e copia il link dal campo.'); }
      }}>Copia link</Button>
      <p role="status" className="text-sm">{copyStatus}</p>
      <p className="text-xs text-muted-foreground">Conserva questo link: dopo aver lasciato la pagina non sarà recuperabile. Puoi crearne un altro e revocare il precedente.</p>
    </div> : null}
  </div>;
}

export function RevokeInvitation({ projectId, invitationId, kind }: { projectId: string; invitationId: string; kind: 'member' | 'guest' }) {
  const [state, action] = useActionState(revokeInvitation, {});
  return <div><form action={action}>
    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="invitationId" value={invitationId} /><input type="hidden" name="kind" value={kind} />
    <SubmitButton pendingLabel="Revoca…">Revoca invito</SubmitButton>
  </form>{state.error || state.success ? <p role="status" className="mt-2 text-sm">{state.error ?? state.success}</p> : null}</div>;
}
