import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isUuid } from '@reporty/shared';
import { createClient } from '@/lib/supabase/server';
import { BrandLogo } from '@/components/brand-logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConsentForm } from './consent-form';

export const metadata = { robots: { index: false, follow: false } };

export default async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId || !isUuid(authorizationId)) return <ConsentUnavailable />;
  const supabase = await createClient();
  const { data: identity } = await supabase.auth.getClaims();
  if (!identity?.claims || identity.claims.is_anonymous || identity.claims.client_id) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
  const [authorization, projects] = await Promise.all([
    supabase.auth.oauth.getAuthorizationDetails(authorizationId),
    supabase.from('projects').select('id,name').order('name'),
  ]);
  if (authorization.error || !authorization.data || projects.error) return <ConsentUnavailable />;
  const details = authorization.data;
  if ('redirect_url' in details) redirect(details.redirect_url);
  if (details.user.id !== identity.claims.sub) return <ConsentUnavailable />;
  const connection = await supabase.from('mcp_connections').select('project_id').eq('client_id', details.client.id).eq('user_id', identity.claims.sub).is('revoked_at', null).maybeSingle();
  if (connection.error) return <ConsentUnavailable />;
  return <main className="mx-auto w-full max-w-xl px-6 py-16"><BrandLogo className="mb-8" /><Card>
    <CardHeader><CardTitle><h1 className="text-2xl">Collega {details.client.name || 'il client MCP'} a Reporty</h1></CardTitle><CardDescription>Accesso come {identity.claims.email as string}. Autorizzi soltanto il progetto selezionato.</CardDescription></CardHeader>
    <CardContent className="space-y-6"><div className="rounded-lg border bg-muted/40 p-4 text-sm"><p className="font-medium">Permessi di sola lettura</p><p className="mt-2 text-muted-foreground">Il client potrà leggere segnalazioni, risposte, contesto della pagina, screenshot e file allegati di tutti gli ambienti del progetto. Potrai revocare l’accesso dalle impostazioni del progetto.</p></div>
      <ConsentForm authorizationId={authorizationId} projects={projects.data ?? []} initialProject={connection.data?.project_id} />
    </CardContent></Card></main>;
}
function ConsentUnavailable() {
  return <main className="mx-auto w-full max-w-xl px-6 py-16"><BrandLogo className="mb-8" /><Card><CardHeader><CardTitle><h1>Collegamento non disponibile</h1></CardTitle><CardDescription>La richiesta è scaduta oppure OAuth non è ancora configurato. Riavvia il collegamento da Codex dopo aver configurato Reporty.</CardDescription></CardHeader><CardContent><Link href="/dashboard">Torna alla dashboard</Link></CardContent></Card></main>;
}
