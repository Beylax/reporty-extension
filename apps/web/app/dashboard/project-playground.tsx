'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { ExternalLink, MonitorPlay, RotateCw, X } from 'lucide-react';
import { getPageContext } from '@reporty/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToastManager } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { getReportPage } from './report-actions';
import { PlaygroundReports } from './playground-reports';
import { PlaygroundFrame } from './playground-frame';
import { isViewportDimension, playgroundUrl, viewportPresets, type PlaygroundEnvironment, type Viewport } from '@/lib/playground';

type PageTab = { visited: boolean; id: string; src: string; url: string; viewport: Viewport; connected: boolean; reload: number; requestedReport?: { id: string; requestId: string } };
function makeTab(url: string): PageTab {
  return { visited: false, id: crypto.randomUUID(), src: url, url, viewport: { width: 1440, height: 900 }, connected: false, reload: 0 };
}

export default function ProjectPlayground({ projectName, environments, onClose }: { projectName: string; environments: PlaygroundEnvironment[]; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? '');
  const environment = environments.find(item => item.id === environmentId);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { opened.current = true; setOpen(true); });
    return () => cancelAnimationFrame(frame);
  }, []);
  return <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={value => { if (!value && opened.current) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ease-out data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" /><Dialog.Popup className="fixed inset-0 z-50 flex h-dvh min-h-0 flex-col bg-background text-foreground outline-none transition-[opacity,scale,translate] duration-200 ease-out data-[starting-style]:translate-y-3 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[ending-style]:translate-y-3 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 motion-reduce:transition-none motion-reduce:transform-none">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
        <MonitorPlay className="size-5 text-primary" aria-hidden="true" />
        <Dialog.Title className="min-w-0 truncate font-semibold">Playground · {projectName}</Dialog.Title>
        <label className="ml-auto flex items-center gap-2 text-sm"><span className="sr-only sm:not-sr-only">Ambiente</span><select aria-label="Ambiente del playground" className="h-9 max-w-48 rounded-lg border bg-background px-3" value={environmentId} onChange={event => setEnvironmentId(event.target.value)}>{environments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <Dialog.Close render={<Button variant="outline" size="icon" aria-label="Chiudi playground" />}><X aria-hidden="true" /></Dialog.Close>
      </header>
      <Dialog.Description className="sr-only">Sfoglia le pagine del progetto, modifica la viewport e gestisci le segnalazioni con il widget Reporty installato sul sito.</Dialog.Description>
      {environment ? <EnvironmentPlayground key={environment.id} environment={environment} /> : <p className="p-6 text-muted-foreground">Aggiungi un ambiente per aprire il playground.</p>}
    </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}

function EnvironmentPlayground({ environment }: { environment: PlaygroundEnvironment }) {
  const [tabs, setTabs] = useState<PageTab[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const toast = useToastManager();
  const active = tabs.find(tab => tab.id === activeId);
  const loadError = useEffectEvent((error: unknown) => toast.add({ title: 'Pagine non disponibili', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }));
  useEffect(() => {
    let disposed = false;
    void getReportPage(environment.id, { environments: [environment.id], limit: 1 }).then(result => {
      if (disposed) return;
      const pages = result.pages.flatMap(path => { try { return [playgroundUrl(path, environment.origin)]; } catch { return []; } });
      const next = [...new Set(pages.length ? pages : [environment.origin])].map(makeTab);
      next[0].visited = true;
      setTabs(next); setActiveId(next[0].id); setFailed(false);
    }).catch(error => {
      if (disposed) return;
      setFailed(true);
      loadError(error);
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [environment.id, environment.origin, attempt]);
  function update(id: string, change: Partial<PageTab>) { setTabs(items => items.map(item => item.id === id ? { ...item, ...change } : item)); }
  function activateTab(id: string) { setActiveId(id); setTabs(items => items.map(item => item.id === id && !item.visited ? { ...item, visited: true } : item)); }
  function closeTab(id: string) {
    const index = tabs.findIndex(tab => tab.id === id), remaining = tabs.filter(tab => tab.id !== id);
    const nextId = activeId === id ? remaining[Math.min(index, remaining.length - 1)]?.id ?? '' : activeId;
    setTabs(remaining.map(item => item.id === nextId ? { ...item, visited: true } : item));
    setActiveId(nextId);
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    {!environment.enabled || !environment.publicKey ? <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">Per usare pin, creazione e dettagli, installa lo script Reporty sul sito e abilitalo nella tab Ambienti.</p> : null}
    {loading ? <div role="status" aria-label="Caricamento playground" className="flex min-h-0 flex-1 flex-col"><div className="flex gap-2 border-b p-3">{[0,1,2].map(i => <Skeleton key={i} className="h-9 w-40" />)}</div><div className="flex min-h-0 flex-1 gap-4 p-4"><div className="w-72 shrink-0 space-y-4"><Skeleton className="h-9 w-full" />{[0,1,2].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div><Skeleton className="h-full flex-1" /></div></div> : <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <Tabs.Root value={activeId} onValueChange={value => activateTab(String(value))} className="min-w-0 flex-1">
          <Tabs.List aria-label="Pagine del playground" className="flex items-center gap-1 overflow-x-auto">
            {tabs.map(tab => <div key={tab.id} className="flex shrink-0 items-center rounded-lg border bg-background">
              <Tabs.Tab value={tab.id} className="max-w-60 truncate rounded-l-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring data-active:bg-primary/10 data-active:font-semibold data-active:text-primary" title={tab.url}>{getPageContext(tab.url).pagePath}</Tabs.Tab>
              <Button variant="ghost" size="icon-xs" aria-label={`Chiudi pagina ${getPageContext(tab.url).pagePath}`} onClick={() => closeTab(tab.id)}><X aria-hidden="true" /></Button>
            </div>)}
          </Tabs.List>
        </Tabs.Root>
      </div>
      {failed ? <div className="flex items-center gap-3 p-4"><p className="text-sm">Impossibile caricare le pagine.</p><Button variant="outline" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Riprova</Button></div> : null}
      {active ? <ViewportToolbar key={active.id} tab={active} onViewport={viewport => update(active.id, { viewport })} onReload={() => update(active.id, { src: active.url, reload: active.reload + 1, connected: false })} /> : null}
      <div className="flex min-h-0 flex-1 overflow-auto">
        {active ? <aside className="w-72 shrink-0 overflow-y-auto border-r p-4 xl:w-80" aria-label="Segnalazioni della pagina attiva"><PlaygroundReports key={`${environment.id}:${getPageContext(active.url).pagePath}`} environment={environment} pagePath={getPageContext(active.url).pagePath} connected={active.connected} onSelectReport={id => update(active.id, { requestedReport: { id, requestId: crypto.randomUUID() } })} /></aside> : null}
        <div className="flex min-h-0 min-w-80 flex-1 flex-col">
          {tabs.filter(tab => tab.visited).map(tab => <PlaygroundFrame key={tab.id} environment={environment} url={tab.src} viewport={tab.viewport} active={tab.id === activeId} reload={tab.reload} requestedReport={tab.requestedReport} onPage={(url, connected) => setTabs(items => items.map(item => item.id === tab.id && (item.url !== url || item.connected !== connected) ? { ...item, url, connected, requestedReport: item.url !== url ? undefined : item.requestedReport } : item))} />)}
          {!tabs.length ? <p className="p-6 text-sm text-muted-foreground">Nessuna pagina aperta. Riapri il playground o cambia ambiente per caricare nuovamente le pagine.</p> : null}
        </div>
      </div>
    </>}
  </div>;
}

function ViewportToolbar({ tab, onViewport, onReload }: { tab: PageTab; onViewport: (viewport: Viewport) => void; onReload: () => void }) {
  const [width, setWidth] = useState(String(tab.viewport.width)), [height, setHeight] = useState(String(tab.viewport.height));
  const toast = useToastManager();
  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isViewportDimension(Number(width)) || !isViewportDimension(Number(height))) { toast.add({ title: 'Dimensioni non valide', description: 'Inserisci valori interi da 240 a 3840 pixel.', type: 'error' }); return; }
    onViewport({ width: Number(width), height: Number(height) });
  }
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
    <Button variant="outline" size="icon" aria-label="Ricarica pagina" onClick={onReload}><RotateCw aria-hidden="true" /></Button>
    <a href={tab.url} target="_blank" rel="noopener noreferrer" className="mr-auto flex min-w-0 max-w-72 items-center gap-1 rounded-sm text-xs text-muted-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"><span className="truncate">{tab.url}</span><ExternalLink className="size-3 shrink-0" aria-hidden="true" /><span className="sr-only">Apri pagina in una nuova scheda</span></a>
    <div role="group" aria-label="Preset viewport" className="flex gap-1">{viewportPresets.map(preset => <Button key={preset.label} variant={tab.viewport.width === preset.width && tab.viewport.height === preset.height ? 'secondary' : 'ghost'} size="sm" aria-pressed={tab.viewport.width === preset.width && tab.viewport.height === preset.height} onClick={() => { setWidth(String(preset.width)); setHeight(String(preset.height)); onViewport({ width: preset.width, height: preset.height }); }}>{preset.label}</Button>)}</div>
    <form onSubmit={apply} className="flex items-center gap-2"><Input aria-label="Larghezza viewport in pixel" className="w-20" type="number" min={240} max={3840} step={1} value={width} onChange={event => setWidth(event.target.value)} required /><span aria-hidden="true">×</span><Input aria-label="Altezza viewport in pixel" className="w-20" type="number" min={240} max={3840} step={1} value={height} onChange={event => setHeight(event.target.value)} required /><Button type="submit" variant="outline" size="sm">Applica</Button></form>
  </div>;
}
