import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const initialize = await readFile(new URL('../initialize.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../mcp_oauth.sql', import.meta.url), 'utf8');
for (const incremental of [false, true]) test(`MCP OAuth: ${incremental ? 'incremental migration' : 'fresh schema'}, project isolation, read-only, revocation and immutable refresh binding`, async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,supabase_auth_admin;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);`);
    await db.exec(incremental ? initialize.split('-- MCP OAuth: keep in sync')[0] : initialize);
    const user = randomUUID(), otherUser = randomUUID(), client = randomUUID();
    const resource = 'https://reporty.example/api/mcp';
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())', [user,'dev@example.com',otherUser,'other@example.com']);
    async function as(claims, role = 'authenticated') {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
      await db.exec(`set role ${role}`);
    }
    const developer = { sub:user,is_anonymous:false };
    const call = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => '$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
    const read = (operation, payload = {}) => call('mcp_read',[operation,payload]);
    await as(developer);
    const project = await call('create_project_with_production',['Project A','https://a.example']);
    const otherProject = await call('create_project_with_production',['Project B','https://b.example']);
    const env = (await db.query('select id from public.environments where project_id=$1',[project])).rows[0].id;
    const otherEnv = (await db.query('select id from public.environments where project_id=$1',[otherProject])).rows[0].id;
    const env2 = randomUUID();
    await db.query('insert into public.environments(id,project_id,name,origin) values($1,$2,$3,$4)',[env2,project,'Staging','https://stage.example']);
    const issue = randomUUID(), otherIssue = randomUUID(), second = randomUUID();
    for (const [id,environment,origin,body] of [[issue,env,'https://a.example','Target report'],[second,env2,'https://stage.example','Staging report'],[otherIssue,otherEnv,'https://b.example','Secret report B']]) {
      await call('report_operation',[null,environment,'create',{id,body,context:{url:origin+'/',origin,pagePath:'/',anchor:{kind:'page'}}}]);
    }
    await call('report_operation',[null,env,'reply',{id:issue,body:'Reply A'}]);
    await db.exec('reset role');
    const attachment=randomUUID(), replyAttachment=randomUUID(), foreignAttachment=randomUUID();
    await db.query("update public.issues set screenshot_path=$2,screenshot_paths=array[$2,$3] where id=$1",[issue,project+'/'+issue+'.jpg',project+'/'+issue+'-2.jpg']);
    for(const [id,report,name] of [[attachment,issue,'file.txt'],[foreignAttachment,otherIssue,'secret.txt']]) {
      await db.query("insert into public.issue_attachments(id,issue_id,author_id,name,size,path,committed) values($1,$2,$3,$4,10,$5,true)",[id,report,user,name,'report-attachments/'+report+'/'+id]);
    }
    await db.query("insert into public.comment_attachments(id,issue_id,comment_id,author_id,name,mime,size,path) select $1,$2,id,$3,'reply.png','image/png',10,'attachments/reply.png' from public.comments where issue_id=$2",[replyAttachment,issue,user]);
    if (incremental) { await db.exec(migration); await db.exec(migration); }
    assert.equal((await db.query('select count(*)::int n from public.issues')).rows[0].n,3);
    await as(developer);
    assert.equal((await db.query('select * from public.projects')).rows.length,2);
    const connection = await call('authorize_mcp_connection',[client,'Codex',project,resource]);
    assert.equal(await call('authorize_mcp_connection',[client,'Codex',project,resource]),connection);
    await assert.rejects(call('authorize_mcp_connection',[client,'Codex',otherProject,resource]),/Revoke/);
    await as({sub:otherUser,is_anonymous:false});
    assert.equal((await db.query('select * from public.mcp_connections')).rows.length,0);
    await assert.rejects(call('revoke_mcp_connection',[connection]),/unavailable/);
    async function token(session = randomUUID()) {
      await db.exec('reset role');
      await db.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict do nothing',[session,user]);
      await db.exec('set role supabase_auth_admin');
      return call('mcp_access_token_hook',[{user_id:user,client_id:client,claims:{...developer,client_id:client,session_id:session,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600}}]);
    }
    const oauth = (await token()).claims;
    assert.equal(oauth.aud,resource);
    assert.equal(oauth.reporty_mcp_connection,connection);
    await as(oauth);
    assert.equal((await read('project')).id,project);
    assert.equal((await read('project')).environments.length,2);
    assert.equal((await read('reports')).total,2);
    assert.equal((await read('reports',{environmentId:env2})).reports[0].id,second);
    assert.equal((await read('reports',{search:'Target',statuses:['open'],priorities:['medium']})).total,1);
    assert.equal((await read('reports',{offset:1,limit:1})).reports.length,1);
    assert.equal((await read('reports',{environmentId:otherEnv})).total,0);
    const detail=await read('report',{id:issue});
    assert.equal(detail.screenshotCount,2);
    assert.equal(detail.attachments[0].id,attachment);
    assert.equal(detail.screenshot_path,undefined);
    assert.equal(detail.replyCount,1);
    const replies=await read('replies',{id:issue});
    assert.equal(replies.replies[0].body,'Reply A');
    assert.equal(replies.replies[0].attachments[0].id,replyAttachment);
    assert.equal((await read('file',{id:issue,kind:'screenshot',index:1})).bucket,'screenshots');
    assert.equal((await read('file',{id:issue,kind:'attachment',attachmentId:attachment})).bucket,'report-attachments');
    assert.equal((await read('file',{id:issue,kind:'attachment',attachmentId:replyAttachment})).bucket,'attachments');
    for(const [operation,payload] of [['report',{id:otherIssue}],['replies',{id:otherIssue}],['file',{id:otherIssue,kind:'screenshot'}],['file',{id:issue,kind:'attachment',attachmentId:foreignAttachment}],['file',{id:issue,kind:'screenshot',index:5}]]) {
      await assert.rejects(read(operation,payload),/unavailable/);
    }
    await assert.rejects(read('reports',{limit:51}),/Invalid/);
    await assert.rejects(read('reports',{statuses:'open'}),/Invalid/);
    await assert.rejects(read('status',{id:issue,status:'resolved'}),/Unsupported/);
    // Using the OAuth JWT directly against Supabase must not bypass MCP.
    for(const table of ['projects','environments','issues','comments','environment_review_links','environment_widgets','mcp_connections']) {
      assert.equal((await db.query(`select * from public.${table}`)).rows.length,0,table);
    }
    assert.equal(await call('can_read_project',[project]),false);
    assert.equal(await call('can_manage_project',[project]),false);
    await db.query('update public.projects set name=$1 where id=$2',['Hacked',project]);
    await assert.rejects(db.query('insert into public.projects(name,created_by) values($1,$2)',['Hacked',user]),/row-level security/);
    for(const operation of ['create','reply','edit','delete','status','priority']) {
      await assert.rejects(call('report_operation',[null,env,operation,{id:issue,body:'Hacked',status:'resolved',priority:'high'}]),/Not authorized/);
    }
    await assert.rejects(call('create_member_handoff',['a'.repeat(64)]),/Login required/);
    await assert.rejects(call('platform_delete_resource',[project,'project']),/Not authorized/);
    await assert.rejects(call('regenerate_environment_review_link',[env]),/Not authorized/);
    await assert.rejects(call('notification_operation',[null,null,'notifications_read',{}]),/Not authorized/);
    await assert.rejects(call('authorize_mcp_connection',[randomUUID(),'Evil',otherProject,resource]),/Not authorized/);
    await assert.rejects(call('revoke_mcp_connection',[connection]),/Not authorized/);
    await assert.rejects(call('mcp_access_token_hook',[{}]),/permission denied/);
    // Claim mismatch / expiry / external OAuth revocation all fail closed.
    for(const altered of [{...oauth,aud:'wrong'}, {...oauth,client_id:randomUUID()}, {...oauth,sub:otherUser}, {...oauth,reporty_mcp_project:otherProject}, {...oauth,is_anonymous:true}, {...oauth,exp:1}, {...developer}]) {
      await as(altered); await assert.rejects(read('project'),/MCP access denied/);
    }
    const extra=(await token()).claims;
    await db.exec('reset role'); await db.query('delete from auth.sessions where id=$1',[extra.session_id]);
    await as(extra); await assert.rejects(read('project'),/MCP access denied/);
    await as(developer);
    await call('revoke_mcp_connection',[connection]);
    await as(oauth); await assert.rejects(read('project'),/MCP access denied/);
    assert.equal((await token(oauth.session_id)).error.http_code,403);
    await as(developer);
    const newConnection=await call('authorize_mcp_connection',[client,'Codex',otherProject,resource]);
    assert.notEqual(newConnection,connection);
    assert.equal((await token(oauth.session_id)).error.http_code,403,'old refresh session cannot change project');
    const newToken=(await token()).claims;
    await as(newToken); assert.equal((await read('project')).id,otherProject);
    await as(oauth); await assert.rejects(read('project'),/MCP access denied/);
    // Deleting a project must retain tombstones for previously issued sessions.
    await as(developer);
    await call('platform_delete_resource',[otherProject,'project']);
    await call('authorize_mcp_connection',[client,'Codex',project,resource]);
    assert.equal((await token(newToken.session_id)).error.http_code,403,'deleted project cannot free an old refresh binding');
    await as(developer);
    assert.equal((await db.query('select name from public.projects where id=$1',[project])).rows[0].name,'Project A');
    await as({},'anon');
    await assert.rejects(read('project'),/permission denied/);
  } finally { await db.close(); }
});
