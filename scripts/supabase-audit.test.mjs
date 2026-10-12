import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCounts, parseSizes, quotaStatus, nonnegative } from '../apps/web/lib/supabase/audit-data.ts';

test('audit sums real samples and exposes their range', () => {
  const data = parseCounts({ result: [
    { timestamp: '2026-10-12T10:00:00Z', total_rest_requests: 3, total_auth_requests: 2, total_storage_requests: 1, total_realtime_requests: 0 },
    { timestamp: '2026-10-12T09:00:00Z', total_rest_requests: 4, total_auth_requests: 0, total_storage_requests: 2, total_realtime_requests: 1 },
  ] });
  assert.equal(data.total, 13);
  assert.equal(data.rest, 7);
  assert.equal(data.from, '2026-10-12T09:00:00.000Z');
  assert.equal(data.to, '2026-10-12T10:00:00.000Z');
});
test('audit never treats missing metrics as zero', () => {
  for (const input of [{}, { error: 'unavailable', result: [] }, { result: [] }, { result: [{}] }]) assert.throws(() => parseCounts(input));
  assert.deepEqual(parseSizes([{ bytes: null, screenshot_bytes: '1024' }], ['bytes','screenshot_bytes']), { bytes: null, screenshot_bytes: 1024 });
  assert.throws(() => parseSizes({}, ['bytes']));
  for (const value of [null, undefined, '', -1, 'NaN', Infinity]) assert.equal(nonnegative(value), null);
});
test('quota warnings use actual usage, preserving overages', () => {
  assert.deepEqual(quotaStatus(null, 100), { percent: null, level: 'unknown' });
  assert.equal(quotaStatus(79, 100).level, 'ok');
  assert.equal(quotaStatus(80, 100).level, 'warning');
  assert.equal(quotaStatus(110, 100).level, 'exceeded');
  assert.ok(Math.abs(quotaStatus(110, 100).percent - 110) < 1e-10);
});
