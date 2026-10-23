import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(await readFile(new URL('../packages/shared/src/report-file-upload.ts', import.meta.url), 'utf8'))
  .replace(/import .*?;\n/, '').replace("await import('tus-js-client')", 'await loadTus()').replace('export async function', 'async function');
function setup({ failed = false, completed = false } = {}) {
  const requests = [], options = [], progress = [];
  let constructed = 0, aborts = 0;
  class Upload {
    constructor(file, config) { constructed++; options.push(config); this.config = config; }
    start() { queueMicrotask(() => { if (failed) this.config.onError(new Error('Sensitive upload URL must not be shown')); else { this.config.onProgress(2500000, 5000000); this.config.onSuccess(); } }); }
    async abort() { aborts++; }
  }
  const uploadReportFile = new Function('MAX_REPORT_ATTACHMENT_BYTES', 'loadTus', source + '\nreturn uploadReportFile;')(5000000, async () => ({ Upload }));
  const request = async input => { requests.push(input); return input.operation === 'begin_upload' ? completed ? { completed: true } : { upload: { endpoint: 'https://project.storage.supabase.co/storage/v1/upload/resumable', token: 'one-object-token', path: 'report-attachments/project/issue/id', bucket: 'report-attachments', contentType: 'application/octet-stream' } } : { completed: true }; };
  return { uploadReportFile, request, requests, options, progress, get constructed() { return constructed; }, get aborts() { return aborts; } };
}

test('5 MB upload sends only metadata through the app API and commits after scoped TUS upload', async () => {
  const state=setup(),file={name:'large.zip',size:5000000};
  await state.uploadReportFile(file,'id',state.request,value=>state.progress.push(value));
  assert.deepEqual(state.requests,[{operation:'begin_upload',scope:'report',id:'id',name:'large.zip',size:5000000},{operation:'complete_upload',scope:'report',id:'id'}]);
  assert.equal(state.options[0].chunkSize,6*1024*1024);
  assert.deepEqual(state.options[0].headers,{'x-signature':'one-object-token','x-upsert':'false'});
  assert.equal(state.options[0].metadata.contentType,'application/octet-stream');
  assert.equal(state.options[0].storeFingerprintForResuming,false);
  assert.deepEqual(state.progress,[50,100]);
});
test('empty or oversized files never request upload access', async () => {
  const state=setup();
  for(const size of [0,5000001])await assert.rejects(state.uploadReportFile({name:'bad.zip',size},'id',state.request,()=>{}),/5 MB/);
  assert.deepEqual(state.requests,[]);
});
test('retries detect an already committed file without sending its bytes again', async () => {
  const state=setup({completed:true});
  await state.uploadReportFile({name:'file.zip',size:5000000},'id',state.request,()=>{});
  assert.equal(state.requests.length,1);assert.equal(state.constructed,0);
});
test('failed uploads remain uncommitted and sanitize provider errors', async () => {
  const state=setup({failed:true});
  await assert.rejects(state.uploadReportFile({name:'file.zip',size:5000000},'id',state.request,()=>{}),error=>error.message.includes('Completa invio')&&!error.message.includes('Sensitive'));
  assert.equal(state.requests.length,1);
});
test('cancelling before an upload starts never creates a signed permission', async () => {
  const state=setup(),controller=new AbortController();controller.abort();
  await assert.rejects(state.uploadReportFile({name:'file.zip',size:50},'id',state.request,()=>{},controller.signal));
  assert.deepEqual(state.requests,[]);
});
