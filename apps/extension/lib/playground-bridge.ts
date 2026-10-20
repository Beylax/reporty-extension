const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PlaygroundSelection = { id: string; requestId: string; focusOnly?: boolean };

/** Carries page metadata only; authentication remains in the widget transport. */
export function createPlaygroundBridge(apiOrigin: string, key: string, target: Window = window) {
  if (target.parent === target) return null;
  let nonce = '';
  let enabled = false;
  let externalDetails = false;
  let lastPage = '';
  let disposed = false;
  const selections = new Set<(selection: PlaygroundSelection) => void>();
  const refreshListeners = new Set<() => void>();
  const pending = new Map<string, { url: string; resolve: (image: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  function post(message: Record<string, unknown>) {
    target.parent.postMessage({ ...message, nonce }, apiOrigin);
  }
  function publish(force = false) {
    if (!nonce || disposed) return;
    const page = JSON.stringify([target.location.href, enabled]);
    if (!force && page === lastPage) return;
    lastPage = page;
    post({ type: 'REPORTY_PLAYGROUND_PAGE', key, url: target.location.href, enabled });
  }
  function cancelCaptures(message: string) {
    for (const capture of pending.values()) {
      clearTimeout(capture.timer);
      capture.reject(new Error(message));
    }
    pending.clear();
  }
  function receive(event: MessageEvent) {
    if (disposed || event.source !== target.parent || event.origin !== apiOrigin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.nonce !== 'string' || !uuid.test(data.nonce)) return;
    if (data.type === 'REPORTY_PLAYGROUND_CONNECT') {
      if (data.key !== key) return;
      if (nonce && nonce !== data.nonce) cancelCaptures('La sessione playground è cambiata. Riprova.');
      nonce = data.nonce;
      externalDetails = data.externalDetails === true;
      publish(true);
      return;
    }
    if (!nonce || data.nonce !== nonce) return;
    if (data.type === 'REPORTY_PLAYGROUND_SELECT' && enabled && typeof data.id === 'string' && uuid.test(data.id)) {
      const selection = { id: data.id, requestId: target.crypto.randomUUID(), ...(data.focusOnly === true ? { focusOnly: true } : {}) };
      selections.forEach(listener => listener(selection));
    }
    if (data.type === 'REPORTY_PLAYGROUND_REFRESH' && enabled) refreshListeners.forEach(listener => listener());
    if (data.type === 'REPORTY_PLAYGROUND_CAPTURE_RESULT' && typeof data.requestId === 'string') {
      const capture = pending.get(data.requestId);
      if (!capture) return;
      pending.delete(data.requestId);
      clearTimeout(capture.timer);
      if (capture.url !== target.location.href) capture.reject(new Error('La pagina è cambiata. Acquisisci nuovamente lo screenshot.'));
      else if (typeof data.image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(data.image) && data.image.length <= 3_500_000) capture.resolve(data.image);
      else capture.reject(new Error(typeof data.error === 'string' ? data.error.slice(0, 300) : 'Screenshot non disponibile.'));
    }
  }
  target.addEventListener('message', receive);
  const timer = setInterval(() => publish(), 700);
  return {
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) cancelCaptures('Widget disabilitato.');
      publish();
    },
    subscribeSelection(listener: (selection: PlaygroundSelection) => void) {
      selections.add(listener);
      return () => { selections.delete(listener); };
    },
    subscribeRefresh(listener: () => void) {
      refreshListeners.add(listener);
      return () => { refreshListeners.delete(listener); };
    },
    openReport(id: string) {
      if (disposed || !nonce || !enabled || !externalDetails || !uuid.test(id)) return false;
      publish(true);
      post({ type: 'REPORTY_PLAYGROUND_OPEN_REPORT', key, id, url: target.location.href });
      return true;
    },
    captureScreenshot(): Promise<string> {
      if (disposed || !nonce || !enabled) return Promise.reject(new Error('Collegamento playground non disponibile.'));
      const requestId = target.crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('Tempo per la condivisione scaduto. Riprova.'));
        }, 120_000);
        pending.set(requestId, { url: target.location.href, resolve, reject, timer: timeout });
        post({ type: 'REPORTY_PLAYGROUND_CAPTURE', requestId });
      });
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      target.removeEventListener('message', receive);
      selections.clear();
      refreshListeners.clear();
      cancelCaptures('Playground chiuso.');
    },
  };
}
