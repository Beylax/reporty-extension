import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotificationArrivalTracker, notificationKind, notificationSummary } from './notifications.ts';

const unread = (id: string) => ({ id, read_at: null });
test('history is silent and new unread notifications produce exactly one arrival', () => {
  const collect = createNotificationArrivalTracker();
  assert.deepEqual(collect([unread('historical')]), []);
  assert.deepEqual(collect([unread('new'), unread('historical')]), [unread('new')]);
  assert.deepEqual(collect([unread('new'), unread('historical')]), []);
  assert.deepEqual(collect([unread('historical'), unread('new')]), []);
});
test('an empty initial snapshot still detects subsequent arrivals and batches multiple IDs', () => {
  const collect = createNotificationArrivalTracker();
  assert.deepEqual(collect([]), []);
  assert.deepEqual(collect([unread('one'), unread('two'), unread('one')]), [unread('one'), unread('two')]);
});
test('read notifications and reading changes never trigger another arrival', () => {
  const collect = createNotificationArrivalTracker();
  collect([]);
  assert.deepEqual(collect([{ id: 'read-elsewhere', read_at: '2026-10-12T12:00:00Z' }]), []);
  assert.deepEqual(collect([unread('read-elsewhere')]), []);
  collect([unread('new')]);
  assert.deepEqual(collect([{ id: 'new', read_at: '2026-10-12T12:00:00Z' }]), []);
});
test('temporarily missing notifications are not announced again when they reappear', () => {
  const collect = createNotificationArrivalTracker();
  collect([unread('historical')]);
  collect([]);
  assert.deepEqual(collect([unread('historical')]), []);
  assert.deepEqual(createNotificationArrivalTracker()([unread('other-page-history')]), []);
});

test('notification types distinguish replies from creation and preserve legacy status events', () => {
  const base = { actor_name: 'Reviewer', previous_status: null, status: 'open' as const };
  assert.equal(notificationKind(base),'created');
  assert.equal(notificationKind({ ...base, previous_status: 'validation' }),'status_changed');
  assert.equal(notificationKind({ ...base, kind: 'reply' }),'reply');
  assert.match(notificationSummary(base),/Nuova segnalazione/);
  assert.match(notificationSummary({ ...base, kind: 'reply' }),/Nuova risposta/);
  assert.match(notificationSummary({ ...base, previous_status: 'validation' }),/Validazione → Aperta/);
});
