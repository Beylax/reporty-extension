import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeBulkReports } from '../apps/web/lib/bulk-reports.ts';

const target = id => ({ id, environmentId: 'environment-'+id });
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
