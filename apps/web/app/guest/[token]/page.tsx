import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { validToken } from '@/lib/invitation-token';
import { joinAsGuest } from './actions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubmitButton } from '@/components/submit-button';

export default async function GuestInvite({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ message?: string }>;
}) {
  const { token } = await params;
  if (!validToken(token)) notFound();
  const supabase = await createClient();
  const [{ data, error }, { message }] = await Promise.all([
    supabase.rpc('preview_guest_invite', { secret: token }), searchParams,
  ]);
  const project = data?.[0];
  if (error || !project) return <main className="mx-auto max-w-lg px-6 py-20"><Alert variant="destructive"><AlertDescription>Questo invito non è disponibile. Chiedi all’amministratore un nuovo link.</AlertDescription></Alert></main>;
  return <main className="mx-auto w-full max-w-lg space-y-6 px-6 py-20"><p className="text-xl font-semibold">Reporty</p>
    <Card><CardHeader><CardTitle>Revisiona {project.project_name}</CardTitle><CardDescription>Entra come Designer ospite, senza creare un account.</CardDescription></CardHeader><CardContent className="space-y-5">
      {message ? <Alert variant="destructive"><AlertDescription>{message === 'invalid-name' ? 'Inserisci un nome da 1 a 80 caratteri.' : 'Accesso non riuscito. Il link potrebbe essere stato revocato.'}</AlertDescription></Alert> : null}
      <form action={joinAsGuest} className="grid gap-4"><input type="hidden" name="token" value={token} /><div className="grid gap-2"><Label htmlFor="guest-name">Il tuo nome</Label><Input id="guest-name" name="name" autoComplete="name" maxLength={80} required placeholder="Come ti chiami?" /></div><SubmitButton pendingLabel="Accesso…">Entra come ospite</SubmitButton></form>
    </CardContent></Card>
  </main>;
}
