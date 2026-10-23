import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const token = 'a'.repeat(64), environmentId = '11111111-1111-4111-8111-111111111111';
const origin = 'https://review.example:8443';
const validToken = value => /^[0-9a-f]{64}$/.test(value);
const source = async path => stripTypeScriptTypes(await readFile(new URL(path,import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const extensionSource = await source('../apps/web/app/api/extension/context/route.ts');
const widgetSource = await source('../apps/web/app/api/widget/route.ts');
const request = (input = {}, credential = token) => new Request('https://api.example/api/widget',{
  method:'POST',headers:{origin,authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify(input),
});

test('extension context renews the existing token and returns its saved identity without caching',async()=>{
  const calls = [], identity = {kind:'guest',displayName:'Existing reviewer',environments:[{id:environmentId}]};
  const GET = new Function('createClient','validToken',extensionSource+'\nreturn GET;')(
    async()=>({rpc:async(name,args)=>{calls.push({name,args}); return {data:identity,error:null};}}),validToken,
  );
  const response = await GET(request());
  assert.equal(response.status,200); assert.deepEqual(await response.json(),identity);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(calls,[{name:'renew_extension_session',args:{secret:token}}]);
  assert.equal((await GET(request({},'invalid'))).status,401);
  assert.equal(calls.length,1);
});

test('extension preserves the credential on service failure but rejects revoked sessions',async()=>{
  for (const [code,status] of [['42501',401],['57014',503],['PGRST202',503]]) {
    const GET = new Function('createClient','validToken',extensionSource+'\nreturn GET;')(
      async()=>({rpc:async()=>({error:{code}})}),validToken,
    );
    assert.equal((await GET(request())).status,status);
  }
});

function widget(error = null) {
  const calls = [], forwarded = [];
  const handler = async request => {forwarded.push({body:await request.json(),secret:request.headers.get('authorization')});return Response.json({success:true});};
  const POST = new Function('createClient','validToken','reports','attachment','screenshot','identity',widgetSource+'\nreturn POST;')(
    async()=>({rpc:async(name,args)=>{calls.push({name,args}); return {data:error?null:environmentId,error};}}),
    validToken,handler,handler,handler,handler,
  );
  return {POST,calls,forwarded};
}

test('widget renews and authorizes the stored token for its exact origin before each operation',async()=>{
  for (const action of ['identity','reports','attachment','screenshot']) {
    const h=widget();
    const response=await h.POST(request({action,environmentId:'untrusted',payload:{environmentId:'untrusted'}}));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    assert.deepEqual(h.calls,[{name:'renew_widget_session',args:{secret:token,request_origin:origin}}]);
    assert.equal(h.forwarded[0].body.environmentId,environmentId);
    assert.equal(h.forwarded[0].secret,`Bearer ${token}`);
  }
});

test('widget service errors cannot cause a replacement unnamed session',async()=>{
  for (const code of ['57014','PGRST202']) {
    const h=widget({code});const response=await h.POST(request({action:'identity'}));
    assert.equal(response.status,503);assert.equal((await response.json()).code,undefined);
    assert.deepEqual(h.forwarded,[]);
  }
  const h=widget({code:'42501'});const response=await h.POST(request({action:'identity'}));
  assert.equal(response.status,403);assert.equal((await response.json()).code,'WIDGET_SESSION_INVALID');
  assert.deepEqual(h.forwarded,[]);
  const invalid=widget();assert.equal((await invalid.POST(request({action:'identity'},'invalid'))).status,401);
  assert.deepEqual(invalid.calls,[]);
});
