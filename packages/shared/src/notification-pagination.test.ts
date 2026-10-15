import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notificationPageSchema, reportRequestSchema } from './reports.ts';

const id='11111111-1111-4111-8111-111111111111';
test('notification requests retain paging, scope filters and the polling cursor',()=>{
  const payload={paginated:true as const,mode:'summary' as const,pagePath:'/page#/route',after:{createdAt:'2026-10-15T12:00:00.000+00:00',id}};
  assert.deepEqual(reportRequestSchema.parse({environmentId:id,operation:'notifications',payload}).payload,payload);
  const page={mode:'page',offset:20,limit:20,reads:['unread'],statuses:['validation'],projects:[id],environments:[id]};
  assert.deepEqual(notificationPageSchema.parse(page),page);
});
test('notification paging rejects invalid bounds, filters and cursors',()=>{
  for(const input of [{limit:101},{limit:0},{offset:-1},{offset:0.5},{mode:'all'},{reads:['invalid']},{projects:['invalid']},{after:{createdAt:'yesterday',id}},{after:{createdAt:'2026-10-15T12:00:00Z',id:'invalid'}}]) assert.equal(notificationPageSchema.safeParse(input).success,false);
});
