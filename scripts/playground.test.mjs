import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { getPageContext } from '../packages/shared/src/page.ts';
const source = stripTypeScriptTypes(await readFile(new URL('../apps/web/lib/playground.ts', import.meta.url), 'utf8')).replace(/import .*?;\n/, '').replaceAll('export ', '');
const { playgroundUrl, isPlaygroundMessage, isViewportDimension, playgroundFrameLayout } = new Function('getPageContext', source + '\nreturn {playgroundUrl,isPlaygroundMessage,isViewportDimension,playgroundFrameLayout};')(getPageContext);
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

test('fluid and fullscreen layouts use the available content box without scaling', () => {
  const preset = {width:1440,height:900};
  assert.deepEqual(playgroundFrameLayout(preset,{width:1080.8,height:640.5},true),{width:1080,height:640,scale:1});
  assert.deepEqual(playgroundFrameLayout(preset,{width:1320,height:640},true),{width:1320,height:640,scale:1});
  assert.deepEqual(playgroundFrameLayout(preset,{width:0,height:0},true),{width:0,height:0,scale:0});
  assert.deepEqual(preset,{width:1440,height:900});
});
test('fixed viewports retain their dimensions and fit inside both container axes', () => {
  assert.deepEqual(playgroundFrameLayout({width:1440,height:900},{width:720,height:600},false),{width:1440,height:900,scale:0.5});
  assert.deepEqual(playgroundFrameLayout({width:390,height:844},{width:900,height:422},false),{width:390,height:844,scale:0.5});
  assert.deepEqual(playgroundFrameLayout({width:390,height:844},{width:900,height:900},false),{width:390,height:844,scale:1});
});
