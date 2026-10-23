import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isUuid } from '../packages/shared/src/project.ts';
import { widgetConfigOrigin, widgetOriginAllowed } from '../apps/web/lib/widget-origin.ts';

test('widget accepts its configured origin and literal localhost only', () => {
  const configured = 'https://site.example:8443';
  for (const origin of [configured, 'http://localhost', 'http://localhost:3000', 'https://localhost:8443']) {
    assert.equal(widgetOriginAllowed(configured, origin), true, origin);
  }
  for (const origin of ['https://site.example', 'http://site.example:8443', 'https://foreign.example', 'http://localhost.evil.test', 'http://localhost@evil.test', 'http://localhost:3000/path', 'http://127.0.0.1:3000', 'null', '']) {
    assert.equal(widgetOriginAllowed(configured, origin), false, origin);
  }
});

const api = 'https://reporty-extension.vercel.app';
const key = '54dadc65-faee-44d8-a633-301668ffe30b';
function request(headers = {}, method = 'GET') {
  return new Request(`${api}/api/widget?key=${key}`, { method, headers });
}

test('configuration uses the API origin only for same-origin GETs without Origin', () => {
  assert.equal(widgetConfigOrigin(request({ 'sec-fetch-site': 'same-origin' })), api);
  for (const site of ['same-site', 'cross-site', 'none', '']) {
    assert.equal(widgetConfigOrigin(request({ 'sec-fetch-site': site, referer: `${api}/dashboard` })), '', site);
  }
  assert.equal(widgetConfigOrigin(request({ 'sec-fetch-site': 'same-origin' }, 'POST')), '');
  for (const origin of ['https://foreign.example', 'null', '']) {
    assert.equal(widgetConfigOrigin(request({ origin, 'sec-fetch-site': 'same-origin' })), origin);
  }
});

const source = stripTypeScriptTypes(await readFile(new URL('../apps/web/app/api/widget/route.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');
function handler(environmentOrigin = api, result = {}) {
  const calls = [];
  const GET = new Function('createClient', 'isUuid', 'widgetConfigOrigin', 'widgetOriginAllowed', `${source}\nreturn GET;`)(
    async () => ({ rpc: async (name, input) => {
      calls.push({ name, input });
      return { data: { enabled: true, environment: { origin: environmentOrigin } }, ...result };
    } }), isUuid, widgetConfigOrigin, widgetOriginAllowed,
  );
  return { GET, calls };
}

test('widget GET accepts the dashboard browser request without Origin and returns one configuration', async () => {
  const { GET, calls } = handler();
  const response = await GET(request({
    referer: `${api}/dashboard/projects/8cd0d4fb-ed05-4749-9ce6-aeaf8711b2b3?tab=environments`,
    'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty',
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).enabled, true);
  assert.deepEqual(calls, [{ name: 'widget_config', input: { key } }]);
  assert.equal(response.headers.get('access-control-allow-origin'), api);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Origin, Sec-Fetch-Site');
});

test('widget GET still rejects missing, opaque, foreign and mismatched environment origins', async () => {
  for (const headers of [
    {}, { referer: `${api}/dashboard` },
    { 'sec-fetch-site': 'cross-site', referer: `${api}/dashboard` },
    { origin: 'null', 'sec-fetch-site': 'same-origin' },
    { origin: 'https://foreign.example', 'sec-fetch-site': 'same-origin' },
  ]) {
    assert.equal((await handler().GET(request(headers))).status, 403, JSON.stringify(headers));
  }
  for (const origin of ['https://other.example', 'http://reporty-extension.vercel.app', `${api}:8443`]) {
    assert.equal((await handler(origin).GET(request({ 'sec-fetch-site': 'same-origin' }))).status, 403, origin);
  }
  for (const result of [{ data: null }, { error: { message: 'Database unavailable' } }]) {
    assert.equal((await handler(api, result).GET(request({ 'sec-fetch-site': 'same-origin' }))).status, 403);
  }
});

test('widget GET preserves cross-origin and localhost support, and the disabled configuration', async () => {
  for (const origin of ['https://site.example:8443', 'http://localhost:3000']) {
    const response = await handler('https://site.example:8443').GET(request({ origin, 'sec-fetch-site': 'cross-site' }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const disabled = { enabled: false, environment: { origin: api } };
  const response = await handler(api, { data: disabled }).GET(request({ 'sec-fetch-site': 'same-origin' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), disabled);
  const { GET, calls } = handler();
  assert.equal((await GET(new Request(`${api}/api/widget?key=invalid`, { headers: { 'sec-fetch-site': 'same-origin' } }))).status, 400);
  assert.deepEqual(calls, []);
});
