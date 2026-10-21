import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(await readFile(new URL('../packages/shared/ui/use-notification-feed.tsx', import.meta.url), 'utf8'))
  .replace(/import .* from 'react';/, 'const { useEffect, useEffectEvent, useRef, useState } = hooks;')
  .replace(/^import .*;\n/gm, '')
  .replace('export function useNotificationFeed', 'function useNotificationFeed');
const createHook = new Function('hooks', 'document', 'window', 'isPageActive', 'usePageActive', source + '\nreturn useNotificationFeed;');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const data = (extra = {}) => ({ items: [{ id: 'notification' }], total: 40, totalInScope: 40, unread: 1, cursor: { createdAt: '2026-10-21T10:00:00Z', id: 'notification' }, arrivalCount: 0, latest: null, projects: [], environments: [], ...extra });

function host(load) {
  const document = new EventTarget(), window = new EventTarget();
  let active = true, index = 0, dirty = false, effects = [], value;
  const slots = [], arrivals = [], errors = [];
  const options = { scope: 'page', enabled: false, pollingEnabled: true, onArrival: page => arrivals.push(page), onError: error => errors.push(error) };
  const hooks = {
    useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = initial; return [slots[slot], next => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; dirty = true; }]; },
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useEffect(callback, deps) { const slot = index++, old = slots[slot]; if (!old || deps.some((item, i) => !Object.is(item, old.deps[i]))) effects.push(() => { old?.cleanup?.(); slots[slot] = { deps, cleanup: callback() }; }); },
    useEffectEvent(callback) { const latest = hooks.useRef(callback); latest.current = callback; return (...args) => latest.current(...args); },
  };
  const useHook = createHook(hooks, document, window, () => active, () => active);
  return {
    get value() { return value; }, arrivals, errors,
    focus(next) { active = next; window.dispatchEvent(new Event(next ? 'focus' : 'blur')); },
    changed() { window.dispatchEvent(new Event('reporty:notifications-changed')); },
    render(next = {}) { Object.assign(options, next); do { dirty = false; index = 0; effects = []; value = useHook({ pagePath: '/' }, load, options); effects.forEach(effect => effect()); } while (dirty); return value; },
    close() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('notifications suspend summary, open history and pagination without focus or while Reporty is hidden', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const requests = [];
  const h = host(async query => { requests.push(query); return data(); });
  const settle = async () => { t.mock.timers.tick(0); await flush(); h.render(); t.mock.timers.tick(0); await flush(); h.render(); };
  try {
    h.focus(false); h.render({ enabled: true }); await settle();
    t.mock.timers.tick(30000); h.changed(); await flush(); assert.equal(requests.length, 0);
    h.focus(true); h.render(); await settle();
    assert.deepEqual(requests.map(query => query.mode), ['summary', 'page']);
    h.focus(false); h.render(); t.mock.timers.tick(30000); h.changed(); await h.value.loadMore(); await flush();
    assert.equal(requests.length, 2);
    h.focus(true); h.render({ pollingEnabled: false }); await settle();
    h.changed(); t.mock.timers.tick(30000); await h.value.loadMore(); await flush(); assert.equal(requests.length, 2);
    h.render({ pollingEnabled: true }); await settle();
    assert.equal(requests.filter(query => query.mode === 'summary').length, 2);
    assert.ok(requests.filter(query => query.mode === 'summary').at(-1).after, 'resuming preserves the arrival cursor');
    assert.equal(h.value.items[0].id, 'notification');
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});

test('suspending notifications aborts pending reads and ignores late arrivals', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let finish, signal;
  const h = host((_query, requestSignal) => { signal = requestSignal; return new Promise(resolve => { finish = resolve; }); });
  try {
    h.render(); t.mock.timers.tick(0);
    h.render({ pollingEnabled: false });
    assert.equal(signal.aborted, true);
    finish(data({ arrivalCount: 1, latest: { id: 'late' } })); await flush(); h.render();
    assert.equal(h.value.unread, 0);
    assert.deepEqual(h.arrivals, []);
    assert.deepEqual(h.errors, []);
  } finally { h.close(); }
});
