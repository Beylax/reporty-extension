import assert from 'node:assert/strict';
import test from 'node:test';
import { captureTab } from '../apps/extension/lib/capture-tab.ts';

test('requests sharing during the user gesture and rejects a different tab, stopping its tracks', async () => {
  let requested = false, stopped = false;
  const configs = [];
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://example.com' } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    setCaptureHandleConfig: config => configs.push(config),
    getDisplayMedia: async () => {
      requested = true;
      const track = { getSettings: () => ({ displaySurface: 'browser' }), getCaptureHandle: () => ({ handle: 'another-tab' }), stop: () => { stopped = true; } };
      return { getVideoTracks: () => [track], getTracks: () => [track] };
    },
  } } });
  globalThis.document = { createElement: () => ({ srcObject: null }) };
  const capture = captureTab();
  assert.equal(requested, true);
  await assert.rejects(capture, /scheda corrente/);
  assert.equal(stopped, true);
  assert.equal(configs.at(-1).handle, '');
});

test('permission cancellation propagates and clears the capture handle', async () => {
  const configs = [];
  navigator.mediaDevices.setCaptureHandleConfig = config => configs.push(config);
  navigator.mediaDevices.getDisplayMedia = async () => { throw new DOMException('Cancelled', 'NotAllowedError'); };
  await assert.rejects(captureTab(), { name: 'NotAllowedError' });
  assert.equal(configs.at(-1).handle, '');
});
