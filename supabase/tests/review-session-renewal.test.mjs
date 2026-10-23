import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

for (const migrate of [false, true]) test(`review session renewal: ${migrate ? 'migration preserves expired identities' : 'fresh schema'}, authorization and revocation`, async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);`);
    await db.exec(await readFile(new URL('../initialize.sql', import.meta.url), 'utf8'));
    if (migrate) await db.exec('drop function public.renew_extension_session(text),public.renew_widget_session(text,text)');
    const developer = randomUUID();
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[developer,'dev@example.com']);
    async function as(id = null) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id ? {sub:id,is_anonymous:false} : {})]);
      await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
    }
    async function rpc(name, args) {
      return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
    }
    const renew = token => rpc('renew_extension_session',[token]);
    const renewWidget = (token, origin='https://review.example') => rpc('renew_widget_session',[token,origin]);
    const report = (token,target,operation,payload={}) => rpc('report_operation',[token,target,operation,payload]);
    await as(developer);
    const project = await rpc('create_project_with_production',['Review','https://review.example']);
    const env = (await db.query('select id from public.environments where project_id=$1',[project])).rows[0].id;
    const env2 = randomUUID();
    await db.query('insert into public.environments(id,project_id,name,origin) values($1,$2,$3,$4)',[env2,project,'Staging','https://stage.example']);
    const otherProject = await rpc('create_project_with_production',['Other','https://other.example']);
    const otherEnv = (await db.query('select id from public.environments where project_id=$1',[otherProject])).rows[0].id;
    const links = (await db.query('select * from public.environment_review_links')).rows;
    const widget = (await db.query('select public_key from public.environment_widgets where environment_id=$1',[env])).rows[0].public_key;
    await db.query('update public.environment_widgets set enabled=true where environment_id=$1',[env]);
    const issue = randomUUID();
    const context = {url:'https://review.example/',origin:'https://review.example',pagePath:'/',anchor:{kind:'pin',documentX:10,documentY:20},viewport:{width:1280,height:800,devicePixelRatio:1},scroll:{x:0,y:0}};
    await report(null,env,'create',{id:issue,body:'Preserved report',context});
    const member = 'a'.repeat(64), memberHandoff = 'b'.repeat(64);
    await db.query("select public.create_member_handoff(encode(sha256(convert_to($1,'UTF8')),'hex'))",[memberHandoff]);
    await rpc('redeem_extension_handoff',[memberHandoff,member]);
    await as();
    const extension = 'c'.repeat(64), secondExtension = 'd'.repeat(64), unnamed = 'e'.repeat(64);
    async function guestExtension(envId, name, guestToken, handoff, token) {
      await rpc('start_guest_session',[links.find(link=>link.environment_id===envId).token,name,guestToken]);
      await db.query("select public.create_guest_handoff($1,encode(sha256(convert_to($2,'UTF8')),'hex'))",[guestToken,handoff]);
      await rpc('redeem_extension_handoff',[handoff,token]);
    }
    await guestExtension(env,'Existing reviewer','1'.repeat(64),'2'.repeat(64),extension);
    await guestExtension(env2,'Other link reviewer','3'.repeat(64),'4'.repeat(64),secondExtension);
    await guestExtension(env,null,'5'.repeat(64),'6'.repeat(64),unnamed);
    const widgetToken = '7'.repeat(64), unnamedWidget = '8'.repeat(64), local = '9'.repeat(64);
    await rpc('start_widget_session',[widget,'https://review.example','Widget reviewer',widgetToken]);
    await rpc('start_widget_session',[widget,'https://review.example',null,unnamedWidget]);
    await rpc('start_widget_session',[widget,'http://localhost:3000','Local reviewer',local]);
    await report(extension,env,'reply',{id:issue,body:'Preserved reply'});
    await db.exec('reset role');
    await db.exec("update public.extension_sessions set expires_at=now()-interval '40 days'; update public.widget_sessions set expires_at=now()-interval '2 days';");
    const snapshot = async () => (await db.query(`select
      (select jsonb_agg(to_jsonb(g) order by id) from public.guest_sessions g) as guests,
      (select count(*)::int from public.extension_sessions) as extensions,
      (select count(*)::int from public.widget_sessions) as widgets,
      (select count(*)::int from public.notifications) as notifications,
      (select count(*)::int from public.comments) as replies`)).rows[0];
    const before = await snapshot();
    if (migrate) {
      const migration = await readFile(new URL('../review_session_renewal.sql',import.meta.url),'utf8');
      await db.exec(migration);
      await db.exec(migration);
      assert.deepEqual(await snapshot(),before);
    }
    await as();
    await assert.rejects(rpc('extension_context',[extension]),/Invalid session/);
    await assert.rejects(rpc('widget_authorize',[widgetToken,'https://review.example']),/unavailable/);
    for (const token of ['', 'bad', 'f'.repeat(64), widgetToken]) await assert.rejects(renew(token),/Invalid session/);
    for (const token of ['', 'bad', extension]) await assert.rejects(renewWidget(token),/unavailable/);
    for (const origin of ['https://foreign.example','http://review.example','https://review.example:444','null','']) {
      await assert.rejects(renewWidget(widgetToken,origin),/unavailable/);
    }
    assert.equal((await renew(extension)).displayName,'Existing reviewer');
    assert.equal((await renew(secondExtension)).displayName,'Other link reviewer');
    const memberContext = await renew(member);
    assert.equal(memberContext.kind,'member');
    assert.equal(memberContext.displayName,'dev@example.com');
    assert.equal(await renewWidget(widgetToken),env);
    assert.equal(await renewWidget(local,'http://localhost:3000'),env);
    await assert.rejects(renewWidget(local,'http://localhost:3001'),/unavailable/);
    assert.equal((await renew(unnamed)).displayName,null);
    assert.equal(await renewWidget(unnamedWidget),env);
    for (const token of [unnamed,unnamedWidget]) {
      assert.ok((await report(token,env,'list')).some(item=>item.id===issue));
      await assert.rejects(report(token,env,'status',{id:issue,status:'resolved'}),/REVIEWER_NAME_REQUIRED/);
    }
    await assert.rejects(report(extension,otherEnv,'list'),/Not authorized/);
    await assert.rejects(report(widgetToken,env2,'list'),/unavailable|Not authorized/);
    await report(extension,env,'status',{id:issue,status:'validation'});
    await report(widgetToken,env,'priority',{id:issue,priority:'high'});
    await assert.rejects(report(extension,env,'edit',{id:issue,body:'Forbidden'}),/Not authorized/);
    await db.exec('reset role');
    assert.deepEqual((await snapshot()).guests,before.guests);
    const expirations = async () => (await db.query(`select
      (select min(expires_at)>now()+interval '29 days' from public.extension_sessions) as extensions,
      (select min(expires_at)>now()+interval '23 hours' from public.widget_sessions) as widgets`)).rows[0];
    assert.deepEqual(await expirations(),{extensions:true,widgets:true});
    const deadlines = async () => (await db.query('select token_hash,expires_at from public.extension_sessions union all select token_hash,expires_at from public.widget_sessions order by token_hash')).rows;
    const renewedDeadlines = await deadlines();
    await as();
    await renew(extension); await renewWidget(widgetToken);
    await db.exec('reset role');
    assert.deepEqual(await deadlines(),renewedDeadlines,'polling does not rewrite fresh expirations');
    await as(developer);
    await db.query('update public.environment_widgets set enabled=false where environment_id=$1',[env]);
    await as();
    await assert.rejects(renewWidget(widgetToken),/unavailable/);
    assert.equal((await renew(extension)).displayName,'Existing reviewer','disabling a widget does not revoke the extension');
    await as(developer);
    await db.query('update public.environment_widgets set enabled=true where environment_id=$1',[env]);
    await rpc('regenerate_environment_review_link',[env]);
    await as();
    for (const token of [extension,unnamed]) await assert.rejects(renew(token),/revoked/);
    for (const [token,origin] of [[widgetToken,'https://review.example'],[unnamedWidget,'https://review.example'],[local,'http://localhost:3000']]) await assert.rejects(renewWidget(token,origin),/unavailable/);
    assert.equal((await renew(secondExtension)).displayName,'Other link reviewer','other links remain valid');
    await rpc('revoke_extension_session',[secondExtension]);
    await assert.rejects(renew(secondExtension),/Invalid session/);
    await db.exec('reset role');
    await db.query('update auth.users set is_anonymous=true where id=$1',[developer]);
    await as();
    await assert.rejects(renew(member),/Invalid session/);
    await assert.rejects(db.query('update public.extension_sessions set expires_at=now()'),/permission denied/);
    await assert.rejects(db.query('update public.widget_sessions set expires_at=now()'),/permission denied/);
    await db.exec('reset role');
    const functions = (await db.query(`select p.proname,p.prosecdef,p.provolatile,p.proconfig,
      has_function_privilege('anon',p.oid,'execute') as anon,
      has_function_privilege('authenticated',p.oid,'execute') as authenticated
      from pg_proc p where p.proname in ('renew_extension_session','renew_widget_session')`)).rows;
    assert.equal(functions.length,2);
    for (const fn of functions) {
      assert.equal(fn.prosecdef,true); assert.equal(fn.provolatile,'v');
      assert.deepEqual(fn.proconfig,['search_path=""']); assert.ok(fn.anon && fn.authenticated);
    }
    if (!migrate) {
      await db.exec(await readFile(new URL('../initialize.sql',import.meta.url),'utf8'));
      assert.equal((await db.query('select count(*)::int as count from public.guest_sessions')).rows[0].count,0);
    }
  } finally { await db.close(); }
});
