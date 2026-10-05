import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { validToken } from '@/lib/invitation-token';
import { ReviewForm } from './review-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FeedbackToast } from '@/components/feedback-toast';

export default async function GuestInvite({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ message?: string }>;
}) {
  const { token } = await params;
  if (!validToken(token)) notFound();
  const supabase = await createClient();
  const [{ data, error }, { message }] = await Promise.all([
    supabase.rpc('preview_guest_review', { secret: token }), searchParams,
  ]);
  const project = data?.[0];
  if (error || !project) return <main className="mx-auto max-w-lg px-6 py-20"><FeedbackToast message={'Questo invito non è disponibile. Chiedi all’amministratore un nuovo link.'} /></main>;
  return <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-20"><p className="text-xl font-semibold">Reporty</p>
    <Card><CardHeader><CardTitle>Revisiona {project.project_name}</CardTitle><CardDescription>Inserisci il nome e inizia la revisione. Reporty è già installato nel tuo browser.</CardDescription></CardHeader><CardContent className="space-y-5">
      {message ? <FeedbackToast message={message === 'invalid-name' ? 'Inserisci un nome da 1 a 80 caratteri.' : 'Accesso non riuscito. Il link potrebbe essere stato revocato.'} /> : null}
      <p className="text-sm text-muted-foreground">{project.environment_name} · {project.origin}</p><ReviewForm token={token} />
    </CardContent></Card>
  </main>;
}
