
import { BrandLogo } from '@/components/brand-logo';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signInWithGoogle } from './actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FeedbackToast } from '@/components/feedback-toast';
import { SubmitButton } from '@/components/submit-button';

const messages: Record<string, string> = {
  'google-error': 'Accesso Google non disponibile. Riprova tra poco.',
  'callback-error': 'Accesso non riuscito. Riprova con Google.',
};

export default async function Login({ searchParams }: {
  searchParams: Promise<{ message?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims && !data.claims.is_anonymous) {
    redirect('/dashboard');
  }
  const { message } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md px-6 py-20">
      <BrandLogo className="mb-8" />
      <Card>
      <CardHeader><CardTitle><h1 className="text-2xl">Accedi al tuo workspace</h1></CardTitle><CardDescription>Rivedi i siti e collabora sulle segnalazioni.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
      {message && messages[message] ? <FeedbackToast message={messages[message]} type="error" /> : null}
      <form action={signInWithGoogle}>
        <div className="grid"><SubmitButton variant="outline" pendingLabel="Accesso…">Continua con Google</SubmitButton></div>
      </form>
      </CardContent></Card>
    </main>
  );
}
