import { useEffect, useState } from 'react';
import { apiOrigin, pattern, type Context, type Sites, type Site } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

async function command(message: object) {
  const response = await browser.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error ?? 'Operazione non riuscita.');
  return response.data;
}

export default function App() {
  const [context, setContext] = useState<Context | null>(null);
  const [sites, setSites] = useState<Sites>({});
  const [tab, setTab] = useState<{ id: number; origin: string } | null>(null);
  const [environmentId, setEnvironmentId] = useState('');
  const [position, setPosition] = useState<Site['position']>('bottom_right');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  async function load() {
    const [state, tabs] = await Promise.all([command({ type: 'REPORTY_STATE' }), browser.tabs.query({ active: true, currentWindow: true })]);
    setContext(state.context); setSites(state.sites);
    const active = tabs[0];
    if (active?.id !== undefined && active.url && /^https?:/.test(active.url)) {
      const origin = new URL(active.url).origin;
      setTab({ id: active.id, origin });
      const existing = state.sites[origin] as Site | undefined;
      setEnvironmentId(existing?.environmentId ?? state.context?.environments.find((item: { origin: string }) => item.origin === origin)?.id ?? '');
      setPosition(existing?.position ?? 'bottom_right');
    }
  }
  useEffect(() => { void load().catch(error => setStatus(error.message)).finally(() => setLoading(false)); }, []);
  async function run(work: () => Promise<void>) {
    setLoading(true); setStatus('');
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'); }
    finally { setLoading(false); }
  }
  const environments = context?.environments.filter(environment => environment.origin === tab?.origin) ?? [];
  const enabled = tab ? !!sites[tab.origin] : false;
  async function save(enabled: boolean) {
    if (!tab) return;
    // Request optional host access directly from the user's click.
    const granted = !enabled || await browser.permissions.request({ origins: [pattern(tab.origin)] });
    if (!granted) { setStatus('Accesso al sito non concesso.'); return; }
    await run(async () => {
      await command({ type: 'REPORTY_SITE', tabId: tab.id, environmentId, position, enabled });
      await load(); setStatus(enabled ? 'Estensione attiva sul sito.' : 'Estensione disattivata sul sito.');
    });
  }
  return <main className="space-y-4 p-4">
    <header className="flex items-center justify-between"><h1 className="text-xl font-semibold">Reporty</h1>{context?.kind !== 'guest' ? <a href={apiOrigin} target="_blank" rel="noreferrer" className="text-xs underline">Apri piattaforma</a> : null}</header>
    <Card><CardHeader><CardTitle>{context ? context.kind === 'guest' ? 'Revisore ospite' : 'Account del team' : 'Collega il tuo account'}</CardTitle><CardDescription>{context?.displayName ?? 'Accedi al team o apri un invito cliente nel browser, poi collega l’estensione.'}</CardDescription></CardHeader><CardContent className="space-y-3">
      <Button disabled={loading} className="w-full" onClick={() => void run(async () => { await command({ type: 'REPORTY_START_CONNECTION' }); window.close(); })}>{context ? 'Cambia collegamento' : 'Collega'}</Button>
      {context ? <Button disabled={loading} variant="outline" className="w-full" onClick={() => void run(async () => { await command({ type: 'REPORTY_DISCONNECT' }); await load(); })}>Scollega</Button> : null}
    </CardContent></Card>
    {context ? <Card><CardHeader><CardTitle>Sito corrente</CardTitle><CardDescription className="break-all">{tab?.origin ?? 'Apri una pagina HTTP o HTTPS.'}</CardDescription></CardHeader><CardContent className="space-y-4">
      {environments.length ? <>
        <div className="grid gap-2"><Label htmlFor="environment">Progetto e ambiente</Label><select id="environment" className="h-9 rounded-lg border bg-background px-2 text-sm" value={environmentId} onChange={event => setEnvironmentId(event.target.value)}>{environments.map(environment => <option key={environment.id} value={environment.id}>{environment.projectName} · {environment.name}</option>)}</select></div>
        <div className="grid gap-2"><Label htmlFor="position">Posizione del pulsante</Label><select id="position" className="h-9 rounded-lg border bg-background px-2 text-sm" value={position} onChange={event => setPosition(event.target.value as Site['position'])}><option value="bottom_right">In basso a destra</option><option value="bottom_left">In basso a sinistra</option><option value="top_right">In alto a destra</option><option value="top_left">In alto a sinistra</option></select></div>
        <Button disabled={loading} className="w-full" onClick={() => void save(true)}>{enabled ? 'Salva impostazioni' : 'Abilita su questo sito'}</Button>
        {enabled ? <Button disabled={loading} variant="outline" className="w-full" onClick={() => void save(false)}>Disabilita su questo sito</Button> : null}
      </> : <p className="text-sm text-muted-foreground">Questo sito non è tra gli ambienti accessibili. Chiedi all’amministratore di aggiungerlo al progetto.</p>}
    </CardContent></Card> : null}
    {context?.environments.length ? <section className="space-y-2" aria-label="Ambienti accessibili"><h2 className="text-sm font-medium">Siti da revisionare</h2>{context.environments.map(environment => <a key={environment.id} href={environment.origin} target="_blank" rel="noreferrer" className="block rounded-lg border px-3 py-2 text-sm hover:bg-accent">{environment.projectName} · {environment.name}<span className="block break-all text-xs text-muted-foreground">{environment.origin}</span></a>)}</section> : null}
    <p role="status" className="text-sm text-muted-foreground">{loading ? 'Caricamento…' : status}</p>
  </main>;
}
