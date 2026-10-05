'use client';

import { useActionState } from 'react';
import { FeedbackToast } from '@/components/feedback-toast';
import { useToastManager } from '@/components/ui/toast';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { saveReviewLink } from './review-link-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ReviewLinkForm({ projectId, environments, link, environmentId }: { projectId: string; environments: { id: string; name: string }[]; link?: string; environmentId?: string }) {
  const [state, action, pending] = useActionState(saveReviewLink, {});
  const toast = useToastManager();
  return <div className="space-y-4">
    <form action={action} className="space-y-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-2"><Label htmlFor="review-environment">Ambiente di avvio per gli ospiti</Label><select key={environmentId} id="review-environment" name="environmentId" defaultValue={environmentId ?? environments[0]?.id} required className="rounded-lg border bg-background p-2 text-sm">{environments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || !environments.length}>{link ? 'Salva ambiente di avvio' : 'Crea link del progetto'}</Button>{link ? <Button type="submit" variant="outline" name="regenerate" value="true" disabled={pending || !environments.length} onClick={event => { if (!window.confirm('Rigenerare il link? Il link precedente e gli accessi ospite associati saranno revocati.')) event.preventDefault(); }}>Rigenera link</Button> : null}</div>
    </form>
    {link ? <div className="grid gap-2"><Label htmlFor="review-link">Link da passare al guest</Label><div className="flex gap-2"><Input id="review-link" value={link} readOnly /><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link); toast.add({ title: 'Link copiato', type: 'success' }); } catch { toast.add({ title: 'Copia non disponibile', description: 'Seleziona e copia il link dal campo.', type: 'error' }); } }}>Copia link</Button></div></div> : null}
    {!environments.length ? <p className="text-sm text-muted-foreground">Aggiungi un ambiente per creare il link.</p> : null}
    {pending ? <LoadingSkeleton /> : null}
    <FeedbackToast eventKey={state} message={state.error ?? state.success} type={state.error ? 'error' : 'success'} />
  </div>;
}
