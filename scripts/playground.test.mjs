import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { getPageContext } from '../packages/shared/src/page.ts';
const source = stripTypeScriptTypes(await readFile(new URL('../apps/web/lib/playground.ts', import.meta.url), 'utf8')).replace(/import .*?;\n/, '').replaceAll('export ', '');
const { playgroundUrl, isPlaygroundMessage, isViewportDimension } = new Function('getPageContext', source + '\nreturn {playgroundUrl,isPlaygroundMessage,isViewportDimension};')(getPageContext);
test('playground URLs stay on the exact environment origin, including port and protocol', () => {
  const origin = 'https://example.com:8443';
  assert.equal(playgroundUrl('/products?q=test#/detail?x=y', origin), `${origin}/products?q=test#/detail?x=y`);
  for (const input of ['javascript:alert(1)', '//other.example/path', 'http://example.com:8443/', 'https://example.com/', 'https://user:secret@example.com:8443/']) assert.throws(() => playgroundUrl(input, origin));
  assert.equal(getPageContext(playgroundUrl('/#/products?sort=name', origin)).pagePath, '/#/products');
});
test('messages require the iframe window, selected origin and current nonce', () => {
  const contentWindow = {}, frame = { contentWindow };
  const event = { source: contentWindow, origin: 'https://example.com', data: { nonce: 'current' } };
  assert.equal(isPlaygroundMessage(event, frame, event.origin, 'current'), true);
  for (const patch of [{source:{}},{origin:'http://example.com'},{data:null},{data:{nonce:'old'}}]) assert.equal(isPlaygroundMessage({...event,...patch}, frame, event.origin, 'current'), false);
});
test('viewport dimensions reject fractions, missing values and excessive allocations', () => {
  for (const value of [240, 390, 1440, 3840]) assert.equal(isViewportDimension(value), true);
  for (const value of [0, 239, 3841, 390.5, NaN, Infinity]) assert.equal(isViewportDimension(value), false);
});
