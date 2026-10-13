import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../apps/extension/.output/chrome-mv3/background.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness(kind = 'guest') {
  const events = {}, stored = {}, injections = [], messages = [], navigations = [];
  let granted = false;
  const environment = { id: 'env', projectId: 'project', projectName: 'Test', name: 'Production', origin: 'https://example.com' };
  const browser = {
    runtime: { id: 'test', getURL: path => `chrome-extension://test${path}`, onMessage: { addListener: fn => events.internal = fn }, onMessageExternal: { addListener: fn => events.external = fn } },
    storage: { local: {
      setAccessLevel: async () => {}, get: async key => key === null ? structuredClone(stored) : ({ [key]: structuredClone(stored[key]) }),
      set: async values => Object.assign(stored, structuredClone(values)), remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key]; },
    } },
    tabs: {
      update: async (id, options) => { navigations.push({ id, ...options }); },
      get: async id => ({ id, url: environment.origin + '/page', windowId: 1 }), query: async () => [{ id: 1, url: environment.origin + '/page' }],
      sendMessage: async (id, message) => { messages.push({ id, message }); return { ok: true }; }, onUpdated: { addListener: fn => events.updated = fn },
    },
    scripting: { executeScript: async options => { injections.push(options.target.tabId); } },
    permissions: { contains: async () => granted, onAdded: { addListener: fn => events.permissions = fn } },
  };
  let cleanupResolve;
  const contexts = {}, requests = [];
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/connect')) return { ok: true, json: async () => ({ token: JSON.parse(options.body).code === 'second' ? 'c'.repeat(64) : 'a'.repeat(64) }) };
    if (options?.method === 'DELETE') return new Promise(resolve => { cleanupResolve = resolve; });
    return { ok: true, status: 200, json: async () => contexts[options?.headers?.Authorization] ?? ({ kind, displayName: 'Client', environments: [environment] }) };
  };
  runInNewContext(source, { browser, URL, crypto: webcrypto, fetch, AbortSignal, setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; }, clearTimeout, console });
  return { events, stored, injections, messages, navigations, contexts, requests, grant: () => { granted = true; events.permissions(); }, finishCleanup: () => cleanupResolve?.({ ok: true }) };
}
const popup = { id: 'test', url: 'chrome-extension://test/popup.html' };

