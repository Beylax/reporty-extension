import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@reporty/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ConnectButton } from './connect-button';

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ extensionId?: string; nonce?: string; projectId?: string }> }) {
  const { extensionId, nonce, projectId } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const member = data?.claims && !data.claims.is_anonymous;
  let guests: { projectId: string; name: string }[] = [];
  if (!projectId) {
    const guestCookies = (await cookies()).getAll().filter(cookie => cookie.name.startsWith('reporty_guest_'));
    guests = (await Promise.all(guestCookies.map(async cookie => {
      const { data } = await supabase.rpc('get_guest_session', { secret: cookie.value });
      return data?.[0] ? { projectId: data[0].project_id as string, name: data[0].project_name as string } : null;
    }))).filter((guest): guest is { projectId: string; name: string } => guest !== null);
  }
  const valid = extensionId && /^[a-p]{32}$/.test(extensionId) && nonce && /^[0-9a-f]{64}$/.test(nonce) && (!projectId || isUuid(projectId));
  return <main className="mx-auto max-w-lg space-y-6 px-6 py-20"><p className="text-xl font-semibold">Reporty</p><Card><CardHeader><CardTitle>Collega l’estensione</CardTitle><CardDescription>La sessione scelta sarà disponibile nell’estensione di questo browser.</CardDescription></CardHeader><CardContent className="space-y-5">
    {!valid ? <p>Apri questa pagina dal pulsante Collega nell’estensione.</p> : <>
      {projectId ? <ConnectButton extensionId={extensionId} nonce={nonce} projectId={projectId} /> : <>
        {member ? <div className="space-y-3"><p className="text-sm">Account del team: {String(data.claims.email ?? '')}</p><ConnectButton extensionId={extensionId} nonce={nonce} /></div> : <Link href="/login" className="underline">Accedi come membro del team</Link>}
        {guests.map(guest => <Link key={guest.projectId} className="block rounded-lg border p-3 text-sm hover:bg-accent" href={`/extension/connect?extensionId=${extensionId}&nonce=${nonce}&projectId=${guest.projectId}`}>Collega come ospite di {guest.name} →</Link>)}
        {!guests.length ? <p className="text-sm text-muted-foreground">Se sei un cliente, apri prima il link di invito e inserisci il nome. Poi torna al pulsante Collega nell’estensione.</p> : null}
      </>}
    </>}
  </CardContent></Card></main>;
}
