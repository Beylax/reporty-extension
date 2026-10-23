import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeBulkReports } from '../apps/web/lib/bulk-reports.ts';
import { applyBulkReportBatch } from '../apps/web/lib/bulk-report-update.ts';

const target = id => ({ id, environmentId: 'environment-'+id });
test('one apply updates both fields and reports only fully completed reports', async () => {
  const requests = [];
  const result = await applyBulkReportBatch(['one','two','denied'].map(target), { operation: 'update', status: 'validation', priority: 'high' }, async request => {
    requests.push(request);
    return { data: { succeeded: request.operation === 'status' ? ['one','two'] : ['one'], failed: request.operation === 'status' ? ['denied'] : ['two'], storageWarnings: [] } };
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].operation, 'status'); assert.equal(requests[0].value, 'validation');
  assert.equal(requests[1].operation, 'priority'); assert.equal(requests[1].value, 'high');
  assert.deepEqual(requests[1].targets.map(item => item.id), ['one','two']);
  assert.deepEqual(result, { succeeded: ['one'], failed: ['two','denied'], storageWarnings: [] });
});

test('apply supports a single field and rejects empty updates without writes', async () => {
  let writes = 0;
  const mutate = async request => {
    writes++;
    assert.equal(request.operation, 'priority'); assert.equal(request.value, 'low');
    return { data: { succeeded: ['one'], failed: [], storageWarnings: [] } };
  };
  await assert.rejects(applyBulkReportBatch([target('one')], { operation: 'update' }, mutate), /Scegli/);
  assert.equal(writes, 0);
  assert.deepEqual(await applyBulkReportBatch([target('one')], { operation: 'update', priority: 'low' }, mutate), { succeeded: ['one'], failed: [], storageWarnings: [] });
  assert.equal(writes, 1);
});

test('a denied first change does not proceed to the second field and backend errors propagate', async () => {
  let writes = 0;
  const result = await applyBulkReportBatch([target('denied')], { operation: 'update', status: 'resolved', priority: 'high' }, async () => {
    writes++;
    return { data: { succeeded: [], failed: ['denied'], storageWarnings: [] } };
  });
  assert.equal(writes, 1); assert.deepEqual(result.failed, ['denied']);
  await assert.rejects(applyBulkReportBatch([target('one')], { operation: 'update', status: 'resolved' }, async () => ({ error: 'Not authorized' })), /Not authorized/);
});

test('the unified apply path retains delete cleanup warnings', async () => {
  const result = await applyBulkReportBatch([target('one')], { operation: 'delete' }, async request => {
    assert.equal(request.operation, 'delete');
    return { data: { succeeded: ['one'], failed: [], storageWarnings: ['one'] } };
  });
  assert.deepEqual(result, { succeeded: ['one'], failed: [], storageWarnings: ['one'] });
});
test('bulk changes authorize each target and continue after denied or failed operations', async () => {
  const calls=[];
  const result=await executeBulkReports({operation:'status',value:'validation',targets:['one','denied','network','four','five','six'].map(target)},async (item,payload)=>{
    calls.push({item,payload});
    if(item.id==='denied')return {error:{code:'42501'}};
    if(item.id==='network')throw new Error('Connection failed');
    return {data:{screenshot_path:'unused.jpg'}};
  },async()=>{assert.fail('Status changes must not touch Storage');});
  assert.deepEqual(new Set(result.succeeded),new Set(['one','four','five','six']));
  assert.deepEqual(new Set(result.failed),new Set(['denied','network']));
  assert.equal(calls.length,6);
  assert.ok(calls.every(call=>call.payload.status==='validation' && call.payload.id===call.item.id));
  assert.ok(calls.every(call=>call.item.environmentId==='environment-'+call.item.id));
});
test('bulk deletion only removes screenshots for confirmed deletions and reports cleanup failures',async()=>{
  const removed=[];
  const result=await executeBulkReports({operation:'delete',targets:['one','denied','storage-failure','no-image'].map(target)},async item=>{
    if(item.id==='denied')return {error:{code:'42501'},data:{screenshot_path:'protected.jpg'}};
    return {data:{screenshot_path:item.id==='no-image'?null:item.id+'.jpg'}};
  },async path=>{removed.push(path);if(path==='storage-failure.jpg')throw new Error('Storage failed');});
  assert.deepEqual(new Set(result.succeeded),new Set(['one','storage-failure','no-image']));
  assert.deepEqual(result.failed,['denied']);
  assert.deepEqual(result.storageWarnings,['storage-failure']);
  assert.deepEqual(new Set(removed),new Set(['one.jpg','storage-failure.jpg']));
});
test('bulk requests bound concurrency, deduplicate IDs and process all chunks',async()=>{
  let active=0,peak=0,calls=0;
  const targets=Array.from({length:26},(_,i)=>target(String(i)));
  const result=await executeBulkReports({operation:'priority',value:'high',targets:[...targets,targets[0]]},async (_item,payload)=>{
    active++;peak=Math.max(peak,active);calls++;
    assert.equal(payload.priority,'high');
    await new Promise(resolve=>setImmediate(resolve));
    active--;return {};
  },async()=>{assert.fail('Priority changes must not touch Storage');});
  assert.equal(peak,5);assert.equal(calls,26);assert.equal(result.succeeded.length,26);
  assert.deepEqual(result.failed,[]);
});
test('bulk deletion cleans attachments and continues after a screenshot cleanup error',async()=>{
  const removed=[];
  const result=await executeBulkReports({operation:'delete',targets:[target('one'),target('denied')]},async item=>item.id==='denied'?{error:{code:'42501'}}:{data:{screenshot_path:'one.jpg',attachment_paths:['attachments/one/file1','attachments/one/file2']}},async path=>{
    removed.push(path);if(path==='one.jpg')throw new Error('Storage failed');
  });
  assert.deepEqual(removed,['one.jpg','attachments/one/file1','attachments/one/file2']);
  assert.deepEqual(result.storageWarnings,['one']);assert.deepEqual(result.failed,['denied']);
});

test('bulk deletion cleans every screenshot once, including legacy primary paths', async () => {
  const removed = [];
  const result = await executeBulkReports({ operation: 'delete', targets: [target('multiple')] }, async () => ({ data: { screenshot_path: 'first.jpg', screenshot_paths: ['first.jpg','second.jpg','third.jpg'] } }), async path => { removed.push(path); });
  assert.deepEqual(removed,['first.jpg','second.jpg','third.jpg']);
  assert.deepEqual(result.succeeded,['multiple']);
});
