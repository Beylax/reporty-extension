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
