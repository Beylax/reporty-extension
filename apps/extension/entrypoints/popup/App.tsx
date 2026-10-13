import { openerPositionOptions } from '@/lib/opener-position';
import { SelectField } from '@/components/ui/select';
import { ThemeSwitch } from '@/components/theme-switch';

import { BrandLogo } from '@/components/brand-logo';
import { useNotify } from '@/components/ui/toast';
import { PopupSkeleton } from '@/components/loading-skeletons';
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
  const setStatus = useNotify();
  async function load() {
    const [state, tabs] = await Promise.all([command({ type: 'REPORTY_STATE' }), browser.tabs.query({ active: true, currentWindow: true })]);
    setContext(state.context); setSites(state.sites);
    const active = tabs[0];
    if (active?.id !== undefined && active.url && /^https?:/.test(active.url)) {
      const origin = new URL(active.url).origin;
      setTab({ id: active.id, origin });
      const existing = state.sites[origin] as Site | undefined;
      const matching = state.context?.environments.filter((item: { origin: string }) => item.origin === origin) ?? [];
      setEnvironmentId(matching.find((item: { id: string }) => item.id === existing?.environmentId)?.id ?? matching[0]?.id ?? '');
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
    // Begin activation before the permissions dialog can close the popup.
    const activation = command({ type: 'REPORTY_SITE', tabId: tab.id, environmentId, position, enabled }).then(() => null, error => error as Error);
    const granted = !enabled || await browser.permissions.request({ origins: [pattern(tab.origin)] });
    if (!granted) { await activation.catch(() => undefined); setStatus('Accesso al sito non concesso.'); return; }
    await run(async () => {
      const error = await activation;
      if (error) throw error;
      if (enabled) await command({ type: 'REPORTY_APPLY_SITE', tabId: tab.id });
      await load(); setStatus(enabled ? 'Estensione attiva sul sito.' : 'Estensione disattivata sul sito.', 'success');
    });
  }
  return <main className="space-y-4 p-4">
    <header className="flex items-center justify-between"><h1><BrandLogo /></h1><ThemeSwitch />{context?.kind !== 'guest' ? <a href={apiOrigin} target="_blank" rel="noreferrer" className="text-xs underline">Apri piattaforma</a> : null}</header>
    {!loading && context ? <Card><CardHeader><CardTitle>Sito corrente</CardTitle><CardDescription className="break-all">{tab?.origin ?? 'Apri una pagina HTTP o HTTPS.'}</CardDescription></CardHeader><CardContent className="space-y-4">
      {environments.length ? <>
        <div className="rounded-lg bg-muted p-3"><p className="font-medium">{environments.find(environment => environment.id === environmentId)?.projectName}</p><p className="text-xs text-muted-foreground">{environments.find(environment => environment.id === environmentId)?.name}</p></div>
        <div className="grid gap-2"><Label htmlFor="position">Posizione del pulsante</Label><SelectField id="position" value={position} onValueChange={value => setPosition(value as Site['position'])} options={openerPositionOptions} /></div>
        <Button disabled={loading} className="w-full" onClick={() => void save(true).catch(error => setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'))}>{enabled ? 'Salva impostazioni' : 'Abilita su questo sito'}</Button>
        {enabled ? <Button disabled={loading} variant="outline" className="w-full" onClick={() => void save(false).catch(error => setStatus(error instanceof Error ? error.message : 'Operazione non riuscita.'))}>Disabilita su questo sito</Button> : null}
      </> : <p className="text-sm text-muted-foreground">Questo sito non è tra gli ambienti accessibili. Chiedi all’amministratore di aggiungerlo al progetto.</p>}
    </CardContent></Card> : null}
    {!loading ? <Card><CardHeader><CardTitle>{context ? context.kind === 'guest' ? 'Revisore ospite' : 'Account del team' : 'Collega il tuo account'}</CardTitle><CardDescription>{context ? context.displayName ?? 'Consultazione senza nome. Il nome verrà richiesto alla prima azione.' : 'Accedi al team o apri un invito cliente nel browser, poi collega l’estensione.'}</CardDescription></CardHeader><CardContent className="space-y-3">
      <Button disabled={loading} className="w-full" onClick={() => void run(async () => { await command({ type: 'REPORTY_START_CONNECTION' }); window.close(); })}>{context ? 'Cambia collegamento' : 'Collega'}</Button>
      {context ? <Button disabled={loading} variant="outline" className="w-full" onClick={() => void run(async () => { await command({ type: 'REPORTY_DISCONNECT' }); await load(); setStatus('Sito scollegato.', 'success'); })}>Scollega</Button> : null}
    </CardContent></Card> : null}
    {loading ? <PopupSkeleton /> : null}
  </main>;
}
