import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOTIFICATIONS_CHANGED, startNotificationPolling } from '../apps/web/lib/notification-polling.ts';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function surfaces() {
  return { page: Object.assign(new EventTarget(), { visibilityState: 'visible' }), view: new EventTarget() };
}

test('notification polling continues without reloading, pauses hidden tabs and resumes on focus', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { page, view } = surfaces();
  let calls = 0;
  const stop = startNotificationPolling(async () => { calls++; }, page, view);
  assert.equal(calls, 1);
  await flush();
  t.mock.timers.tick(10000); await flush();
  assert.equal(calls, 2);
  t.mock.timers.tick(10000); await flush();
  assert.equal(calls, 3);
  page.visibilityState = 'hidden';
  t.mock.timers.tick(20000); await flush();
  assert.equal(calls, 3);
  page.visibilityState = 'visible';
  page.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(calls, 4);
  view.dispatchEvent(new Event('focus')); await flush();
  assert.equal(calls, 5);
  view.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)); await flush();
  assert.equal(calls, 6);
  stop();
  t.mock.timers.tick(20000);
  view.dispatchEvent(new Event('focus'));
  view.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 6);
});

test('slow notification requests do not overlap and the following poll fetches new data', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { page, view } = surfaces();
  let finish;
  let calls = 0;
  const stop = startNotificationPolling(() => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  }, page, view);
  t.mock.timers.tick(30000);
  view.dispatchEvent(new Event('focus'));
  view.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  assert.equal(calls, 1);
  finish(); await flush();
  t.mock.timers.tick(10000);
  assert.equal(calls, 2);
  stop(); finish(); await flush();
});