test('connection acknowledges stored credentials before old-session cleanup finishes', async () => {
  const h = harness('member');
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


test('guest invite prepares only a trusted top-level guest page', async () => {
  const h = harness();
  let response;
  h.events.internal({ type: 'REPORTY_GUEST_PREPARE' }, { id: 'test', frameId: 0, tab: { id: 1 }, url: 'https://example.com/guest/' + 'a'.repeat(64) }, value => response = value);
  await flush();
  assert.equal(response.ok, false);
  assert.equal(h.stored.pendingConnection, undefined);
  h.events.internal({ type: 'REPORTY_GUEST_PREPARE' }, { id: 'test', frameId: 0, tab: { id: 1 }, url: 'http://localhost:3000/guest/' + 'a'.repeat(64) }, value => response = value);
  await flush();
  assert.equal(response.ok, true);
  assert.equal(h.stored['pendingConnection:1'].tabId, 1);
});

for (const granted of [false, true]) test(`guest connection ${granted ? 'opens authorized site' : 'opens permission step'}`, async () => {
  const h = harness();
  if (granted) h.grant();
  h.stored.pendingConnection = { nonce: 'request', tabId: 1, expiresAt: Date.now() + 10000 };
  let response;
  h.events.external({ type: 'REPORTY_CONNECT', nonce: 'request', code: 'code', guestEnvironmentId: 'env' }, { url: 'http://localhost:3000/guest/' + 'a'.repeat(64), tab: { id: 1 } }, value => response = value);
  await flush();
  assert.equal(response.ok, true);
  assert.equal(h.navigations[0].url, granted ? 'https://example.com' : 'chrome-extension://test/review.html');
  if (granted) assert.equal(h.stored.sites['https://example.com'].environmentId, 'env');
  else {
    assert.equal(h.stored['guestReviewStart:1'].environmentId, 'env');
    h.grant();
    h.events.internal({ type: 'REPORTY_GUEST_START', activate: true }, { id: 'test', url: 'chrome-extension://test/review.html', tab: { id: 1 } }, value => response = value);
    await flush();
    assert.equal(response.ok, true);
    assert.equal(h.navigations[1].url, 'https://example.com');
    assert.equal(h.stored['guestReviewStart:1'], undefined);
  }
});

test('guest bridge browser bundle does not depend on the Node process global', async () => {
  const bridge = await readFile(new URL('../apps/extension/.output/chrome-mv3/content-scripts/guest-bridge.js', import.meta.url), 'utf8');
  assert.doesNotMatch(bridge, /\bprocess\s*(?:\.|\[)/);
});


test('a second guest invite preserves the first site session and uses the right report credential', async () => {
  const h = harness();
  h.grant();
  const second = { id: 'other-env', projectId: 'other-project', origin: 'https://other.example', name: 'Other', projectName: 'Other' };
  h.contexts['Bearer ' + 'c'.repeat(64)] = { kind: 'guest', displayName: 'Second', environments: [second] };
  for (const [tabId, code, environmentId] of [[1, 'first', 'env'], [2, 'second', 'other-env']]) {
    h.stored[`pendingConnection:${tabId}`] = { nonce: code, tabId, expiresAt: Date.now() + 10000 };
    let response;
    h.events.external({ type: 'REPORTY_CONNECT', nonce: code, code, guestEnvironmentId: environmentId }, { url: 'http://localhost:3000/guest/' + 'a'.repeat(64), tab: { id: tabId } }, value => response = value);
    await flush();
    assert.equal(response.ok, true);
  }
  assert.equal(h.stored['guestSession:https://example.com'], 'a'.repeat(64));
  assert.equal(h.stored['guestSession:https://other.example'], 'c'.repeat(64));
  assert.equal(h.requests.some(request => request.options?.method === 'DELETE'), false);
  let response;
  h.events.internal({ type: 'REPORTY_REPORT', operation: 'list', payload: {} }, { id: 'test', frameId: 0, tab: { id: 1 }, url: 'https://example.com/page' }, value => response = value);
  await flush();
  assert.equal(response.ok, true);
  assert.equal(h.requests.findLast(request => request.url.endsWith('/reports')).options.headers.Authorization, 'Bearer ' + 'a'.repeat(64));
  h.events.internal({ type: 'REPORTY_STATE' }, popup, value => response = value);
  await flush();
  assert.equal(response.data.context.displayName, 'Client');
});

test('guest invite preparation is isolated by browser tab', async () => {
  const h = harness();
  for (const tabId of [1, 2]) {
    h.events.internal({ type: 'REPORTY_GUEST_PREPARE' }, { id: 'test', frameId: 0, tab: { id: tabId }, url: 'http://localhost:3000/guest/' + 'a'.repeat(64) }, () => {});
  }
  await flush();
  assert.equal(h.stored['pendingConnection:1'].tabId, 1);
  assert.equal(h.stored['pendingConnection:2'].tabId, 2);
});


test('disconnecting a guest site keeps other site credentials', async () => {
  const h = harness();
  h.stored['guestSession:https://example.com'] = 'a'.repeat(64);
  h.stored['guestSession:https://other.example'] = 'c'.repeat(64);
  let response;
  h.events.internal({ type: 'REPORTY_DISCONNECT' }, popup, value => response = value);
  await flush();
  h.finishCleanup();
  await flush();
  assert.equal(response.ok, true);
  assert.equal(h.stored['guestSession:https://example.com'], undefined);
  assert.equal(h.stored['guestSession:https://other.example'], 'c'.repeat(64));
});

test('a legacy guest session is preserved when joining another site', async () => {
  const h = harness();
  h.grant();
  h.stored.sessionToken = 'a'.repeat(64);
  h.contexts['Bearer ' + 'c'.repeat(64)] = { kind: 'guest', displayName: 'Second', environments: [{ id: 'other-env', origin: 'https://other.example' }] };
  h.stored['pendingConnection:2'] = { nonce: 'second', tabId: 2, expiresAt: Date.now() + 10000 };
  let response;
  h.events.external({ type: 'REPORTY_CONNECT', nonce: 'second', code: 'second', guestEnvironmentId: 'other-env' }, { url: 'http://localhost:3000/guest/' + 'a'.repeat(64), tab: { id: 2 } }, value => response = value);
  await flush();
  assert.equal(response.ok, true);
  assert.equal(h.stored['guestSession:https://example.com'], 'a'.repeat(64));
  assert.equal(h.stored['guestSession:https://other.example'], 'c'.repeat(64));
  assert.equal(h.stored.sessionToken, undefined);
});


test('shadow styles initialize Tailwind properties locally without overriding utilities', async () => {
  const helper = await readFile(new URL('../apps/extension/lib/shadow-styles.ts', import.meta.url), 'utf8');
  const scope = {};
  runInNewContext(helper.replace('export function', 'function').replace('css: string', 'css') + ';this.shadowStyles = shadowStyles;', scope);
  const css = scope.shadowStyles('@layer base{*{border:0 solid}}@layer utilities{.border{border-style:var(--tw-border-style)}.shadow{--tw-shadow:2px 2px #000}}:root{--primary:black}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}');
  assert.match(css, /@layer base\{\*,::before,::after\{--reporty-tw-border-style:solid;--reporty-tw-shadow:0 0 #0000;/);
  assert.match(css, /var\(--reporty-tw-border-style\)/);
  assert.match(css, /:host\{--reporty-primary:black\}/);
  assert.doesNotMatch(css, /(?:var\(|@property )--tw-/);
});

test('shadow styles preserve Tailwind arbitrary class selectors while isolating their colors', async () => {
  const helper = await readFile(new URL('../apps/extension/lib/shadow-styles.ts', import.meta.url), 'utf8');
  const scope = {};
  runInNewContext(helper.replace('export function', 'function').replace('css: string', 'css') + ';this.shadowStyles = shadowStyles;', scope);
  const selector = String.raw`.bg-\[color-mix\(in_oklab\,var\(--primary\)_10\%\,var\(--background\)\)\]`;
  const css = scope.shadowStyles(`${selector}{background-color:color-mix(in oklab,var(--primary) 10%,var(--background))}:root{--primary:purple;--background:white}`);
  assert.ok(css.includes(`${selector}{`), 'The class used by React must still match its CSS selector');
  assert.ok(css.includes('color-mix(in oklab,var(--reporty-primary) 10%,var(--reporty-background))'));
  assert.ok(css.includes(':host{--reporty-primary:purple;--reporty-background:white}'));
});

test('notification requests require the current page and preserve its session and scope', async () => {
  const h = harness('member');
  h.stored.sessionToken = 'a'.repeat(64);
  h.stored.sites = { 'https://example.com': { environmentId: 'env', position: 'bottom_right' } };
  const sender = { id: 'test', frameId: 0, tab: { id: 1 }, url: 'https://example.com/page' };
  for (const operation of ['notifications', 'notification_read', 'notifications_read']) {
    for (const pagePath of [undefined, '/other']) {
      let response;
      h.events.internal({ type: 'REPORTY_REPORT', operation, payload: { pagePath } }, sender, value => response = value);
      await flush();
      assert.equal(response.ok, false);
      assert.match(response.error, /pagina è cambiata/);
    }
  }
  assert.equal(h.requests.some(request => request.url.endsWith('/reports')), false);
  let response;
  h.events.internal({ type: 'REPORTY_REPORT', operation: 'notifications_read', payload: { pagePath: '/page' } }, sender, value => response = value);
  await flush();
  assert.equal(response.ok, true);
  const request = h.requests.findLast(request => request.url.endsWith('/reports'));
  assert.equal(request.options.headers.Authorization, 'Bearer ' + 'a'.repeat(64));
  const input = JSON.parse(request.options.body);
  assert.equal(input.environmentId, 'env');
  assert.equal(input.payload.pagePath, '/page');
  assert.equal(input.operation, 'notifications_read');
});
