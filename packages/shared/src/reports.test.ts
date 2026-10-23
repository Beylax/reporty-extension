import assert from 'node:assert/strict';
import test from 'node:test';
import { reportContextSchema, reportRequestSchema } from './reports.ts';

const context = { url: 'https://example.com/page', origin: 'https://example.com', pagePath: '/page', anchor: { kind: 'pin', documentX: 10, documentY: 20 }, viewport: { width: 1280, height: 720, devicePixelRatio: 1 }, scroll: { x: 0, y: 0 } };
test('report context accepts a free pin with viewport and scroll', () => {
  assert.equal(reportContextSchema.safeParse(context).success, true);
});
test('page reports need no fabricated viewport, scroll or pin coordinates', () => {
  const page = { url: context.url, origin: context.origin, pagePath: context.pagePath, anchor: { kind: 'page' } };
  assert.equal(reportContextSchema.safeParse(page).success, true);
  assert.equal(reportContextSchema.safeParse({ ...page, anchor: { kind: 'pin', documentX: 0, documentY: 0 } }).success, false);
  assert.equal(reportContextSchema.safeParse({ ...page, anchor: { kind: 'element', selector: 'html', offsetX: 0, offsetY: 0 } }).success, false);
  assert.equal(reportContextSchema.safeParse({ ...page, viewport: { width: 0, height: 0, devicePixelRatio: 1 } }).success, false);
});
test('report context rejects invalid coordinates and missing anchors', () => {
  assert.equal(reportContextSchema.safeParse({ ...context, anchor: { ...context.anchor, documentX: Infinity } }).success, false);
  assert.equal(reportContextSchema.safeParse({ ...context, anchor: null }).success, false);
  assert.equal(reportContextSchema.safeParse({ ...context, viewport: { ...context.viewport, width: 0 } }).success, false);
});
test('element offsets must lie within the selected element', () => {
  assert.equal(reportContextSchema.safeParse({ ...context, anchor: { kind: 'element', selector: '#title', offsetX: 0.5, offsetY: 0.5 } }).success, true);
  assert.equal(reportContextSchema.safeParse({ ...context, anchor: { kind: 'element', selector: '#title', offsetX: 2, offsetY: 0.5 } }).success, false);
});

test('report requests validate priority values and allow priority updates', () => {
  const request = { environmentId: '11111111-1111-4111-8111-111111111111', operation: 'priority', payload: { id: '22222222-2222-4222-8222-222222222222', priority: 'high' } };
  for (const priority of ['low', 'medium', 'high']) assert.equal(reportRequestSchema.safeParse({ ...request, payload: { ...request.payload, priority } }).success, true);
  assert.equal(reportRequestSchema.safeParse({ ...request, payload: { ...request.payload, priority: 'urgent' } }).success, false);
});
