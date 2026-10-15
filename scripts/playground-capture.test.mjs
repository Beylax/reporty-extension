import assert from 'node:assert/strict';
import test from 'node:test';
import { capturePlaygroundFrame } from '../apps/web/lib/playground-capture.ts';

function setup({ wrongTab = false, denied = false } = {}) {
  let handle, stopped = false, requested = false, drawn;
  const configs = [];
  const track = { getSettings: () => ({ displaySurface: 'browser' }), getCaptureHandle: () => ({ handle: wrongTab ? 'other' : handle }), stop: () => { stopped = true; } };
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://dashboard.example' } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    setCaptureHandleConfig: config => { configs.push(config); handle = config.handle; },
    getDisplayMedia: async () => { requested = true; if (denied) throw new DOMException('Cancelled', 'NotAllowedError'); return { getVideoTracks: () => [track], getTracks: () => [track] }; },
  } } });
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.document = { createElement: tag => tag === 'video' ? { videoWidth: 3200, videoHeight: 2000, play: async () => {}, srcObject: null } : { getContext: () => ({ drawImage: (...args) => { drawn = args.slice(1); } }), toDataURL: () => 'data:image/jpeg;base64,frame' } };
  const frame = { isConnected: true, clientWidth: 1440, clientHeight: 900, getBoundingClientRect: () => ({ left: 400, top: 100, right: 1120, bottom: 550, width: 720, height: 450 }) };
  return { frame, configs, get stopped() { return stopped; }, get requested() { return requested; }, get drawn() { return drawn; } };
}
test('capture starts in the click handler, crops the scaled iframe and stops all tracks', async () => {
  const state = setup();
  const capture = capturePlaygroundFrame(state.frame, () => true);
  assert.equal(state.requested, true);
  assert.equal(await capture, 'data:image/jpeg;base64,frame');
  assert.deepEqual(state.drawn, [800, 200, 1440, 900, 0, 0, 1440, 900]);
  assert.equal(state.stopped, true);
  assert.equal(state.configs.at(-1).handle, '');
});
test('wrong tab and navigation races reject images while cleaning capture tracks', async () => {
  for (const wrongTab of [true, false]) {
    const state = setup({wrongTab});
    await assert.rejects(capturePlaygroundFrame(state.frame, () => false), wrongTab ? /scheda corrente/ : /pagina è cambiata/);
    assert.equal(state.stopped, true);
    assert.equal(state.configs.at(-1).handle, '');
  }
});
test('cancelled browser permission cleans the capture handle', async () => {
  const state = setup({denied:true});
  await assert.rejects(capturePlaygroundFrame(state.frame, () => true), {name:'NotAllowedError'});
  assert.equal(state.configs.at(-1).handle, '');
});
test('a second capture cannot overwrite an active capture handle', async () => {
  const state = setup();
  let release;
  const firstRequest = navigator.mediaDevices.getDisplayMedia;
  navigator.mediaDevices.getDisplayMedia = () => new Promise(resolve => { release = async () => resolve(await firstRequest()); });
  const first = capturePlaygroundFrame(state.frame, () => true);
  await assert.rejects(capturePlaygroundFrame(state.frame, () => true), /già in corso/);
  assert.equal(state.configs.length, 1);
  await release();
  await first;
  assert.equal(state.stopped, true);
});
test('detached or clipped frames cannot produce a misleading screenshot', async () => {
  for (const detached of [true, false]) {
    const state = setup();
    if (detached) state.frame.isConnected = false;
    else state.frame.getBoundingClientRect = () => ({left:-10,top:100,right:710,bottom:550,width:720,height:450});
    await assert.rejects(capturePlaygroundFrame(state.frame, () => true), detached ? /pagina è cambiata/ : /interamente visibile/);
    assert.equal(state.stopped, true);
  }
});
