import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { getPageContext } from '../packages/shared/src/page.ts';
import { reportRequestSchema } from '../packages/shared/src/reports.ts';
import { reportScreenshotPaths } from '../packages/shared/src/screenshots.ts';

const source = stripTypeScriptTypes(await readFile(new URL('../apps/web/lib/report-request.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
const env='11111111-1111-4111-8111-111111111111', id='22222222-2222-4222-8222-222222222222', imageId='33333333-3333-4333-8333-333333333333';
const context={...getPageContext('https://example.com:8443/path?filter=1#/orders?tab=two'),anchor:{kind:'page'}};
const payload={environmentId:env,operation:'create',payload:{id,body:'Dashboard report',priority:'high',context}};
function setup({claims={sub:id,is_anonymous:false},denied=false}={}) {
  const calls=[],uploads=[];
  const supabase={auth:{getClaims:async()=>({data:{claims}})},rpc:async(name,input)=>{calls.push({name,input});return denied?{error:{code:'42501'}}:{data:{id,project_id:'project'}};}};
  const storage=()=>({upload:async(...input)=>{uploads.push(input);return {};}});
  const handle=new Function('createClient','storageClient','storageServiceClient','removeStoredFiles','getPageContext','reportRequestSchema','reportScreenshotPaths',source+'\nreturn handleReportRequest;')(async()=>supabase,storage,()=>{throw Error('Unexpected service bypass');},()=>{},getPageContext,reportRequestSchema,reportScreenshotPaths);
  return {calls,uploads,run:(input,secret=null)=>handle(new Request('https://dashboard.example/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),secret,['create','screenshot'])};
}
test('dashboard creation authenticates developers and keeps canonical URL, query and hash without pin metadata',async()=>{
  const state=setup(),response=await state.run(payload);
  assert.equal(response.status,200);assert.equal(state.calls.length,1);
  assert.equal(state.calls[0].name,'report_operation');
  assert.deepEqual(state.calls[0].input,{secret:null,target:env,operation:'create',payload:payload.payload});
  assert.equal(state.calls[0].input.payload.context.pagePath,'/path#/orders');
});
test('missing and anonymous dashboard sessions cannot reach RPC or Storage',async()=>{
  for(const claims of [null,{sub:id,is_anonymous:true}]){const state=setup({claims});assert.equal((await state.run(payload)).status,401);assert.deepEqual(state.calls,[]);assert.deepEqual(state.uploads,[]);}
});
test('dashboard API rejects other operations, mismatched paths, credentials and invalid bodies before RPC',async()=>{
  for(const input of [{...payload,operation:'delete'}, {...payload,payload:{...payload.payload,body:' '}}, ...[{...context,pagePath:'/other'},{...context,origin:'https://foreign.example'},{...context,url:'https://user:secret@example.com:8443/path?filter=1#/orders?tab=two'}].map(context=>({...payload,payload:{...payload.payload,context}}))]){
    const state=setup();assert.equal((await state.run(input)).status,400);assert.deepEqual(state.calls,[]);
  }
});
test('database authorization errors are surfaced without Storage access',async()=>{
  const state=setup({denied:true});assert.equal((await state.run(payload)).status,403);assert.deepEqual(state.uploads,[]);
});
test('dashboard screenshot uploads authorize preparation and commit using cookie identity',async()=>{
  const state=setup(),screenshot='data:image/jpeg;base64,'+Buffer.from([255,216,255,217]).toString('base64');
  const response=await state.run({environmentId:env,operation:'screenshot',payload:{id,screenshotId:imageId},screenshot});
  assert.equal(response.status,200);assert.deepEqual(state.calls.map(call=>[call.input.secret,call.input.operation]),[[null,'screenshot_prepare'],[null,'screenshot']]);
  assert.equal(state.uploads[0][0],`project/${id}/${imageId}.jpg`);assert.deepEqual(state.uploads[0][2],{contentType:'image/jpeg',upsert:false});
});
