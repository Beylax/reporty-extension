/** Verify the loader executed in the opened environment, without sending credentials. */
export function verifyWidgetInstallation(environmentOrigin: string, publicKey: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Verifica annullata.', 'AbortError')); return; }
    const origin = new URL(environmentOrigin).origin;
    const nonce = crypto.randomUUID();
    let popup: Window | null = null;
    const timers: { interval?: ReturnType<typeof setInterval>; timeout?: ReturnType<typeof setTimeout> } = {};
    let settled = false;
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearInterval(timers.interval); clearTimeout(timers.timeout);
      window.removeEventListener('message', receive);
      signal.removeEventListener('abort', abort);
      try { popup?.close(); } catch { /* Keep the verification result if the browser prevents closing. */ }
      if (error) reject(error); else resolve();
    }
    function abort() { finish(new DOMException('Verifica annullata.', 'AbortError')); }
    function receive(event: MessageEvent) {
      if (!popup || event.source !== popup || event.origin !== origin || event.data?.type !== 'REPORTY_WIDGET_VERIFIED' || event.data?.nonce !== nonce) return;
      if (event.data.key !== publicKey) { finish(new Error('Il sito ha risposto con lo script di un altro ambiente. Controlla lo snippet installato.')); return; }
      finish();
    }
    function ping() {
      if (popup?.closed) { finish(new Error('La finestra del sito è stata chiusa prima di completare la verifica.')); return; }
      try { popup?.postMessage({ type: 'REPORTY_VERIFY_WIDGET', nonce }, origin); }
      catch { finish(new Error('Il browser impedisce la comunicazione con la finestra del sito. Riprova.')); }
    }
    window.addEventListener('message', receive);
    signal.addEventListener('abort', abort, { once: true });
    try { popup = window.open(origin, '_blank', 'popup=yes,width=720,height=640'); }
    catch { finish(new Error('Impossibile aprire il sito. Consenti i popup e riprova.')); return; }
    if (!popup) { finish(new Error('Il browser ha bloccato la finestra di verifica. Consenti i popup e riprova.')); return; }
    timers.interval = setInterval(ping, 500);
    timers.timeout = setTimeout(() => finish(new Error('Nessuna conferma ricevuta dal sito entro 15 secondi. Controlla lo snippet, il caricamento del sito e gli eventuali blocchi del browser, poi riprova.')), 15000);
    ping();
  });
}
