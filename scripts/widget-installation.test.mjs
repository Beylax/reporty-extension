import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyWidgetInstallation } from '../apps/web/lib/widget-installation.ts';

function harness(t, blocked = false) {
  let receive, poll, expire;
  const sent = [], removed = [];
  const popup = { closed: false, postMessage: (data, origin) => sent.push({ data, origin }) };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    open: () => blocked ? null : popup,
    addEventListener: (_, callback) => { receive = callback; },
    removeEventListener: (_, callback) => { removed.push(callback); },
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  t.mock.method(globalThis, 'setInterval', callback => { poll = callback; return 1; });
  t.mock.method(globalThis, 'setTimeout', callback => { expire = callback; return 2; });
  const clearInterval = t.mock.method(globalThis, 'clearInterval', () => {});
  const clearTimeout = t.mock.method(globalThis, 'clearTimeout', () => {});
  const controller = new AbortController();
  const result = verifyWidgetInstallation('https://site.example:8443', 'correct-key', controller.signal);
  return { popup, sent, removed, clearInterval, clearTimeout, controller, result, poll: () => poll(), expire: () => expire(), reply: changes => receive({
    source: popup, origin: 'https://site.example:8443',
    data: { type: 'REPORTY_WIDGET_VERIFIED', nonce: sent[0].data.nonce, key: 'correct-key' }, ...changes,
  }) };
}

test('verification waits for the exact window, origin including port, nonce and message type', async t => {
  const h = harness(t);
  let complete = false;
  h.result.then(() => { complete = true; });
  assert.equal(h.sent[0].origin, 'https://site.example:8443');
  for (const change of [
    { source: {} }, { origin: 'https://site.example' }, { origin: 'https://foreign.example' },
    { data: { type: 'REPORTY_WIDGET_VERIFIED', nonce: 'other', key: 'correct-key' } },
    { data: { type: 'OTHER', nonce: h.sent[0].data.nonce, key: 'correct-key' } },
    { data: null },
  ]) h.reply(change);
  await Promise.resolve();
  assert.equal(complete, false);
  h.reply({});
  await h.result;
  assert.equal(h.removed.length, 1);
  assert.equal(h.clearInterval.mock.callCount(), 1);
  assert.equal(h.clearTimeout.mock.callCount(), 1);
});

test('verification distinguishes a script for another environment', async t => {
  const h = harness(t);
  h.reply({ data: { type: 'REPORTY_WIDGET_VERIFIED', nonce: h.sent[0].data.nonce, key: 'wrong-key' } });
  await assert.rejects(h.result, /altro ambiente/);
  assert.equal(h.removed.length, 1);
});

test('verification reports a timeout and removes its listener and timers', async t => {
  const h = harness(t);
  h.expire();
  await assert.rejects(h.result, /15 secondi/);
  assert.equal(h.removed.length, 1);
});

test('verification reports blocked popups', async t => {
  const h = harness(t, true);
  await assert.rejects(h.result, /bloccato/);
  assert.equal(h.sent.length, 0);
  assert.equal(h.removed.length, 1);
});

test('verification reports early closure of the site tab', async t => {
  const h = harness(t);
  h.popup.closed = true;
  h.poll();
  await assert.rejects(h.result, /chiusa/);
  assert.equal(h.removed.length, 1);
});

test('leaving the environment cancels the pending verification', async t => {
  const h = harness(t);
  h.controller.abort();
  await assert.rejects(h.result, { name: 'AbortError' });
  assert.equal(h.removed.length, 1);
});
