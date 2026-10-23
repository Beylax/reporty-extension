import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleMcpRequest } from '../apps/web/lib/mcp/server.ts';
import { validMcpClaims } from '../apps/web/lib/mcp/claims.ts';
import { isOAuthAuthorizationId, oauthReturnPath } from '../apps/web/lib/mcp/return-path.ts';

const origin='https://reporty.example';
const project=randomUUID(), report=randomUUID(), attachment=randomUUID();
test('Codex-compatible MCP handshake, read-only tools, pagination, image and private attachment results', async () => {
  const calls=[];
  const backend={
    async read(operation,payload={}) {
      calls.push({operation,payload});
      if(operation==='project') return {id:project,name:'Project A',environments:[]};
      if(operation==='reports') return {reports:[{id:report,project_id:project,body:'Example'}],total:1,offset:0,limit:20};
      if(payload.id!==report) throw new Error('Dati non disponibili o accesso revocato.');
      if(operation==='report') return {id:report,project_id:project,screenshotCount:1};
      if(operation==='replies') return {replies:[{body:'A reply'}],total:1};
      if(operation==='file') return {bucket:payload.kind==='screenshot'?'screenshots':'report-attachments',path:'private/file',name:'example.txt',mime:'application/octet-stream'};
      throw new Error('Unsupported');
    },
    async screenshot(file) { assert.equal(file.bucket,'screenshots'); return '/9j/'; },
    async attachment(file) { assert.equal(file.bucket,'report-attachments'); return origin+'/private-signed-download'; },
  };
  const client = new Client({name:'codex-test',version:'1.0.0'});
  const transport = new StreamableHTTPClientTransport(new URL(origin+'/api/mcp'), {
    fetch: async (input,init) => handleMcpRequest(new Request(input,init),backend,origin),
  });
  try {
    await client.connect(transport);
    const {tools}=await client.listTools();
    assert.deepEqual(tools.map(t=>t.name).sort(),['get_project','get_report','get_report_attachment','get_report_screenshot','list_report_replies','list_reports']);
    assert.ok(tools.every(t=>t.annotations.readOnlyHint===true && t.annotations.destructiveHint===false));
    const read=async(name,args={})=>client.callTool({name,arguments:args});
    assert.equal(JSON.parse((await read('get_project')).content[0].text).id,project);
    const list=JSON.parse((await read('list_reports',{search:'Example',statuses:['open'],offset:20,limit:10})).content[0].text);
    assert.equal(list.reports[0].url,`${origin}/dashboard/projects/${project}?report=${report}`);
    assert.deepEqual(calls.find(c=>c.operation==='reports').payload,{search:'Example',statuses:['open'],offset:20,limit:10});
    assert.equal(JSON.parse((await read('get_report',{id:report})).content[0].text).screenshotCount,1);
    assert.equal(JSON.parse((await read('list_report_replies',{id:report})).content[0].text).replies[0].body,'A reply');
    const image=await read('get_report_screenshot',{id:report});
    assert.equal(image.content[0].type,'image'); assert.equal(image.content[0].mimeType,'image/jpeg');
    const file=JSON.parse((await read('get_report_attachment',{id:report,attachmentId:attachment})).content[0].text);
    assert.equal(file.expiresIn,60); assert.equal(file.name,'example.txt');
    assert.equal((await read('get_report',{id:randomUUID()})).isError,true);
    const invalid=await read('list_reports',{limit:10000});
    assert.equal(invalid.isError,true);
    assert.equal(calls.filter(c=>c.operation==='reports').length,1,'invalid schema must never reach backend');
    assert.equal((await read('delete_report',{id:report})).isError,true);
  } finally { await client.close(); }
});

test('stateless transport rejects oversized request bodies', async () => {
  const response=await handleMcpRequest(new Request(origin+'/api/mcp', {method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_reports',arguments:{search:'x'.repeat(70000)}}})}),{read:async()=>{throw new Error('must not read');},screenshot:async()=>'',attachment:async()=>''},origin);
  assert.equal(response.status,413);
});

test('Google callback resumes only a valid local OAuth consent request', () => {
  const path='/oauth/consent?authorization_id='+randomUUID();
  assert.equal(oauthReturnPath(path),path);
  for(const value of [null,undefined,'https://evil.example','//evil.example','/dashboard','/oauth/consent?authorization_id=',path+'&next=https://evil.example',path+'#evil','\\evil.example']) assert.equal(oauthReturnPath(value),null);
});


test('opaque Supabase authorization IDs survive the Google login return path without accepting URL injection', () => {
  const authorizationId = 'q3z7wfnmqejfn5rsxsclcvhemxep2vca';
  const path = '/oauth/consent?authorization_id=' + authorizationId;
  assert.equal(isOAuthAuthorizationId(authorizationId), true);
  assert.equal(oauthReturnPath(path), path);
  assert.equal(new URL('https://reporty.example/login?next=' + encodeURIComponent(path)).searchParams.get('next'), path);
  for (const value of ['', '../other', 'a/b', 'value?next=other', 'value#fragment', 'value%2fpath', 'value\n', 'x'.repeat(257), null, []]) {
    assert.equal(isOAuthAuthorizationId(value), false);
    if (typeof value === 'string') assert.equal(oauthReturnPath('/oauth/consent?authorization_id=' + value), null);
  }
});

test('MCP credentials require their own audience, OAuth identity, binding, session and expiry', () => {
  const claims = { sub:randomUUID(),client_id:randomUUID(),session_id:randomUUID(),reporty_mcp_connection:randomUUID(),reporty_mcp_project:randomUUID(),role:'authenticated',iss:'https://auth.example/auth/v1',aud:origin+'/api/mcp',exp:200 };
  assert.equal(validMcpClaims(claims,claims.iss,claims.aud,100),true);
  for (const altered of [undefined,{}, {...claims,aud:'authenticated'}, {...claims,iss:'https://evil.example'}, {...claims,is_anonymous:true}, {...claims,exp:99}, {...claims,exp:'200'}, {...claims,role:'service_role'}, {...claims,client_id:undefined}, {...claims,session_id:'x'}, {...claims,reporty_mcp_connection:undefined}, {...claims,reporty_mcp_project:undefined}]) {
    assert.equal(validMcpClaims(altered,claims.iss,claims.aud,100),false);
  }
});
