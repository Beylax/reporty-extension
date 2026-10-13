import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachmentMime, attachmentRequestSchema, isPreviewImage } from './attachments.ts';
import { reportRequestSchema } from './reports.ts';
const id='11111111-1111-4111-8111-111111111111';
test('untrusted file types only preview raster images; HTML, SVG and PDF download',()=>{
  for (const content of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>','<!doctype html><script>alert(1)</script>','%PDF-1.7']) {
    assert.equal(attachmentMime(new TextEncoder().encode(content)),'application/octet-stream');
  }
  assert.equal(attachmentMime(new Uint8Array([255,216,255,224])),'image/jpeg');
  assert.equal(attachmentMime(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
  assert.equal(attachmentMime(new TextEncoder().encode('GIF89a')),'image/gif');
  assert.equal(attachmentMime(new TextEncoder().encode('RIFFxxxxWEBP')),'image/webp');
  assert.equal(isPreviewImage('image/svg+xml'),false);
});
test('request limits reject oversized content and more than five reply attachments',()=>{
  assert.equal(attachmentRequestSchema.safeParse({environmentId:id,issueId:id,id,operation:'upload',content:'A'.repeat(3333337)}).success,false);
  assert.equal(attachmentRequestSchema.safeParse({environmentId:id,issueId:'invalid',id,operation:'read'}).success,false);
  assert.equal(reportRequestSchema.safeParse({environmentId:id,operation:'reply',payload:{id,body:'Reply',attachments:Array(6).fill(id)}}).success,false);
});
