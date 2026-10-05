
import { BrandLogo } from '@/components/brand-logo';
import { ToastProvider, useNotify } from '@/components/ui/toast';
import { ReviewStartSkeleton } from '@/components/loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { pattern, type Environment } from '@/lib/session';
import { Button } from '@/components/ui/button';
import '@/entrypoints/popup/style.css';
import './style.css';

function ReviewStart() {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const setStatus = useNotify();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void browser.runtime.sendMessage({ type: 'REPORTY_GUEST_START' }).then(result => {
    if (!result?.ok) throw new Error(result?.error ?? 'Invito non disponibile.');
    setEnvironment(result.data);
  }).catch(error => setStatus(error.message)).finally(() => setLoading(false)); }, []);
  async function start() {
    if (!environment || busy) return;
    setBusy(true); setStatus('');
    try {
      const allowed = await browser.permissions.request({ origins: [pattern(environment.origin)] });
      if (!allowed) throw new Error('Accesso non concesso. Consenti l’accesso per usare Reporty sul sito.');
      const result = await browser.runtime.sendMessage({ type: 'REPORTY_GUEST_START', activate: true });
      if (!result?.ok) throw new Error(result?.error ?? 'Avvio non riuscito.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Avvio non riuscito.'); setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center px-6 py-10"><div className="w-full max-w-lg space-y-5 text-center"><BrandLogo /><section className="space-y-4 rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">Un ultimo passaggio per iniziare</h1><p className="text-sm text-muted-foreground">Il collegamento è pronto. Consenti a Reporty di mostrare i commenti sul sito: il browser chiederà il permesso solo per questo dominio.</p>{environment ? <><p className="font-medium">{environment.projectName} · {environment.name}</p><p className="break-all text-sm text-muted-foreground">{environment.origin}</p><Button disabled={busy} onClick={() => void start()}>{busy ? <Skeleton className="h-4 w-32 bg-current opacity-30" /> : 'Consenti e apri il sito'}</Button></> : null}{loading ? <ReviewStartSkeleton /> : null}</section></div></main>;
}
createRoot(document.getElementById('root')!).render(<ToastProvider><ReviewStart /></ToastProvider>);
