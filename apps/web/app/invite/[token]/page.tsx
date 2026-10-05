import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { validToken } from '@/lib/invitation-token';
import { acceptInvitation, switchInviteAccount } from './actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';

export default async function Invite({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ message?: string }>;
}) {
  const { token } = await params;
  if (!validToken(token)) notFound();
  const supabase = await createClient();
  const [{ data }, { message }] = await Promise.all([supabase.auth.getClaims(), searchParams]);
  const loggedIn = data?.claims && !data.claims.is_anonymous;
  return <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-20">
    <Link href="/" className="text-xl font-semibold">Reporty</Link>
    <Card><CardHeader><CardTitle>Invito al progetto</CardTitle><CardDescription>Accedi con l’indirizzo email a cui è stato destinato questo invito, poi conferma per entrare nel progetto.</CardDescription></CardHeader><CardContent className="space-y-5">
      {message === 'invalid' ? <Alert variant="destructive"><AlertDescription>L’invito non è valido, è stato revocato o l’email del tuo account non corrisponde a quella invitata.</AlertDescription></Alert> : null}
      {message === 'signout-error' ? <Alert variant="destructive"><AlertDescription>Uscita non riuscita. Riprova.</AlertDescription></Alert> : null}
      {loggedIn ? <p className="break-all text-sm text-muted-foreground">Account: {String(data.claims.email ?? '')}</p> : null}
      <form action={acceptInvitation}><input type="hidden" name="token" value={token} /><SubmitButton pendingLabel="Verifica…">{loggedIn ? 'Accetta invito' : 'Accedi per accettare'}</SubmitButton></form>
      {loggedIn ? <form action={switchInviteAccount}><input type="hidden" name="token" value={token} /><Button type="submit" variant="outline">Esci per cambiare account</Button></form> : null}
    </CardContent></Card>
  </main>;
}
