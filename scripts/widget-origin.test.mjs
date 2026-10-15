import { test } from 'node:test';
import assert from 'node:assert/strict';
import { widgetOriginAllowed } from '../apps/web/lib/widget-origin.ts';

test('widget accepts its configured origin and literal localhost only', () => {
  const configured = 'https://site.example:8443';
  for (const origin of [configured, 'http://localhost', 'http://localhost:3000', 'https://localhost:8443']) {
    assert.equal(widgetOriginAllowed(configured, origin), true, origin);
  }
  for (const origin of ['https://site.example', 'http://site.example:8443', 'https://foreign.example', 'http://localhost.evil.test', 'http://localhost@evil.test', 'http://localhost:3000/path', 'http://127.0.0.1:3000', 'null', '']) {
    assert.equal(widgetOriginAllowed(configured, origin), false, origin);
  }
});
