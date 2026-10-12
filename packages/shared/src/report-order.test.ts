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

test('custom ordering prioritizes the chosen field rather than status', async () => {
  const { compareReportsBy } = await import('./report-order.ts');
  const reports = [
    { id:'a', status:'open', priority:'low', created_at:'2026-10-01T10:00:00Z', updated_at:null },
    { id:'b', status:'resolved', priority:'high', created_at:'2026-10-02T10:00:00Z', updated_at:'2026-10-03T10:00:00Z' },
    { id:'c', status:'validation', priority:'medium', created_at:'2026-10-03T10:00:00Z', updated_at:'2026-10-04T10:00:00Z' },
  ] as Report[];
  const order = (field: 'status'|'priority'|'created_at'|'updated_at', direction: 'asc'|'desc') => [...reports].sort((a,b) => compareReportsBy(a,b,{field,direction})).map(row=>row.id);
  assert.deepEqual(order('status','asc'), ['a','c','b']);
  assert.deepEqual(order('priority','asc'), ['b','c','a']);
  assert.deepEqual(order('priority','desc'), ['a','c','b']);
  assert.deepEqual(order('created_at','desc'), ['c','b','a']);
  assert.deepEqual(order('created_at','asc'), ['a','b','c']);
  assert.deepEqual(order('updated_at','desc'), ['c','b','a']);
  assert.deepEqual(order('updated_at','asc'), ['b','c','a']);
});
test('equal priorities retain oldest report first and stable ID tie breaks', async () => {
  const { compareReportsBy } = await import('./report-order.ts');
  const a = {id:'a',status:'open',priority:'high',created_at:'2026-10-01T10:00:00Z'} as Report;
  const b = {...a,id:'b',created_at:'2026-10-02T10:00:00Z'};
  for (const direction of ['asc','desc'] as const) assert.ok(compareReportsBy(a,b,{field:'priority',direction}) < 0);
  assert.ok(compareReportsBy(a,{...a,id:'c'},{field:'updated_at',direction:'desc'}) < 0);
});
