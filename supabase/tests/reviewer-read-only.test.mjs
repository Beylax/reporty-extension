import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

for (const migrate of [false, true]) test(`unnamed review sessions: ${migrate ? 'incremental migration preserves existing data' : 'fresh initialization'}, read access, write gates and revocation`, async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to anon,authenticated;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);`);
    await db.exec(await readFile(new URL('../initialize.sql', import.meta.url), 'utf8'));
    const developer = randomUUID(), issue = randomUUID(), attachment = randomUUID();
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [developer,'dev@example.com']);
    const as = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(id ? { sub:id,is_anonymous:false } : {})]);
      await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
    };
    const report = async (secret,target,operation,payload={}) => (await db.query('select public.report_operation($1,$2,$3,$4) as result',[secret,target,operation,payload])).rows[0].result;
    const identity = async (secret,target,name=null) => (await db.query('select public.reviewer_identity($1,$2,$3) as result',[secret,target,name])).rows[0].result;
    await as(developer);
    const project = (await db.query('select public.create_project_with_production($1,$2) as id',['Review','https://review.example'])).rows[0].id;
    const env = (await db.query('select id from public.environments where project_id=$1',[project])).rows[0].id;
    const env2 = randomUUID();
    await db.query('insert into public.environments(id,project_id,name,origin) values($1,$2,$3,$4)',[env2,project,'Staging','https://stage.example']);
    const otherProject = (await db.query('select public.create_project_with_production($1,$2) as id',['Other','https://other.example'])).rows[0].id;
    const otherEnv = (await db.query('select id from public.environments where project_id=$1',[otherProject])).rows[0].id;
    const link = (await db.query('select token from public.environment_review_links where environment_id=$1',[env])).rows[0].token;
    const widget = (await db.query('select public_key from public.environment_widgets where environment_id=$1',[env])).rows[0].public_key;
    await db.query('update public.environment_widgets set enabled=true where environment_id=$1',[env]);
    const context={ url:'https://review.example/',origin:'https://review.example',pagePath:'/',anchor:{kind:'pin',documentX:10,documentY:20},viewport:{width:1280,height:800,devicePixelRatio:1},scroll:{x:0,y:0} };
    await report(null,env,'create',{id:issue,body:'Existing report',context});
    await report(null,env,'screenshot',{id:issue});
    const reserved = (await db.query('select public.attachment_operation(null,$1,$2,$3) as result',[env,'reserve',{id:attachment,issueId:issue,name:'image.png',mime:'image/png',size:10}])).rows[0].result;
    await db.exec('reset role');
    await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['attachments',reserved.path,{size:10}]);
    await as(developer);
    await report(null,env,'reply',{id:issue,body:'Existing reply',attachments:[attachment]});
    await as(null);
    const historical = '1'.repeat(64);
    await db.query('select public.start_guest_session($1,$2,$3)',[link,'Existing reviewer',historical]);
    if (migrate) {
      await db.exec('reset role; alter table public.guest_sessions alter column display_name set not null;');
      const migration = await readFile(new URL('../reviewer_read_only.sql',import.meta.url),'utf8');
      await db.exec(migration);
      await db.exec(migration);
      assert.equal((await db.query('select display_name from public.guest_sessions')).rows[0].display_name,'Existing reviewer');
      assert.equal((await db.query('select body from public.issues where id=$1',[issue])).rows[0].body,'Existing report');
      assert.equal((await db.query('select count(*)::int as count from public.comments')).rows[0].count,1);
      assert.equal((await db.query('select count(*)::int as count from public.comment_attachments')).rows[0].count,1);
      await as(null);
    }
    if (migrate) {
      await db.exec('reset role');
      const previousWidget = await readFile(new URL('../widget.sql', import.meta.url), 'utf8');
      const previousReviewer = await readFile(new URL('../reviewer_read_only.sql', import.meta.url), 'utf8');
      for (const [source, name] of [[previousWidget,'widget_authorize'], [previousWidget,'report_actor'], [previousReviewer,'start_widget_session']]) {
        const start = source.indexOf('function public.' + name + '(');
        const definition = 'create or replace ' + source.slice(start, source.indexOf('\n$$;', start) + 4);
        await db.exec(definition);
      }
      const update = await readFile(new URL('../widget_localhost.sql', import.meta.url), 'utf8');
      await db.exec(update);
      await db.exec(update);
      await as(null);
    }
    const guest = '2'.repeat(64), handoff = '3'.repeat(64), extension = '4'.repeat(64), widgetToken = '5'.repeat(64);
    await db.query('select public.start_guest_session($1,null,$2)',[link,guest]);
    await db.query("select public.create_guest_handoff($1,encode(sha256(convert_to($2,'UTF8')),'hex'))",[guest,handoff]);
    await db.query('select public.redeem_extension_handoff($1,$2)',[handoff,extension]);
    await assert.rejects(db.query('select public.redeem_extension_handoff($1,$2)',[handoff,'6'.repeat(64)]),/Invalid handoff/);
    const guestContext = (await db.query('select public.extension_context($1) as result',[extension])).rows[0].result;
    assert.equal(guestContext.displayName,null);
    assert.equal(guestContext.environments.length,2);
    await db.query('select public.start_widget_session($1,$2,null,$3)',[widget,'https://review.example',widgetToken]);
    await assert.rejects(db.query('select public.widget_authorize($1,$2)',[widgetToken,'http://review.example']),/unavailable/);
    await assert.rejects(db.query('select public.widget_authorize($1,$2)',[widgetToken,'https://review.example:444']),/unavailable/);
    for (const secret of [extension,widgetToken]) {
      assert.deepEqual(await identity(secret,env),{displayName:null,needsName:true});
      const listing = await report(secret,env,'list');
      assert.equal(listing[0].body,'Existing report');
      const thread = await report(secret,env,'thread',{id:issue});
      assert.ok(thread.issue.screenshot_path);
      assert.equal(thread.comments[0].attachments[0].id,attachment);
      assert.equal((await db.query('select public.attachment_operation($1,$2,$3,$4) as result',[secret,env,'read',{id:attachment,issueId:issue}])).rows[0].result.path,reserved.path);
      for (const operation of ['create','reply','status','priority','edit','delete','screenshot']) {
        await assert.rejects(report(secret,env,operation,{id:issue,body:'Blocked',status:'resolved',priority:'high',context}),/REVIEWER_NAME_REQUIRED/);
      }
      for (const operation of ['reserve','check','remove','discard']) await assert.rejects(db.query('select public.attachment_operation($1,$2,$3,$4)',[secret,env,operation,{id:randomUUID(),issueId:issue}]),/REVIEWER_NAME_REQUIRED/);
      await assert.rejects(report(secret,otherEnv,'list'),/Not authorized|unavailable/);
      await assert.rejects(identity(secret,otherEnv,'Intruder'),/Not authorized|unavailable/);
      await assert.rejects(identity(secret,env,'   '),/Invalid name/);
    }
    const localTokens = [];
    for (const [index, origin] of ['http://localhost', 'http://localhost:3000', 'https://localhost:8443'].entries()) {
      const token = String(index + 7).repeat(64);
      localTokens.push(token);
      await db.query('select public.start_widget_session($1,$2,null,$3)', [widget,origin,token]);
      assert.equal((await db.query('select public.widget_authorize($1,$2) as id', [token,origin])).rows[0].id, env);
      for (const other of ['https://review.example', 'http://localhost:4000', 'https://foreign.example']) {
        await assert.rejects(db.query('select public.widget_authorize($1,$2)', [token,other]), /unavailable/);
      }
      await assert.rejects(db.query('select public.widget_authorize($1,$2)', [widgetToken,origin]), /unavailable/);
      assert.ok((await report(token,env,'list')).length);
      await assert.rejects(report(token,env2,'list'), /Not authorized|unavailable/);
      const localContext = {...context, origin, url:origin + '/local?debug=1#/route', pagePath:'/local#/route'};
      await assert.rejects(report(token,env,'create',{body:'Name required',context:localContext}), /REVIEWER_NAME_REQUIRED/);
      await identity(token,env,'Local reviewer');
      const created = await report(token,env,'create',{body:'Local report',context:localContext});
      assert.equal(created.context.url, localContext.url);
      assert.equal(created.environment_id, env);
      await assert.rejects(report(token,env,'create',{body:'Wrong origin',context}), /Invalid report/);
      await report(token,env,'reply',{id:created.id,body:'Local reply'});
      await report(token,env,'status',{id:created.id,status:'validation'});
    }
    for (const origin of ['https://foreign.example','http://localhost.evil.test:3000','http://localhost@evil.test','http://127.0.0.1:3000','null','http://localhost:3000/path']) {
      await assert.rejects(db.query('select public.start_widget_session($1,$2,null,$3)', [widget,origin,'a'.repeat(64)]), /Widget unavailable/);
    }
    await assert.rejects(report(widgetToken,env2,'list'),/Not authorized|unavailable/);
    assert.deepEqual(await report(extension,env2,'list'),[]);
    await assert.rejects(db.query('update public.guest_sessions set display_name=$1',['Bypass']),/permission denied/);
    await assert.rejects(db.query('select public.require_reviewer_name($1,$2)',[extension,env]),/permission denied/);
    await assert.rejects(identity(null,env,'Intruder'),/Not authorized/);
    assert.deepEqual(await identity(extension,env,'  Guest  '),{displayName:'Guest',needsName:false});
    assert.deepEqual(await identity(extension,env,'Replacement'),{displayName:'Guest',needsName:false});
    await report(extension,env,'status',{id:issue,status:'validation'});
    await report(extension,env,'priority',{id:issue,priority:'high'});
    await report(extension,env,'reply',{id:issue,body:'Guest reply'});
    const ownIssue = randomUUID();
    await report(extension,env,'create',{id:ownIssue,body:'Guest report',context});
    await assert.rejects(report(extension,env,'edit',{id:ownIssue,body:'Not permitted'}),/Not authorized/);
    await assert.rejects(report(extension,env,'delete',{id:ownIssue}),/Not authorized/);
    assert.equal((await report(extension,env,'list')).find(item=>item.id===ownIssue).authorName,'Guest');
    await identity(widgetToken,env,'Widget reviewer');
    await report(widgetToken,env,'reply',{id:issue,body:'Widget reply'});
    await as(developer);
    await db.query('update public.environment_widgets set enabled=false where environment_id=$1',[env]);
    await as(null);
    for (const token of localTokens) await assert.rejects(report(token,env,'list'), /unavailable/);
    await assert.rejects(db.query('select public.start_widget_session($1,$2,null,$3)',[widget,'http://localhost:3000','b'.repeat(64)]), /Widget unavailable/);
    await assert.rejects(identity(widgetToken,env),/unavailable/);
    await assert.rejects(report(widgetToken,env,'list'),/unavailable/);
    await as(developer);
    await db.query('select public.regenerate_environment_review_link($1)',[env]);
    await db.query('update public.environment_widgets set enabled=true where environment_id=$1',[env]);
    await as(null);
    for (const token of localTokens) await assert.rejects(report(token,env,'list'), /unavailable/);
    await assert.rejects(identity(extension,env,'Revoked'),/revoked/);
    await assert.rejects(report(extension,env,'list'),/revoked/);
    await assert.rejects(db.query('select public.start_guest_session($1,null,$2)',[link,'7'.repeat(64)]),/Invalid invitation/);
  } finally { await db.close(); }
});
