import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { initializeTheme, setTheme, currentTheme } from '../apps/extension/lib/theme.ts';
import { themeBootstrap } from '../apps/web/lib/theme-bootstrap.ts';

async function surface(kind, { saved = null, dark = true, blocked = false } = {}) {
  const media = new EventTarget();
  media.matches = dark;
  const target = new EventTarget();
  target.dataset = {};
  target.style = { setProperty(key, value) { this[key] = value; } };
  const classes = new Set();
  target.classList = { toggle(key, enabled) { enabled ? classes.add(key) : classes.delete(key); }, contains(key) { return classes.has(key); } };
  const window = new EventTarget();
  const values = new Map(saved ? [['reporty-theme', saved]] : []);
  const localStorage = {
    getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('blocked'); values.set(key, value); },
  };
  const listeners = new Set();
  const browser = { storage: {
    local: {
      async get(key) { if (blocked) throw Error('blocked'); return { [key]: values.get(key) }; },
      async set(input) { if (blocked) throw Error('blocked'); for (const [key, value] of Object.entries(input)) values.set(key, value); },
    },
    onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
  } };
  const globals = { window, document: { documentElement: target }, matchMedia: () => media, localStorage, browser, Event };
  let cleanup = () => {};
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  if (kind === 'dashboard') runInNewContext(themeBootstrap, globals);
  else {
    Object.assign(globalThis, globals);
    cleanup = await initializeTheme(target, kind === 'widget' ? 'widget' : 'extension');
  }
  return {
    theme: () => kind === 'dashboard' ? (classes.has('dark') ? 'dark' : 'light') : currentTheme(target),
    system(dark) { media.matches = dark; media.dispatchEvent(new Event('change')); },
    choose(theme) {
      if (kind !== 'dashboard') setTheme(theme, target);
      else { const event = new Event('reporty-theme-choice'); event.detail = theme; window.dispatchEvent(event); }
    },
    external(theme) {
      if (kind === 'extension') for (const fn of listeners) fn({ 'reporty-theme': { newValue: theme } }, 'local');
      else { const event = new Event('storage'); event.key = 'reporty-theme'; event.newValue = theme; window.dispatchEvent(event); }
    },
    saved: () => values.get('reporty-theme'),
    close() {
      cleanup();
      if (kind !== 'dashboard') for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

for (const kind of ['widget', 'extension', 'dashboard']) {
  test(`${kind}: device theme is applied before settings, then explicit choice persists across reopening`, async () => {
    const ui = await surface(kind);
    try {
      assert.equal(ui.theme(), 'dark');
      assert.equal(ui.saved(), undefined);
      ui.system(false);
      assert.equal(ui.theme(), 'light');
      ui.choose('dark');
      assert.equal(ui.saved(), 'dark');
      ui.system(true);
      ui.system(false);
      assert.equal(ui.theme(), 'dark');
    } finally { ui.close(); }
    const reopened = await surface(kind, { saved: 'dark', dark: false });
    try { assert.equal(reopened.theme(), 'dark'); } finally { reopened.close(); }
  });
  test(`${kind}: saved light theme overrides dark device and synchronizes external choices`, async () => {
    const ui = await surface(kind, { saved: 'light' });
    try {
      assert.equal(ui.theme(), 'light');
      ui.system(false);
      ui.system(true);
      assert.equal(ui.theme(), 'light');
      ui.external('dark');
      assert.equal(ui.theme(), 'dark');
      ui.external(null);
      ui.system(false);
      assert.equal(ui.theme(), 'light');
    } finally { ui.close(); }
  });
  test(`${kind}: blocked storage keeps device fallback and explicit choice in memory`, async () => {
    const ui = await surface(kind, { blocked: true });
    try {
      assert.equal(ui.theme(), 'dark');
      ui.choose('light');
      ui.system(false);
      ui.system(true);
      assert.equal(ui.theme(), 'light');
    } finally { ui.close(); }
  });
}
