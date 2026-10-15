import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = stripTypeScriptTypes(await readFile(new URL('../apps/web/app/dashboard/report-actions.ts',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const load = new Function('requireUser','isUuid','revalidatePath',source+'\nreturn mutateReport;');
const id='11111111-1111-4111-8111-111111111111';
function action(error=null) {
  const refreshes=[],calls=[];
  const mutate=load(async()=>({supabase:{rpc:async(...args)=>{calls.push(args);return {data:{},error};}}}),value=>value===id,path=>refreshes.push(path));
  return {mutate,refreshes,calls};
}

test('Kanban status and priority writes skip route refresh after backend authorization',async()=>{
  for(const operation of ['status','priority']) {
    const h=action();const result=await h.mutate(id,operation,{id,[operation]:operation==='status'?'resolved':'high'},false);
    assert.equal(result.success,true);assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'report_operation');assert.equal(h.calls[0][1].operation,operation);
    assert.deepEqual(h.refreshes,[]);
  }
});
test('ordinary mutations retain route refresh and failed writes never refresh',async()=>{
  const h=action();await h.mutate(id,'status',{id,status:'resolved'});assert.deepEqual(h.refreshes,['/dashboard']);
  const edit=action();await edit.mutate(id,'edit',{id,body:'Changed'},false);assert.deepEqual(edit.refreshes,['/dashboard']);
  const denied=action({code:'42501'});const result=await denied.mutate(id,'status',{id,status:'resolved'},false);
  assert.ok(result.error);assert.deepEqual(denied.refreshes,[]);
});
