import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaygroundBridge } from '../apps/extension/lib/playground-bridge.ts';

const api = 'https://reporty.example';
const key = 'public-key';
const nonce = '2c17dceb-1675-4bbf-8cd6-93805c779bea';
const id = '21bdd379-5b2b-47cf-a4fa-e4ce8a3be419';
function setup(t) {
  const sent = [], listeners = new Map();
  const parent = { postMessage: (message, origin) => sent.push({ message, origin }) };
  const target = { parent, location: { href: 'https://site.example/page' }, crypto,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type),
  };
  const bridge = createPlaygroundBridge(api, key, target);
  t.after(() => bridge.dispose());
  return { bridge, sent, target, emit: (data, overrides = {}) => listeners.get('message')?.({ data, origin: api, source: parent, ...overrides }),
    connect(overrides = {}) { this.emit({ type: 'REPORTY_PLAYGROUND_CONNECT', nonce, key, ...overrides }); },
  };
}

test('handshake rejects other windows, origins, keys and malformed nonces', t => {
  const s = setup(t);
  const data = { type: 'REPORTY_PLAYGROUND_CONNECT', nonce, key };
  s.emit(data, { source: {} });
  s.emit(data, { origin: 'https://evil.example' });
  s.connect({ key: 'other' }); s.connect({ nonce: 'invalid' });
  assert.equal(s.sent.length, 0);
  s.bridge.setEnabled(true); s.connect();
  assert.deepEqual(s.sent.at(-1), { origin: api, message: { type: 'REPORTY_PLAYGROUND_PAGE', nonce, key, url: s.target.location.href, enabled: true } });
  s.target.location.href = 'https://site.example/next#/route';
  s.connect();
  assert.equal(s.sent.at(-1).message.url, s.target.location.href);
  s.bridge.setEnabled(false);
  assert.equal(s.sent.at(-1).message.enabled, false);
});

test('selection requires established nonce, enabled widget and valid report id', t => {
  const s = setup(t), selected = [];
  s.bridge.subscribeSelection(value => selected.push(value));
  const select = { type: 'REPORTY_PLAYGROUND_SELECT', nonce, id };
  s.emit(select); s.connect(); s.emit(select);
  assert.equal(selected.length, 0);
  s.bridge.setEnabled(true);
  s.emit({ ...select, nonce: id }); s.emit({ ...select, id: 'invalid' });
  assert.equal(selected.length, 0);
  s.emit(select); s.emit(select);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].id, id);
  assert.notEqual(selected[0].requestId, selected[1].requestId);
});

test('external details require an explicit handshake and transmit only a report reference', t => {
  const s = setup(t);
  s.bridge.setEnabled(true);
  assert.equal(s.bridge.openReport(id), false);
  s.connect();
  assert.equal(s.bridge.openReport(id), false);
  s.connect({ externalDetails: true });
  assert.equal(s.bridge.openReport('invalid'), false);
  assert.equal(s.bridge.openReport(id), true);
  assert.deepEqual(s.sent.at(-1), { origin: api, message: { type: 'REPORTY_PLAYGROUND_OPEN_REPORT', nonce, key, id, url: s.target.location.href } });
  s.bridge.setEnabled(false);
  assert.equal(s.bridge.openReport(id), false);
  s.bridge.setEnabled(true);
  s.connect({ externalDetails: false });
  assert.equal(s.bridge.openReport(id), false);
  s.bridge.dispose();
  assert.equal(s.bridge.openReport(id), false);
});

