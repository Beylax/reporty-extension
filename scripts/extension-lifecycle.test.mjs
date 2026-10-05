import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../apps/extension/.output/chrome-mv3/background.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness() {
  const events = {}, stored = {}, injections = [], messages = [];
  let granted = false;
  const environment = { id: 'env', projectId: 'project', projectName: 'Test', name: 'Production', origin: 'https://example.com' };
  const browser = {
    runtime: { id: 'test', getURL: path => `chrome-extension://test${path}`, onMessage: { addListener: fn => events.internal = fn }, onMessageExternal: { addListener: fn => events.external = fn } },
    storage: { local: {
      setAccessLevel: async () => {}, get: async key => ({ [key]: structuredClone(stored[key]) }),
      set: async values => Object.assign(stored, structuredClone(values)), remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key]; },
    } },
    tabs: {
      get: async id => ({ id, url: environment.origin + '/page', windowId: 1 }), query: async () => [{ id: 1 }],
      sendMessage: async (id, message) => { messages.push({ id, message }); return { ok: true }; }, onUpdated: { addListener: fn => events.updated = fn },
    },
    scripting: { executeScript: async options => { injections.push(options.target.tabId); } },
    permissions: { contains: async () => granted, onAdded: { addListener: fn => events.permissions = fn } },
  };
  let cleanupResolve;
  const fetch = async (url, options) => {
    if (url.endsWith('/connect')) return { ok: true, json: async () => ({ token: 'a'.repeat(64) }) };
    if (options?.method === 'DELETE') return new Promise(resolve => { cleanupResolve = resolve; });
    return { ok: true, status: 200, json: async () => ({ kind: 'guest', displayName: 'Client', environments: [environment] }) };
  };
  runInNewContext(source, { browser, URL, crypto: webcrypto, fetch, AbortSignal, setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; }, clearTimeout, console });
  return { events, stored, injections, messages, grant: () => { granted = true; events.permissions(); }, finishCleanup: () => cleanupResolve?.({ ok: true }) };
}
const popup = { id: 'test', url: 'chrome-extension://test/popup.html' };

test('connection acknowledges stored credentials before old-session cleanup finishes', async () => {
  const h = harness();
  h.stored.sessionToken = 'b'.repeat(64);
  h.stored.pendingConnection = { nonce: 'request', tabId: 1, expiresAt: Date.now() + 10000 };
  let response;
  assert.equal(h.events.external({ type: 'REPORTY_CONNECT', nonce: 'request', code: 'code' }, { url: 'http://localhost:3000/extension/connect', tab: { id: 1 } }, value => { response = value; }), true);
  await flush();
  assert.equal(response?.ok, true);
  assert.equal(h.stored.sessionToken, 'a'.repeat(64));
  h.finishCleanup();
  await flush();
  assert.equal(response.ok, true);
});

test('granting a site permission completes activation even after the popup closes', async () => {
  const h = harness();
  h.stored.sessionToken = 'a'.repeat(64);
  let response;
  h.events.internal({ type: 'REPORTY_SITE', tabId: 1, enabled: true, environmentId: 'env', position: 'bottom_right' }, popup, value => { response = value; });
  await flush();
  assert.equal(response.ok, true);
  assert.equal(h.injections.length, 0);
  assert.ok(h.stored.pendingSites[1]);
  h.grant();
  await flush();
  assert.deepEqual(h.injections, [1]);
  assert.equal(h.stored.sites['https://example.com'].environmentId, 'env');
  assert.equal(h.messages[0].message.type, 'REPORTY_REFRESH');
});
