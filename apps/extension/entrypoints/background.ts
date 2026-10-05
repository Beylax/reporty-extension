import { apiOrigin, getContext, token, type Sites, type Site } from '@/lib/session';

export default defineBackground(() => {
  const protectStorage = browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  async function inject(tabId: number) {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
  }
  async function refreshTabs() {
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.filter(tab => tab.id !== undefined).map(tab =>
      browser.tabs.sendMessage(tab.id!, { type: 'REPORTY_REFRESH' }).catch(() => undefined)));
  }
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
      if (oldToken) await fetch(`${apiOrigin}/api/extension/context`, { method: 'DELETE', headers: { Authorization: `Bearer ${oldToken}` }, credentials: 'omit', signal: AbortSignal.timeout(10000) }).catch(() => undefined);
      await refreshTabs();
      sendResponse({ ok: true });
    })().catch(() => sendResponse({ ok: false, error: 'Collegamento non riuscito. Riprova dal popup.' }));
    return true;
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      await protectStorage;
      if (sender.id !== browser.runtime.id) throw new Error('Invalid sender');
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
        await browser.storage.local.remove(['sessionToken', 'pendingConnection', 'sites']);
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
          updated[origin] = { environmentId: environment.id, position: message.position as Site['position'] };
        } else delete updated[origin];
        await browser.storage.local.set({ sites: updated });
        if (message.enabled) await inject(message.tabId);
        await refreshTabs();
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