test('focus-only selections and refreshes keep the same trusted channel checks', t => {
  const s = setup(t), selected = [];
  let refreshes = 0;
  s.bridge.subscribeSelection(value => selected.push(value));
  const unsubscribe = s.bridge.subscribeRefresh(() => refreshes++);
  s.bridge.setEnabled(true); s.connect({ externalDetails: true });
  const focus = { type: 'REPORTY_PLAYGROUND_SELECT', nonce, id, focusOnly: true };
  s.emit(focus, { source: {} }); s.emit(focus, { origin: 'https://evil.example' }); s.emit({ ...focus, nonce: id });
  assert.equal(selected.length, 0);
  s.emit(focus);
  assert.equal(selected[0].focusOnly, true);
  const refresh = { type: 'REPORTY_PLAYGROUND_REFRESH', nonce };
  s.emit(refresh, { source: {} }); s.emit(refresh, { origin: 'https://evil.example' }); s.emit({ ...refresh, nonce: id });
  assert.equal(refreshes, 0);
  s.emit(refresh);
  assert.equal(refreshes, 1);
  s.bridge.setEnabled(false); s.emit(refresh);
  assert.equal(refreshes, 1);
  s.bridge.setEnabled(true); unsubscribe(); s.emit(refresh);
  assert.equal(refreshes, 1);
});

test('capture matches request and nonce, validates image and refuses stale navigation', async t => {
  const s = setup(t);
  await assert.rejects(s.bridge.captureScreenshot(), /Collegamento/);
  s.connect(); s.bridge.setEnabled(true);
  const capture = s.bridge.captureScreenshot();
  const request = s.sent.at(-1).message;
  s.emit({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', nonce: id, requestId: request.requestId, image: 'data:image/jpeg;base64,YQ==' });
  s.emit({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', nonce, requestId: 'other', image: 'data:image/jpeg;base64,YQ==' });
  s.emit({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', nonce, requestId: request.requestId, image: 'data:image/jpeg;base64,YQ==' });
  assert.equal(await capture, 'data:image/jpeg;base64,YQ==');
  const stale = s.bridge.captureScreenshot();
  const next = s.sent.at(-1).message;
  s.target.location.href += '/navigated';
  s.emit({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', nonce, requestId: next.requestId, image: 'data:image/jpeg;base64,YQ==' });
  await assert.rejects(stale, /pagina è cambiata/);
});

test('capture rejects unsafe image and is cancelled when disabled or disposed', async t => {
  const s = setup(t); s.connect(); s.bridge.setEnabled(true);
  const unsafe = s.bridge.captureScreenshot();
  s.emit({ type: 'REPORTY_PLAYGROUND_CAPTURE_RESULT', nonce, requestId: s.sent.at(-1).message.requestId, image: 'data:image/svg+xml;base64,YQ==' });
  await assert.rejects(unsafe, /Screenshot/);
  const disabled = s.bridge.captureScreenshot();
  s.bridge.setEnabled(false);
  await assert.rejects(disabled, /disabilitato/);
  s.bridge.setEnabled(true);
  const pending = s.bridge.captureScreenshot();
  s.bridge.dispose();
  await assert.rejects(pending, /chiuso/);
});

test('URL polling reports SPA navigation once and stops after disposal', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const s = setup(t); s.connect();
  const initial = s.sent.length;
  t.mock.timers.tick(700);
  assert.equal(s.sent.length, initial);
  s.target.location.href = 'https://site.example/page?filter=one#!/settings';
  t.mock.timers.tick(700);
  assert.equal(s.sent.length, initial + 1);
  assert.equal(s.sent.at(-1).message.url, s.target.location.href);
  t.mock.timers.tick(700);
  assert.equal(s.sent.length, initial + 1);
  s.bridge.dispose();
  s.target.location.href += '/other';
  t.mock.timers.tick(700);
  assert.equal(s.sent.length, initial + 1);
});

test('capture expires and a new handshake cancels a previous session', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup(t); s.connect(); s.bridge.setEnabled(true);
  const timed = s.bridge.captureScreenshot();
  const timedCheck = assert.rejects(timed, /scaduto/);
  t.mock.timers.tick(120_000);
  await timedCheck;
  const replaced = s.bridge.captureScreenshot();
  const replacedCheck = assert.rejects(replaced, /sessione playground è cambiata/);
  s.connect({ nonce: id });
  await replacedCheck;
});
