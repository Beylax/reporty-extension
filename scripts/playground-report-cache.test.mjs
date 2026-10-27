import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaygroundReportCache } from '../apps/web/lib/playground-report-cache.ts';

const detail = (status = 'open', priority = 'medium') => ({ report: { id: 'report', status, priority }, comments: [] });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('reopening uses the fresh detail, deduplicates reads and refreshes stale data without clearing it', async () => {
  let time = 1, reads = 0;
  const response = deferred();
  const cache = createPlaygroundReportCache(() => { reads++; return response.promise; }, async () => {}, () => time);
  const first = cache.refresh('/', 'report'), duplicate = cache.refresh('/', 'report');
  assert.equal(reads, 1);
  response.resolve(detail());
  await Promise.all([first, duplicate]);
  const snapshot = cache.get('/', 'report');
  await cache.refresh('/', 'report');
  assert.equal(cache.get('/', 'report'), snapshot);
  assert.equal(reads, 1);
  time += 30_000;
  const refresh = cache.refresh('/', 'report');
  assert.equal(cache.get('/', 'report'), snapshot);
  await refresh;
  assert.equal(reads, 2);
});

test('rapid status and priority clicks apply immediately and save in click order without detail reloads', async () => {
  const calls = [], responses = [deferred(), deferred(), deferred()];
  let reads = 0;
  const cache = createPlaygroundReportCache(async () => { reads++; return detail(); }, async (id, change) => {
    const index = calls.length;
    calls.push({ id, change });
    await responses[index].promise;
  });
  await cache.refresh('/', 'report');
  const one = cache.update('/', 'report', { status: 'in_progress' });
  const two = cache.update('/', 'report', { priority: 'high' });
  const three = cache.update('/', 'report', { status: 'resolved' });
  assert.equal(cache.get('/', 'report').report.status, 'resolved');
  assert.equal(cache.get('/', 'report').report.priority, 'high');
  await tick();
  assert.equal(calls.length, 1);
  responses[0].resolve(); await one; await tick();
  assert.equal(cache.get('/', 'report').report.status, 'resolved');
  assert.equal(calls.length, 2);
  responses[1].resolve(); await two; await tick();
  responses[2].resolve(); await three;
  assert.deepEqual(calls.map(call => call.change), [{ status: 'in_progress' }, { priority: 'high' }, { status: 'resolved' }]);
  assert.equal(reads, 1);
});

test('a failed write rolls back its field and preserves later changes', async () => {
  const first = deferred(), second = deferred();
  let saves = 0;
  const cache = createPlaygroundReportCache(async () => detail(), () => ++saves === 1 ? first.promise : second.promise);
  await cache.refresh('/', 'report');
  const one = cache.update('/', 'report', { status: 'resolved' });
  const failed = assert.rejects(one, /denied/);
  const two = cache.update('/', 'report', { priority: 'high' });
  first.reject(new Error('denied'));
  await failed;
  assert.equal(cache.get('/', 'report').report.status, 'open');
  assert.equal(cache.get('/', 'report').report.priority, 'high');
  second.resolve(); await two;
  assert.equal(saves, 2);
});

test('two failed changes of the same field restore the last confirmed value', async () => {
  const cache = createPlaygroundReportCache(async () => detail(), async () => { throw new Error('offline'); });
  await cache.refresh('/', 'report');
  const one = assert.rejects(cache.update('/', 'report', { status: 'in_progress' }), /offline/);
  const two = assert.rejects(cache.update('/', 'report', { status: 'resolved' }), /offline/);
  await Promise.all([one, two]);
  assert.equal(cache.get('/', 'report').report.status, 'open');
});

test('a stale read cannot overwrite a newer saved value', async () => {
  const stale = deferred();
  let reads = 0;
  const cache = createPlaygroundReportCache(() => ++reads === 1 ? Promise.resolve(detail()) : stale.promise, async () => {});
  await cache.refresh('/', 'report');
  const refresh = cache.refresh('/', 'report', true);
  await cache.update('/', 'report', { status: 'resolved' });
  stale.resolve(detail()); await refresh;
  assert.equal(cache.get('/', 'report').report.status, 'resolved');
});

test('a failed later click returns to the successfully saved value of the same field', async () => {
  let saves = 0;
  const cache = createPlaygroundReportCache(async () => detail(), async () => {
    if (++saves === 2) throw new Error('denied');
  });
  await cache.refresh('/', 'report');
  const one = cache.update('/', 'report', { status: 'in_progress' });
  const two = assert.rejects(cache.update('/', 'report', { status: 'resolved' }), /denied/);
  await Promise.all([one, two]);
  assert.equal(cache.get('/', 'report').report.status, 'in_progress');
});

test('invalidating after an edit bypasses an older in-flight read', async () => {
  const stale = deferred();
  let reads = 0;
  const cache = createPlaygroundReportCache(() => {
    reads++;
    return reads === 2 ? stale.promise : Promise.resolve({ ...detail(), comments: reads === 3 ? [{ id: 'new-reply' }] : [] });
  }, async () => {});
  await cache.refresh('/', 'report');
  const oldRead = cache.refresh('/', 'report', true);
  cache.expire('/', 'report');
  await cache.refresh('/', 'report', true);
  assert.equal(cache.get('/', 'report').comments[0].id, 'new-reply');
  stale.resolve(detail()); await oldRead;
  assert.equal(cache.get('/', 'report').comments[0].id, 'new-reply');
});

test('closing and reopening during a save retains the optimistic value and waits before reading', async () => {
  const saving = deferred();
  let reads = 0, notifications = 0;
  const cache = createPlaygroundReportCache(async () => { reads++; return detail(); }, () => saving.promise);
  await cache.refresh('/', 'report');
  const unsubscribe = cache.subscribe(() => notifications++);
  const write = cache.update('/', 'report', { priority: 'high' });
  unsubscribe();
  const reopen = cache.refresh('/', 'report');
  assert.equal(cache.get('/', 'report').report.priority, 'high');
  saving.resolve(); await Promise.all([write, reopen]);
  assert.equal(reads, 1);
  assert.equal(notifications, 1);
  assert.equal(cache.get('/', 'report').report.priority, 'high');
});

test('cache is scoped to its owner and exact page path, and invalidation reloads edits and replies', async () => {
  let reads = 0;
  const load = async () => { reads++; return detail(); };
  const cache = createPlaygroundReportCache(load, async () => {});
  const other = createPlaygroundReportCache(load, async () => {});
  await cache.refresh('/#/one', 'report');
  assert.equal(other.get('/#/one', 'report'), undefined);
  assert.equal(cache.get('/#/two', 'report'), undefined);
  cache.expire('/#/one', 'report');
  await cache.refresh('/#/one', 'report');
  assert.equal(reads, 2);
  cache.remove('/#/one', 'report');
  assert.equal(cache.get('/#/one', 'report'), undefined);
});

test('failed reads can be retried and background failures retain the cached detail', async () => {
  let reads = 0;
  const cache = createPlaygroundReportCache(async () => {
    if (++reads !== 2) throw new Error('offline');
    return detail();
  }, async () => {});
  await assert.rejects(cache.refresh('/', 'report'), /offline/);
  assert.equal(cache.get('/', 'report'), undefined);
  await cache.refresh('/', 'report');
  await assert.rejects(cache.refresh('/', 'report', true), /offline/);
  assert.equal(cache.get('/', 'report').report.status, 'open');
});
