import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { sendMagicLink, signInWithGoogle } from './actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FeedbackToast } from '@/components/feedback-toast';
import { SubmitButton } from '@/components/submit-button';

const messages: Record<string, string> = {
  'email-sent': 'Controlla la tua email: ti abbiamo inviato un link di accesso.',
  'invalid-email': 'Inserisci un indirizzo email valido.',
  'email-error': 'Invio non riuscito. Riprova tra poco.',
  'google-error': 'Accesso Google non disponibile. Riprova o usa la tua email.',
  'callback-error': 'Il link non è valido o è scaduto. Richiedi un nuovo accesso.',
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
      <p className="mb-8 text-xl font-semibold">Reporty</p>
      <Card>
      <CardHeader><CardTitle><h1 className="text-2xl">Accedi al tuo workspace</h1></CardTitle><CardDescription>Rivedi i siti e collabora sulle segnalazioni.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
      {message && messages[message] ? <FeedbackToast message={messages[message]} type={message === 'email-sent' ? 'success' : 'error'} /> : null}
      <form action={signInWithGoogle}>
        <div className="grid"><SubmitButton variant="outline" pendingLabel="Accesso…">Continua con Google</SubmitButton></div>
      </form>
      <p className="text-center text-sm text-muted-foreground">oppure con email</p>
      <form action={sendMagicLink} className="grid gap-3">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nome@azienda.it" />
        <SubmitButton pendingLabel="Invio…">Invia link di accesso</SubmitButton>
      </form>
      </CardContent></Card>
    </main>
  );
}
