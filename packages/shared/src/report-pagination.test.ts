import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportPageSchema, reportRequestSchema } from './reports.ts';

const environmentId = '11111111-1111-4111-8111-111111111111';
test('paginated transport preserves global filters, sort, and the requested range', () => {
  const payload = { offset: 40, limit: 20, pagePath: '/products#/details', search: 'review', statuses: ['open', 'validation'], priorities: ['high'], sort: { field: 'updated_at', direction: 'desc' } };
  assert.deepEqual(reportRequestSchema.parse({ environmentId, operation: 'page', payload }).payload,payload);
  assert.equal(reportRequestSchema.parse({ environmentId, operation: 'pins', payload: { pagePath: '/' } }).operation,'pins');
});
test('pagination rejects unbounded batches and invalid filters or ordering', () => {
  for (const payload of [{offset:-1},{offset:1.5},{limit:0},{limit:101},{statuses:['unknown']},{priorities:['urgent']},{sort:{field:'unknown',direction:'asc'}},{sort:{field:'status',direction:'unknown'}},{environments:['other']},{search:'x'.repeat(10001)}]) {
    assert.equal(reportPageSchema.safeParse(payload).success,false,JSON.stringify(payload).slice(0,100));
  }
});
