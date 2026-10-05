import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { sendMagicLink, signInWithGoogle } from './actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubmitButton } from '@/components/submit-button';
import { cookies } from 'next/headers';
import { validToken } from '@/lib/invitation-token';

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
    const invitation = (await cookies()).get('reporty_pending_invite')?.value;
    redirect(invitation && validToken(invitation) ? `/invite/${invitation}` : '/dashboard');
  }
  const { message } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-md px-6 py-20">
      <p className="mb-8 text-xl font-semibold">Reporty</p>
      <Card>
      <CardHeader><CardTitle><h1 className="text-2xl">Accedi al tuo workspace</h1></CardTitle><CardDescription>Rivedi i siti e collabora sulle segnalazioni.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
      {message && messages[message] ? <Alert role="status"><AlertDescription>{messages[message]}</AlertDescription></Alert> : null}
      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" className="w-full">Continua con Google</Button>
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
