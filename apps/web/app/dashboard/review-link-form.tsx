'use client';

import { useActionState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { FeedbackToast } from '@/components/feedback-toast';
import { useToastManager } from '@/components/ui/toast';
import { saveReviewLink } from './review-link-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ReviewLinkForm({ projectId, link, environmentId }: { projectId: string; link: string; environmentId: string }) {
  const [state, action, pending] = useActionState(saveReviewLink, {});
  const toast = useToastManager();
  return <div className="space-y-3 border-t pt-4">
    <div className="grid gap-2"><Label htmlFor={`review-link-${environmentId}`}>Link da passare al guest</Label><div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1" id={`review-link-${environmentId}`} value={link} readOnly /><Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link); toast.add({ title: 'Link copiato', type: 'success' }); } catch { toast.add({ title: 'Copia non disponibile', description: 'Seleziona e copia il link dal campo.', type: 'error' }); } }}><Copy className="size-4" aria-hidden="true" />Copia link</Button>
      <form action={action}>
        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="environmentId" value={environmentId} />
        <Button type="submit" variant="outline" disabled={pending} onClick={event => { if (!window.confirm('Rigenerare il link di questo ambiente? Il precedente link e gli accessi ospite associati saranno revocati.')) event.preventDefault(); }} aria-busy={pending}>{pending ? <Skeleton className="h-4 w-24 bg-current opacity-30" /> : <><RefreshCw className="size-4" aria-hidden="true" />Rigenera link</>}</Button>
      </form>
    </div></div>

    <FeedbackToast eventKey={state} message={state.error ?? state.success} type={state.error ? 'error' : 'success'} />
  </div>;
}
