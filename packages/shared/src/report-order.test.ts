import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareReports } from './report-order.ts';
import type { Report } from './reports';
test('reports sort by status before priority', () => {
  const rows = [
    {id:'closed',status:'resolved',priority:'high'},
    {id:'validation',status:'validation',priority:'high'},
    {id:'working',status:'in_progress',priority:'high'},
    {id:'open-low',status:'open',priority:'low'},
    {id:'open-high',status:'open',priority:'high'},
  ].map(row => ({...row,created_at:'2026-10-06T10:00:00Z'})) as Report[];
  assert.deepEqual(rows.sort(compareReports).map(row => row.id), ['open-high','open-low','working','validation','closed']);
  assert.deepEqual(rows.filter(row => row.status !== 'resolved').map((row, index) => index+1), [1,2,3,4]);
});
