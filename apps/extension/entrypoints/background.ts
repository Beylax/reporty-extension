import { isOpenerPosition } from '@/lib/opener-position';
import { getPageContext } from '@reporty/shared';
import { apiOrigin, getContext, getSessionToken, guestSessionKey, token, type Sites, type Site, pattern } from '@/lib/session';

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
      const context = await getContext(pending.origin);
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
      const connectionKey = `pendingConnection:${sender.tab?.id}`;
      const stored = await browser.storage.local.get(connectionKey);
      const legacy = await browser.storage.local.get('pendingConnection');
      const pendingConnection = (stored[connectionKey] ?? legacy.pendingConnection) as { nonce: string; tabId: number; expiresAt: number } | undefined;
      if (!pendingConnection || pendingConnection.nonce !== message.nonce || pendingConnection.tabId !== sender.tab?.id || pendingConnection.expiresAt < Date.now()) throw new Error('Invalid connection');
      await browser.storage.local.remove(stored[connectionKey] ? connectionKey : 'pendingConnection');
      const response = await fetch(`${apiOrigin}/api/extension/connect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: message.code }), credentials: 'omit', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Connection expired');
      const { token: sessionToken } = await response.json();
      if (typeof sessionToken !== 'string' || !/^[0-9a-f]{64}$/.test(sessionToken)) throw new Error('Invalid session');
      const context = await getContext(undefined, sessionToken);
      if (!context) throw new Error('Invalid session');
      const selected = message.guestEnvironmentId ? context.environments.find(item => item.id === message.guestEnvironmentId) : undefined;
      if (message.guestEnvironmentId && (context.kind !== 'guest' || !selected)) throw new Error('Invalid guest environment');
      let oldToken: unknown;
      if (context.kind === 'guest') {
        // Preserve the guest connection created by older extension versions.
        const legacyToken = (await browser.storage.local.get('sessionToken')).sessionToken;
        if (typeof legacyToken === 'string') {
          const legacyContext = await getContext(undefined, legacyToken);
          if (legacyContext?.kind === 'guest') {
            for (const item of legacyContext.environments) {
              const key = guestSessionKey(item.origin);
              if (!(await browser.storage.local.get(key))[key]) await browser.storage.local.set({ [key]: legacyToken });
            }
            await browser.storage.local.remove('sessionToken');
          }
        }
        const environments = selected ? [selected] : context.environments;
        await browser.storage.local.set(Object.fromEntries(environments.map(item => [guestSessionKey(item.origin), sessionToken])));
      } else {
        oldToken = (await browser.storage.local.get('sessionToken')).sessionToken;
        await browser.storage.local.set({ sessionToken });
      }
      if (message.guestEnvironmentId) {
        const environment = context?.kind === 'guest' ? context.environments.find(item => item.id === message.guestEnvironmentId) : undefined;
        if (!environment) throw new Error('Invalid guest environment');
        const tabId = sender.tab!.id!;
        if (await browser.permissions.contains({ origins: [pattern(environment.origin)] })) {
          const { sites = {} } = await browser.storage.local.get('sites');
          await browser.storage.local.set({ sites: { ...(sites as Sites), [environment.origin]: { environmentId: environment.id, position: 'bottom_right' } } });
          sendResponse({ ok: true });
          await browser.tabs.update(tabId, { url: environment.origin });
        } else {
          await browser.storage.local.set({ [`guestReviewStart:${tabId}`]: { origin: environment.origin, environmentId: environment.id, tabId, expiresAt: Date.now() + 120000 } });
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
        const startKey = `guestReviewStart:${sender.tab.id}`;
        const stored = await browser.storage.local.get(startKey);
        const guestReviewStart = stored[startKey] as { origin: string; environmentId: string; tabId: number; expiresAt: number } | undefined;
        if (!guestReviewStart || guestReviewStart.tabId !== sender.tab.id || guestReviewStart.expiresAt < Date.now()) throw new Error('Invito scaduto. Riapri il link ricevuto.');
        const context = await getContext(guestReviewStart.origin);
        const environment = context?.kind === 'guest' ? context.environments.find(item => item.id === guestReviewStart.environmentId) : undefined;
        if (!environment) throw new Error('Accesso revocato.');
        if (!message.activate) return sendResponse({ ok: true, data: environment });
        if (!await browser.permissions.contains({ origins: [pattern(environment.origin)] })) throw new Error('Consenti l’accesso al sito per iniziare.');
        const { sites = {} } = await browser.storage.local.get('sites');
        await browser.storage.local.set({ sites: { ...(sites as Sites), [environment.origin]: { environmentId: environment.id, position: 'bottom_right' } } });
        await browser.storage.local.remove(startKey);
        sendResponse({ ok: true });
        await browser.tabs.update(sender.tab.id, { url: environment.origin });
        return;
      }
      if (message?.type === 'REPORTY_GUEST_PREPARE') {
        if (sender.frameId !== 0 || !sender.tab?.id || !sender.url || new URL(sender.url).origin !== apiOrigin || !/^\/guest\/[0-9a-f]{64}$/.test(new URL(sender.url).pathname)) throw new Error('Invalid guest page');
        const nonce = token();
        await browser.storage.local.set({ [`pendingConnection:${sender.tab.id}`]: { nonce, tabId: sender.tab.id, expiresAt: Date.now() + 120000 } });
        return sendResponse({ ok: true, data: { nonce, extensionId: browser.runtime.id } });
      }
      if (['REPORTY_REPORT', 'REPORTY_SCREENSHOT', 'REPORTY_POSITION'].includes(message?.type)) {
        if (sender.frameId !== 0 || !sender.tab?.id || !sender.url) throw new Error('Pagina non valida.');
        const tab = await browser.tabs.get(sender.tab.id);
        if (!tab.url || new URL(tab.url).origin !== new URL(sender.url).origin) throw new Error('Pagina cambiata.');
        const origin = new URL(tab.url).origin;
        const { sites = {} } = await browser.storage.local.get('sites');
        const site = (sites as Sites)[origin];
        const sessionToken = await getSessionToken(origin);
        const context = sessionToken ? await getContext(origin, sessionToken) : null;
        if (!site || !context?.environments.some(item => item.id === site.environmentId && item.origin === origin)) throw new Error('Accesso al sito non disponibile.');
        if (message.type === 'REPORTY_POSITION') {
          if (message.environmentId !== site.environmentId) throw new Error('Ambiente cambiato.');
          if (!isOpenerPosition(message.position)) throw new Error('Posizione non valida.');
          const updatedSite = { ...site, position: message.position };
          await browser.storage.local.set({ sites: { ...(sites as Sites), [origin]: updatedSite } });
          sendResponse({ ok: true, data: updatedSite });
          void refreshTabs().catch(() => undefined);
          return;
        }
        if (message.type === 'REPORTY_REPORT' && message.operation === 'create' && message.payload?.context?.url !== tab.url) throw new Error('La pagina è cambiata: crea una nuova segnalazione.');
        if (message.type === 'REPORTY_REPORT' && String(message.operation).startsWith('notification') && message.payload?.pagePath !== getPageContext(tab.url).pagePath) throw new Error('La pagina è cambiata: riapri le notifiche.');
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
        const context = await getContext(origin);
        const environment = context?.environments.find(item => item.id === site.environmentId && item.origin === origin);
        return sendResponse({ ok: true, data: environment ? { site, environment } : null });
      }
      if (sender.tab || sender.url !== browser.runtime.getURL('/popup.html')) throw new Error('Popup required');
      if (message?.type === 'REPORTY_APPLY_SITE') {
        await applySite(message.tabId);
        return sendResponse({ ok: true });
      }
      if (message?.type === 'REPORTY_STATE') {
        const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
        const origin = tab?.url?.startsWith('http') ? new URL(tab.url).origin : undefined;
        const context = await getContext(origin);
        const { sites = {} } = await browser.storage.local.get('sites');
        return sendResponse({ ok: true, data: { context, sites } });
      }
      if (message?.type === 'REPORTY_START_CONNECTION') {
        const nonce = token();
        const expiresAt = Date.now() + 15 * 60 * 1000;
        const tab = await browser.tabs.create({ url: `${apiOrigin}/extension/connect?extensionId=${browser.runtime.id}&nonce=${nonce}` });
        await browser.storage.local.set({ [`pendingConnection:${tab.id}`]: { nonce, tabId: tab.id, expiresAt } });
        return sendResponse({ ok: true });
      }
      if (message?.type === 'REPORTY_DISCONNECT') {
        const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
        const origin = tab?.url?.startsWith('http') ? new URL(tab.url).origin : undefined;
        const key = origin ? guestSessionKey(origin) : 'sessionToken';
        const scoped = await browser.storage.local.get(key);
        const sessionToken = scoped[key] ?? (await browser.storage.local.get('sessionToken')).sessionToken;
        await browser.storage.local.remove(scoped[key] ? key : 'sessionToken');
        // Guest credentials may also serve other environments of the same project.
        const remaining = await browser.storage.local.get(null);
        if (sessionToken && !Object.entries(remaining).some(([name, value]) => (name === 'sessionToken' || name.startsWith('guestSession:')) && value === sessionToken)) {
          await fetch(`${apiOrigin}/api/extension/context`, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionToken}` }, credentials: 'omit', signal: AbortSignal.timeout(10000) }).catch(() => undefined);
        }
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
          const context = await getContext(origin);
          const environment = context?.environments.find(item => item.id === message.environmentId && item.origin === origin);
          if (!environment) throw new Error('Nessun accesso a questo ambiente.');
          if (!isOpenerPosition(message.position)) throw new Error('Posizione non valida.');
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
