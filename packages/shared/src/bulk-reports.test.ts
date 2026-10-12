import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulkReportRequestSchema } from './reports.ts';

const target = { id: '11111111-1111-4111-8111-111111111111', environmentId: '22222222-2222-4222-8222-222222222222' };
test('bulk requests validate each identity and bound server batches', () => {
  assert.ok(bulkReportRequestSchema.safeParse({operation:'delete',targets:[target]}).success);
  assert.ok(!bulkReportRequestSchema.safeParse({operation:'delete',targets:[]}).success);
  assert.ok(!bulkReportRequestSchema.safeParse({operation:'delete',targets:Array(51).fill(target)}).success);
  assert.ok(!bulkReportRequestSchema.safeParse({operation:'delete',targets:[{...target,environmentId:'invalid'}]}).success);
  assert.ok(!bulkReportRequestSchema.safeParse({operation:'delete',targets:[{...target,id:'invalid'}]}).success);
});
test('bulk requests only allow the three agreed operations and their valid values', () => {
  for (const value of ['open','in_progress','validation','resolved']) assert.ok(bulkReportRequestSchema.safeParse({operation:'status',value,targets:[target]}).success);
  for (const value of ['low','medium','high']) assert.ok(bulkReportRequestSchema.safeParse({operation:'priority',value,targets:[target]}).success);
  for (const operation of ['edit','reply','create','notifications','invalid']) assert.ok(!bulkReportRequestSchema.safeParse({operation,targets:[target]}).success);
  assert.ok(!bulkReportRequestSchema.safeParse({operation:'status',value:'invalid',targets:[target]}).success);
  assert.ok(!bulkReportRequestSchema.safeParse({operation:'priority',value:'resolved',targets:[target]}).success);
  assert.ok(!bulkReportRequestSchema.safeParse({operation:'status',targets:[target]}).success);
});
