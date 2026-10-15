'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { isUuid } from '@reporty/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToastManager } from '@/components/ui/toast';
import { capturePlaygroundFrame } from '@/lib/playground-capture';
import { isPlaygroundMessage, playgroundUrl, type PlaygroundEnvironment, type Viewport } from '@/lib/playground';

export function PlaygroundFrame({ environment, url, viewport, active, reload, requestedReport, onPage }: {
  environment: PlaygroundEnvironment; url: string; viewport: Viewport; active: boolean; reload: number;
  requestedReport?: { id: string; requestId: string };
  onPage: (url: string, connected: boolean) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [nonce] = useState(() => crypto.randomUUID());
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const [loadedRevision, setLoadedRevision] = useState(-1);
  const [connected, setConnected] = useState(false);
  const [capture, setCapture] = useState<{ requestId: string; url: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const captureLock = useRef(false);
  const sentSelection = useRef('');
  const currentUrl = useRef(url);
  const generation = useRef(0);
  const toast = useToastManager();
  const notifyPage = useEffectEvent(onPage);
  const scale = available.width && available.height ? Math.min(1, available.width / viewport.width, available.height / viewport.height) : 0;
  const post = useCallback((data: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ ...data, nonce }, environment.origin);
  }, [environment.origin, nonce]);
  function cancelCapture(message: string) {
    if (capture) generation.current++;
    if (capture) post({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', requestId: capture.requestId, error: message });
    setCapture(null);
  }
  const cancelFromEffect = useEffectEvent(cancelCapture);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailable({ width: Math.max(0, entry.contentRect.width - 32), height: Math.max(0, entry.contentRect.height - 32) }));
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active) {
      generation.current++;
      const timer = setTimeout(() => cancelFromEffect('Cattura annullata: hai cambiato tab.'), 0);
      return () => clearTimeout(timer);
    }
  }, [active]);
  useEffect(() => {
    let lastSeen = Date.now();
    const lifetime = generation;
    function connect() {
      post({ type: 'REPORTY_PLAYGROUND_CONNECT', key: environment.publicKey });
      if (lastSeen && Date.now() - lastSeen > 6000) {
        setConnected(false);
        notifyPage(currentUrl.current, false);
        cancelFromEffect('Collegamento al widget interrotto.');
      }
    }
    function receive(event: MessageEvent) {
      if (!frame.current || !isPlaygroundMessage(event, frame.current, environment.origin, nonce)) return;
      const data = event.data;
      if (data.type === 'REPORTY_PLAYGROUND_PAGE' && data.key === environment.publicKey && typeof data.url === 'string' && data.url.length <= 8192 && typeof data.enabled === 'boolean') {
        try {
          const next = playgroundUrl(data.url, environment.origin);
          if (currentUrl.current !== next) { generation.current++; cancelFromEffect('La pagina è cambiata. Ripeti la cattura.'); }
          currentUrl.current = next;
          if (!data.enabled) cancelFromEffect('Widget disabilitato.');
          lastSeen = Date.now();
          setConnected(data.enabled);
          notifyPage(next, data.enabled);
        } catch { /* Ignore metadata outside the selected environment. */ }
      }
      if (data.type === 'REPORTY_PLAYGROUND_CAPTURE' && active && isUuid(data.requestId)) {
        if (captureLock.current) {
          post({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', requestId: data.requestId, error: 'Una cattura è già in corso.' });
          return;
        }
        setCapture(previous => {
          if (previous) post({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', requestId: previous.requestId, error: 'Cattura sostituita.' });
          return { requestId: data.requestId, url: currentUrl.current };
        });
      }
    }
    window.addEventListener('message', receive);
    const timer = setInterval(connect, 1000);
    connect();
    return () => { clearInterval(timer); window.removeEventListener('message', receive); lifetime.current++; };
  }, [environment.origin, environment.publicKey, nonce, active, reload, post]);
  useEffect(() => {
    if (active && connected && requestedReport && sentSelection.current !== requestedReport.requestId) {
      sentSelection.current = requestedReport.requestId;
      post({ type: 'REPORTY_PLAYGROUND_SELECT', id: requestedReport.id });
    }
  }, [active, connected, requestedReport, post]);
  useEffect(() => {
    if (!capture) return;
    const timer = setTimeout(() => cancelFromEffect('Tempo per la condivisione scaduto. Riprova.'), 115000);
    return () => clearTimeout(timer);
  }, [capture]);
  useEffect(() => {
    generation.current++;
    const timer = setTimeout(() => cancelFromEffect('Viewport cambiata. Ripeti la cattura.'), 0);
    return () => clearTimeout(timer);
  }, [viewport.width, viewport.height]);
  async function takeScreenshot() {
    if (!capture || !frame.current || captureLock.current) return;
    const request = capture, version = generation.current;
    captureLock.current = true;
    setCapturing(true);
    try {
      const image = await capturePlaygroundFrame(frame.current, () => generation.current === version && currentUrl.current === request.url);
      if (generation.current !== version) throw new Error('Cattura annullata: la pagina o la viewport è cambiata.');
      post({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', requestId: request.requestId, image });
      toast.add({ title: 'Screenshot acquisito', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Screenshot non disponibile.';
      post({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', requestId: request.requestId, error: message });
      toast.add({ title: 'Acquisizione non riuscita', description: message, type: 'error' });
    } finally { captureLock.current = false; setCapturing(false); setCapture(null); }
  }
  const reset = () => { generation.current++; setLoadedRevision(reload); setConnected(false); cancelCapture('La pagina è stata ricaricata.'); onPage(currentUrl.current, false); post({ type: 'REPORTY_PLAYGROUND_CONNECT', key: environment.publicKey }); };
  return <div className={`min-h-0 min-w-0 flex-1 flex-col ${active ? 'flex' : 'hidden'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 text-xs text-muted-foreground">
      <span>{connected ? 'Widget collegato' : 'In attesa del widget: verifica script, attivazione e permesso di incorporamento del sito.'}</span>
      <span>{viewport.width} × {viewport.height} · {Math.round(scale * 100)}%</span>
    </div>
    {capture ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/5 p-3 text-sm"><p>Condividi questa scheda per acquisire solo la pagina, con il punto evidenziato.</p><div className="flex gap-2"><Button disabled={capturing} onClick={() => void takeScreenshot()}>Condividi scheda e acquisisci</Button><Button variant="outline" disabled={capturing} onClick={() => cancelCapture('Acquisizione annullata.')}>Annulla</Button></div></div> : null}
    <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/60 p-4">
      {loadedRevision !== reload ? <div role="status" aria-label="Caricamento pagina del playground" className="absolute inset-4 space-y-6 rounded-lg border bg-background p-6"><div className="flex gap-4"><Skeleton className="h-8 w-28" /><Skeleton className="ml-auto h-8 w-48" /></div><Skeleton className="h-12 w-2/3" /><Skeleton className="h-5 w-4/5" /><div className="grid grid-cols-3 gap-4">{[0,1,2].map(i => <Skeleton key={i} className="h-48 w-full" />)}</div></div> : null}
      <div className="relative shrink-0 bg-white shadow-lg" style={{ width: viewport.width * scale, height: viewport.height * scale, visibility: scale ? 'visible' : 'hidden' }}>
        <iframe key={reload} ref={frame} src={url} title={`Pagina ${url}`} onLoad={reset} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" className="absolute left-0 top-0 origin-top-left border-0 bg-white" style={{ width: viewport.width, height: viewport.height, transform: `scale(${scale})` }} />
      </div>
    </div>
  </div>;
}
