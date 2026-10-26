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
  const video = { videoWidth: 1600, videoHeight: 1000, play: async () => {}, srcObject: null };
  globalThis.document = { createElement: tag => tag === 'video' ? video : { getContext: () => ({ drawImage: () => { draws++; } }), toDataURL: () => `data:image/jpeg;base64,frame${draws}` } };
  return { configs, tracks, video, get requests() { return requests; }, get draws() { return draws; } };
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

test('reused sharing skips the buffered frame before drawing the page with Reporty hidden', async () => {
  const state = setup();
  await captureTab();
  const frames = [];
  state.video.requestVideoFrameCallback = callback => { frames.push(callback); return frames.length; };
  state.video.cancelVideoFrameCallback = () => {};
  const capture = captureTab();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.draws, 1);
  assert.equal(frames.length, 1);
  frames.shift()(); // The first delivered frame may still contain the panel.
  assert.equal(state.draws, 1);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(await capture, 'data:image/jpeg;base64,frame2');
  assert.equal(state.requests, 1);
  stopTabCapture();
});

test('stopping sharing while waiting for fresh frames prevents drawing', async () => {
  const state = setup();
  await captureTab();
  const frames = [];
  state.video.requestVideoFrameCallback = callback => { frames.push(callback); return frames.length; };
  state.video.cancelVideoFrameCallback = () => {};
  const capture = captureTab();
  await new Promise(resolve => setImmediate(resolve));
  stopTabCapture();
  frames.shift()();
  frames.shift()();
  await assert.rejects(capture, /Condivisione interrotta/);
  assert.equal(state.draws, 1);
});

test('every reused capture still validates that the shared source is the current tab', async () => {
  const state = setup();
  await captureTab();
  state.tracks[0].getCaptureHandle = () => ({ handle: 'different-source' });
  await assert.rejects(captureTab(), /scheda corrente/);
  assert.equal(state.requests, 1);
  assert.equal(state.draws, 1);
  assert.equal(state.tracks[0].readyState, 'ended');
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

test('a rendering error does not require the user to share the tab again', async () => {
  const state = setup();
  const createElement = document.createElement;
  document.createElement = tag => tag === 'canvas' ? { getContext: () => null } : createElement(tag);
  await assert.rejects(captureTab(), /Acquisizione immagine non disponibile/);
  assert.equal(state.tracks[0].readyState, 'live');
  document.createElement = createElement;
  assert.equal(await captureTab(), 'data:image/jpeg;base64,frame1');
  assert.equal(state.requests, 1);
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
