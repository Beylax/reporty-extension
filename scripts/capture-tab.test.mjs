import assert from 'node:assert/strict';
import test from 'node:test';
import { captureTab, stopTabCapture } from '../apps/extension/lib/capture-tab.ts';

let currentWindow = new EventTarget();
globalThis.window = currentWindow;
function setup({ wrongTab = false, denied = false } = {}) {
  stopTabCapture();
  let handle, requests = 0, draws = 0;
  const configs = [], tracks = [];
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://example.com' } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    setCaptureHandleConfig: config => { configs.push(config); handle = config.handle; },
    getDisplayMedia: async () => {
      requests++;
      if (denied) throw new DOMException('Cancelled', 'NotAllowedError');
      const track = Object.assign(new EventTarget(), {
        readyState: 'live',
        getSettings: () => ({ displaySurface: 'browser' }),
        getCaptureHandle: () => ({ handle: wrongTab ? 'another-tab' : handle }),
        stop() { this.readyState = 'ended'; },
      });
      tracks.push(track);
      return { getVideoTracks: () => [track], getTracks: () => [track] };
    },
  } } });
  currentWindow = new EventTarget();
  globalThis.window = currentWindow;
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.document = { createElement: tag => tag === 'video' ? { videoWidth: 1600, videoHeight: 1000, play: async () => {}, srcObject: null } : { getContext: () => ({ drawImage: () => { draws++; } }), toDataURL: () => `data:image/jpeg;base64,frame${draws}` } };
  return { configs, tracks, get requests() { return requests; }, get draws() { return draws; } };
}

test('requests sharing during the first gesture and captures fresh screenshots without further consent', async () => {
  const state = setup();
  const first = captureTab();
  assert.equal(state.requests, 1);
  assert.equal(await first, 'data:image/jpeg;base64,frame1');
  assert.equal(await captureTab(), 'data:image/jpeg;base64,frame2');
  assert.equal(state.requests, 1);
  assert.equal(state.tracks[0].readyState, 'live');
  stopTabCapture();
  assert.equal(state.tracks[0].readyState, 'ended');
  assert.equal(state.configs.at(-1).handle, '');
});

test('rejects a different tab and stops its tracks', async () => {
  const state = setup({ wrongTab: true });
  await assert.rejects(captureTab(), /scheda corrente/);
  assert.equal(state.tracks[0].readyState, 'ended');
  assert.equal(state.draws, 0);
  assert.equal(state.configs.at(-1).handle, '');
});

test('permission cancellation propagates and clears the capture handle', async () => {
  const state = setup({ denied: true });
  await assert.rejects(captureTab(), { name: 'NotAllowedError' });
  assert.equal(state.configs.at(-1).handle, '');
});

test('browser stop ends sharing and the next screenshot asks for consent again', async () => {
  const state = setup();
  await captureTab();
  state.tracks[0].readyState = 'ended';
  state.tracks[0].dispatchEvent(new Event('ended'));
  assert.equal(state.configs.at(-1).handle, '');
  await captureTab();
  assert.equal(state.requests, 2);
  stopTabCapture();
});

test('leaving the page releases the shared tab', async () => {
  const state = setup();
  await captureTab();
  currentWindow.dispatchEvent(new Event('pagehide'));
  assert.equal(state.tracks[0].readyState, 'ended');
  assert.equal(state.configs.at(-1).handle, '');
});

test('ending a session while browser consent is pending discards and stops the late stream', async () => {
  const state = setup();
  const request = navigator.mediaDevices.getDisplayMedia;
  let release;
  navigator.mediaDevices.getDisplayMedia = () => new Promise(resolve => { release = async () => resolve(await request()); });
  const capture = captureTab();
  stopTabCapture();
  await release();
  await assert.rejects(capture, /Condivisione interrotta/);
  assert.equal(state.tracks[0].readyState, 'ended');
  assert.equal(state.draws, 0);
});
