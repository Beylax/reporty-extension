import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../apps/web/public/widget/reporty.js', import.meta.url), 'utf8');
test('loader downloads the panel only after enabling its environment', async () => {
  let enabled = false;
  let poll;
  const appended = [];
  const requests = [];
  vm.runInNewContext(source, {
    document: {
      currentScript: { dataset: { reporty: 'environment-key' }, src: 'https://reporty.example/widget/reporty.js' },
      createElement: () => ({ dataset: {} }),
      head: { append: script => appended.push(script) },
    },
    window: { opener: null, addEventListener() {} },
    URL, encodeURIComponent,
    fetch: async (url, options) => { requests.push({url, options}); return {ok: true, json: async () => ({enabled})}; },
    setInterval: callback => { poll = callback; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(appended.length, 0);
  enabled = true;
  await poll();
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, 'https://reporty.example/widget/panel.js');
  assert.equal(appended[0].dataset.reporty, 'environment-key');
  assert.equal(requests[0].options.credentials, 'omit');
  await poll();
  assert.equal(appended.length, 1);
  appended[0].onerror();
  await poll();
  assert.equal(appended.length, 2);
});

test('installation handshake works while disabled and replies only to the dashboard opener', async () => {
  let receive;
  const replies = [];
  const opener = { postMessage: (data, origin) => replies.push({ data, origin }) };
  const nonce = '12345678-1234-1234-1234-123456789abc';
  vm.runInNewContext(source, {
    document: { currentScript: { dataset: { reporty: 'environment-key' }, src: 'https://reporty.example/widget/reporty.js' } },
    window: { opener, addEventListener: (name, callback) => { assert.equal(name, 'message'); receive = callback; } },
    URL, encodeURIComponent,
    fetch: async () => ({ ok: true, json: async () => ({ enabled: false }) }),
    setInterval() {},
  });
  const request = { origin: 'https://reporty.example', source: opener, data: { type: 'REPORTY_VERIFY_WIDGET', nonce } };
  for (const change of [
    { origin: 'https://foreign.example' }, { source: { postMessage() {} } },
    { data: { type: 'REPORTY_VERIFY_WIDGET', nonce: 'invalid' } },
    { data: { type: 'OTHER', nonce } }, { data: null },
  ]) receive({ ...request, ...change });
  assert.equal(replies.length, 0);
  receive(request);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].origin, 'https://reporty.example');
  assert.equal(replies[0].data.type, 'REPORTY_WIDGET_VERIFIED');
  assert.equal(replies[0].data.nonce, nonce);
  assert.equal(replies[0].data.key, 'environment-key');
  assert.deepEqual(Object.keys(replies[0].data).sort(), ['key', 'nonce', 'type']);
});
