import { apiOrigin, getContext, token, type Sites, type Site, pattern } from '@/lib/session';

export default defineBackground(() => {
  const protectStorage = browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  async function inject(tabId: number) {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
  }
  async function refreshTab(tabId: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([browser.tabs.sendMessage(tabId, { type: 'REPORTY_REFRESH' }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('La pagina non risponde.')), 10000); })]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  async function refreshTabs() {
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.filter(tab => tab.id !== undefined).map(tab =>
      refreshTab(tab.id!).catch(() => undefined)));
  }
  type PendingSite = Site & { origin: string; expiresAt: number };
  const applying = new Map<number, Promise<void>>();
  async function applySite(tabId: number) {
    if (applying.has(tabId)) return applying.get(tabId);
    const work = (async () => {
      const { pendingSites = {} } = await browser.storage.local.get('pendingSites');
      const pending = (pendingSites as Record<string, PendingSite>)[tabId];
      if (!pending || pending.expiresAt < Date.now()) return;
      if (!await browser.permissions.contains({ origins: [pattern(pending.origin)] })) return;
      const tab = await browser.tabs.get(tabId);
      const context = await getContext();
      if (!tab.url || new URL(tab.url).origin !== pending.origin || !context?.environments.some(item => item.id === pending.environmentId && item.origin === pending.origin)) throw new Error('La pagina o i permessi sono cambiati.');
      const { sites = {} } = await browser.storage.local.get('sites');
      await browser.storage.local.set({ sites: { ...(sites as Sites), [pending.origin]: { environmentId: pending.environmentId, position: pending.position } } });
      await inject(tabId);
      await refreshTab(tabId);
      const latest = await browser.storage.local.get('pendingSites');
      const remaining = { ...(latest.pendingSites as Record<string, PendingSite> ?? {}) };
      if (remaining[tabId]?.expiresAt === pending.expiresAt) { delete remaining[tabId]; await browser.storage.local.set({ pendingSites: remaining }); }
    })();
    applying.set(tabId, work);
    try { await work; } finally { applying.delete(tabId); }
  }
  browser.permissions.onAdded.addListener(() => {
    void protectStorage.then(async () => {
      const { pendingSites = {} } = await browser.storage.local.get('pendingSites');
      await Promise.allSettled(Object.keys(pendingSites as object).map(id => applySite(Number(id))));
    }).catch(() => undefined);
  });
  browser.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    void (async () => {
      await protectStorage;
      if (!sender.url || new URL(sender.url).origin !== apiOrigin || message?.type !== 'REPORTY_CONNECT') throw new Error('Invalid sender');
      const stored = await browser.storage.local.get('pendingConnection');
      const pendingConnection = stored.pendingConnection as { nonce: string; tabId: number; expiresAt: number } | undefined;
      if (!pendingConnection || pendingConnection.nonce !== message.nonce || pendingConnection.tabId !== sender.tab?.id || pendingConnection.expiresAt < Date.now()) throw new Error('Invalid connection');
      await browser.storage.local.remove('pendingConnection');
      const response = await fetch(`${apiOrigin}/api/extension/connect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: message.code }), credentials: 'omit', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Connection expired');
      const { token: sessionToken } = await response.json();
      if (typeof sessionToken !== 'string' || !/^[0-9a-f]{64}$/.test(sessionToken)) throw new Error('Invalid session');
      const { sessionToken: oldToken } = await browser.storage.local.get('sessionToken');
      await browser.storage.local.set({ sessionToken });
      if (message.guestEnvironmentId) {
        const context = await getContext();
        const environment = context?.kind === 'guest' ? context.environments.find(item => item.id === message.guestEnvironmentId) : undefined;
        if (!environment) throw new Error('Invalid guest environment');
        const tabId = sender.tab!.id!;
        if (await browser.permissions.contains({ origins: [pattern(environment.origin)] })) {
          const { sites = {} } = await browser.storage.local.get('sites');
          await browser.storage.local.set({ sites: { ...(sites as Sites), [environment.origin]: { environmentId: environment.id, position: 'bottom_right' } } });
          sendResponse({ ok: true });
          await browser.tabs.update(tabId, { url: environment.origin });
        } else {
          await browser.storage.local.set({ guestReviewStart: { environmentId: environment.id, tabId, expiresAt: Date.now() + 120000 } });
          sendResponse({ ok: true });
          await browser.tabs.update(tabId, { url: browser.runtime.getURL('/review.html') });
        }
      } else sendResponse({ ok: true });
      if (oldToken) await fetch(`${apiOrigin}/api/extension/context`, { method: 'DELETE', headers: { Authorization: `Bearer ${oldToken}` }, credentials: 'omit', signal: AbortSignal.timeout(10000) }).catch(() => undefined);
      void refreshTabs().catch(() => undefined);
    })().catch(() => sendResponse({ ok: false, error: 'Collegamento non riuscito. Riprova dal popup.' }));
    return true;
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      await protectStorage;
      if (sender.id !== browser.runtime.id) throw new Error('Invalid sender');
      if (message?.type === 'REPORTY_GUEST_START') {
        if (sender.url !== browser.runtime.getURL('/review.html') || !sender.tab?.id) throw new Error('Invalid sender');
        const stored = await browser.storage.local.get('guestReviewStart');
        const guestReviewStart = stored.guestReviewStart as { environmentId: string; tabId: number; expiresAt: number } | undefined;
        if (!guestReviewStart || guestReviewStart.tabId !== sender.tab.id || guestReviewStart.expiresAt < Date.now()) throw new Error('Invito scaduto. Riapri il link ricevuto.');
        const context = await getContext();
        const environment = context?.kind === 'guest' ? context.environments.find(item => item.id === guestReviewStart.environmentId) : undefined;
        if (!environment) throw new Error('Accesso revocato.');
        if (!message.activate) return sendResponse({ ok: true, data: environment });
        if (!await browser.permissions.contains({ origins: [pattern(environment.origin)] })) throw new Error('Consenti l’accesso al sito per iniziare.');
        const { sites = {} } = await browser.storage.local.get('sites');
        await browser.storage.local.set({ sites: { ...(sites as Sites), [environment.origin]: { environmentId: environment.id, position: 'bottom_right' } } });
        await browser.storage.local.remove('guestReviewStart');
        sendResponse({ ok: true });
        await browser.tabs.update(sender.tab.id, { url: environment.origin });
        return;
      }
      if (message?.type === 'REPORTY_GUEST_PREPARE') {
        if (sender.frameId !== 0 || !sender.tab?.id || !sender.url || new URL(sender.url).origin !== apiOrigin || !/^\/guest\/[0-9a-f]{64}$/.test(new URL(sender.url).pathname)) throw new Error('Invalid guest page');
        const nonce = token();
        await browser.storage.local.set({ pendingConnection: { nonce, tabId: sender.tab.id, expiresAt: Date.now() + 120000 } });
        return sendResponse({ ok: true, data: { nonce, extensionId: browser.runtime.id } });
      }
      if (['REPORTY_REPORT', 'REPORTY_CAPTURE', 'REPORTY_SCREENSHOT'].includes(message?.type)) {
        if (sender.frameId !== 0 || !sender.tab?.id || !sender.url) throw new Error('Pagina non valida.');
        const tab = await browser.tabs.get(sender.tab.id);
        if (!tab.url || new URL(tab.url).origin !== new URL(sender.url).origin) throw new Error('Pagina cambiata.');
        const origin = new URL(tab.url).origin;
        const { sites = {} } = await browser.storage.local.get('sites');
        const site = (sites as Sites)[origin];
        const context = await getContext();
        if (!site || !context?.environments.some(item => item.id === site.environmentId && item.origin === origin)) throw new Error('Accesso al sito non disponibile.');
        if (message.type === 'REPORTY_CAPTURE') {
          const active = (await browser.tabs.query({ active: true, windowId: tab.windowId }))[0];
          if (active?.id !== tab.id) throw new Error('Torna alla scheda da revisionare.');
          const image = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 75 }).catch(() => { throw new Error('Apri il popup Reporty per autorizzare lo screenshot, oppure prosegui senza immagine.'); });
          const after = await browser.tabs.get(tab.id!);
          if (after.url !== tab.url || !(await browser.tabs.get(tab.id!)).active) throw new Error('Pagina cambiata durante lo screenshot.');
          return sendResponse({ ok: true, data: image });
        }
        const { sessionToken } = await browser.storage.local.get('sessionToken');
        if (message.type === 'REPORTY_REPORT' && message.operation === 'create' && message.payload?.context?.url !== tab.url) throw new Error('La pagina è cambiata: crea una nuova segnalazione.');
        const endpoint = message.type === 'REPORTY_SCREENSHOT' ? 'screenshot' : 'reports';
        const body = message.type === 'REPORTY_SCREENSHOT' ? { environmentId: site.environmentId, id: message.id } : { environmentId: site.environmentId, operation: message.operation, payload: message.payload, screenshot: message.screenshot };
        const response = await fetch(`${apiOrigin}/api/extension/${endpoint}`, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Operazione non riuscita.');
        return sendResponse({ ok: true, data: result });
      }
      if (message?.type === 'REPORTY_PAGE') {
        if (sender.frameId !== 0 || !sender.url) throw new Error('Invalid page');
        const origin = new URL(sender.url).origin;
        const { sites = {} } = await browser.storage.local.get('sites');
        const site = (sites as Sites)[origin];
        if (!site) return sendResponse({ ok: true, data: null });
        const context = await getContext();
        const environment = context?.environments.find(item => item.id === site.environmentId && item.origin === origin);
        return sendResponse({ ok: true, data: environment ? { site, environment } : null });
      }
      if (sender.tab || sender.url !== browser.runtime.getURL('/popup.html')) throw new Error('Popup required');
      if (message?.type === 'REPORTY_APPLY_SITE') {
        await applySite(message.tabId);
        return sendResponse({ ok: true });
      }
      if (message?.type === 'REPORTY_STATE') {
        const context = await getContext();
        const { sites = {} } = await browser.storage.local.get('sites');
        return sendResponse({ ok: true, data: { context, sites } });
      }
      if (message?.type === 'REPORTY_START_CONNECTION') {
        const nonce = token();
        const expiresAt = Date.now() + 15 * 60 * 1000;
        const tab = await browser.tabs.create({ url: `${apiOrigin}/extension/connect?extensionId=${browser.runtime.id}&nonce=${nonce}` });
        await browser.storage.local.set({ pendingConnection: { nonce, tabId: tab.id, expiresAt } });
        return sendResponse({ ok: true });
      }
      if (message?.type === 'REPORTY_DISCONNECT') {
        const { sessionToken } = await browser.storage.local.get('sessionToken');
        if (sessionToken) await fetch(`${apiOrigin}/api/extension/context`, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionToken}` }, credentials: 'omit', signal: AbortSignal.timeout(10000) }).catch(() => undefined);
        await browser.storage.local.remove(['sessionToken', 'pendingConnection', 'sites', 'pendingSites', 'guestReviewStart']);
        await refreshTabs();
        return sendResponse({ ok: true });
      }
      if (message?.type === 'REPORTY_SITE') {
        const tab = await browser.tabs.get(message.tabId);
        if (!tab.url || !['http:', 'https:'].includes(new URL(tab.url).protocol)) throw new Error('Pagina non supportata.');
        const origin = new URL(tab.url).origin;
        const { sites = {} } = await browser.storage.local.get('sites');
        const updated: Sites = { ...(sites as Sites) };
        if (message.enabled) {
          const context = await getContext();
          const environment = context?.environments.find(item => item.id === message.environmentId && item.origin === origin);
          if (!environment) throw new Error('Nessun accesso a questo ambiente.');
          if (!['bottom_right', 'bottom_left', 'top_right', 'top_left'].includes(message.position)) throw new Error('Posizione non valida.');
          const { pendingSites = {} } = await browser.storage.local.get('pendingSites');
          await browser.storage.local.set({ pendingSites: { ...(pendingSites as object), [message.tabId]: { origin, environmentId: environment.id, position: message.position, expiresAt: Date.now() + 120000 } } });
          await applySite(message.tabId);
          return sendResponse({ ok: true });
        } else delete updated[origin];
        await browser.storage.local.set({ sites: updated });
        await refreshTab(message.tabId).catch(() => undefined);
        void refreshTabs().catch(() => undefined);
        return sendResponse({ ok: true });
      }
      throw new Error('Unknown message');
    })().catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Operazione non riuscita.' }));
    return true;
  });
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status !== 'complete' || !tab.url || !tab.url.startsWith('http')) return;
    void protectStorage.then(async () => {
      const { sites = {} } = await browser.storage.local.get('sites');
      if ((sites as Sites)[new URL(tab.url!).origin]) await inject(tabId);
    }).catch(() => undefined);
  });
});
