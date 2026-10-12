import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesReportUsers } from './reports.ts';

test('user filter matches author OR last editor and selected identities', () => {
  const report = { authorKey: 'user:one', updatedByKey: 'guest:two' };
  assert.equal(matchesReportUsers(report, ['user:one']), true);
  assert.equal(matchesReportUsers(report, ['guest:two']), true);
  assert.equal(matchesReportUsers(report, ['guest:other', 'user:one']), true);
  assert.equal(matchesReportUsers(report, ['guest:one']), false);
});
test('user filter handles unmodified reports and empty selection', () => {
  assert.equal(matchesReportUsers({}, []), true);
  assert.equal(matchesReportUsers({ authorKey: 'user:one' }, ['guest:two']), false);
});
