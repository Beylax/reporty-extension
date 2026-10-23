import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

const sql=await readFile(new URL('../update_reports.sql',import.meta.url),'utf8');
function definition(source,name){const start=source.indexOf('create or replace function public.'+name+'(');return source.slice(start,source.indexOf('\n$$;',start)+4);}

test('the single SQL script includes the final RPCs, one transaction and unchanged authorization',async()=>{
  assert.equal(sql.match(/^begin;$/gm)?.length,1);assert.equal(sql.match(/^commit;$/gm)?.length,1);
  for(const [name,file] of [['report_operation','page_reports.sql'],['report_attachment_operation','report_attachments.sql'],['platform_delete_resource','report_attachments.sql']]) {
    const canonical=await readFile(new URL('../'+file,import.meta.url),'utf8');
    assert.equal(definition(sql,name),definition(canonical,name));
    assert.match(definition(sql,name),/security definer set search_path\s*=\s*''/);
  }
});

for(const partial of [false,true])test(`single SQL preserves all historical rows and Storage objects, rolls back errors and can rerun (${partial?'partially applied with 50 MB files':'legacy single screenshot'})`,async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);`);
    await db.exec(await readFile(new URL('../initialize.sql',import.meta.url),'utf8'));
    const developer=randomUUID(),second=randomUUID(),project=randomUUID(),env=randomUUID(),historical=randomUUID(),replyId=randomUUID(),replyFile=randomUUID();
    const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(id?{sub:id,is_anonymous:false}:{})]);await db.exec(`set role ${role}`);};
    const report=async(operation,payload)=>(await db.query('select public.report_operation(null,$1,$2,$3) as data',[env,operation,payload])).rows[0].data;
    const attachment=async(operation,payload)=>(await db.query('select public.report_attachment_operation(null,$1,$2,$3) as data',[env,operation,payload])).rows[0].data;
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[developer,'one@example.com',second,'two@example.com']);
    await as(developer);
    await db.query('insert into public.projects(id,name,created_by) values($1,$2,$3)',[project,'Historical project',developer]);
    await db.query('insert into public.environments(id,project_id,name,origin) values($1,$2,$3,$4)',[env,project,'Historical environment','https://example.com:8443']);
    const context={url:'https://example.com:8443/page?tab=one',origin:'https://example.com:8443',pagePath:'/page',anchor:{kind:'pin',documentX:10,documentY:20},viewport:{width:1280,height:720,devicePixelRatio:1},scroll:{x:0,y:0}};
    await report('create',{id:historical,body:'Historical report',context});
    await report('screenshot',{id:historical});
    await report('priority',{id:historical,priority:'high'});
    const reply=(await db.query('select public.attachment_operation(null,$1,$2,$3) as data',[env,'reserve',{id:replyFile,issueId:historical,name:'old.txt',mime:'application/octet-stream',size:3}])).rows[0].data;
    await db.exec('reset role');
    await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3),($4,$5,$6)',['attachments',reply.path,{size:3},'screenshots',`${project}/${historical}.jpg`,{size:100,mimetype:'image/jpeg'}]);
    await as(developer);await report('reply',{id:historical,replyId,body:'Historical reply',attachments:[replyFile]});
    const link=(await db.query('select token from public.environment_review_links where environment_id=$1',[env])).rows[0].token;
    await as(null,'anon');await db.query('select public.start_guest_session($1,$2,$3)',[link,'Historical reviewer','a'.repeat(64)]);
    await db.exec('reset role');
    let largeId,pendingId;
    const expectedScreenshots=[`${project}/${historical}.jpg`];
    if(partial){
      await db.exec('alter table public.issue_attachments drop constraint issue_attachments_size_check; alter table public.issue_attachments add constraint issue_attachments_size_check check(size between 1 and 50000000)');
      largeId=randomUUID();pendingId=randomUUID();
      for(const [id,size,committed] of [[largeId,8000000,true],[pendingId,6000000,false]]){
        const path=`report-attachments/${project}/${historical}/${id}`;
        await db.query('insert into public.issue_attachments(id,issue_id,author_id,name,size,path,committed) values($1,$2,$3,$4,$5,$6,$7)',[id,historical,developer,'old-large.zip',size,path,committed]);
        await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['report-attachments',path,{size,mimetype:'application/octet-stream'}]);
      }
      await db.query("update storage.buckets set file_size_limit=50000000 where id='report-attachments'");
      const secondImage=randomUUID(),path=`${project}/${historical}/${secondImage}.jpg`;
      await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['screenshots',path,{size:100,mimetype:'image/jpeg'}]);
      await as(developer);await report('screenshot',{id:historical,screenshotId:secondImage});expectedScreenshots.push(path);
      await report('create',{body:'Existing page report',context:{url:context.url,origin:context.origin,pagePath:context.pagePath,anchor:{kind:'page'}}});
      await db.exec('reset role');
    } else {
      await db.exec('alter table public.issues drop column screenshot_paths; drop function public.report_attachment_operation(text,uuid,text,jsonb); drop table public.issue_attachments;');
      await db.query("delete from storage.buckets where id='report-attachments'");
      const previous=await readFile(new URL('../reply_attachments.sql',import.meta.url),'utf8');
      await db.exec(definition(previous,'report_operation'));await db.exec(definition(previous,'platform_delete_resource'));
    }
    async function snapshot(){
      const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','auth','storage') order by schemaname,tablename")).rows;
      const state={};
      for(const {schemaname,tablename} of tables){
        const expression=tablename==='issues'?"to_jsonb(t)-'screenshot_paths'":'to_jsonb(t)';
        const where=schemaname==='storage'&&tablename==='buckets'?" where id<>'report-attachments'":'';
        state[schemaname+'.'+tablename]=(await db.query(`select coalesce(jsonb_agg(${expression} order by (${expression})::text),'[]'::jsonb) as data from "${schemaname}"."${tablename}" t${where}`)).rows[0].data;
      }
      return state;
    }
    const before=await snapshot();
    const withFailure=sql.replace(/^commit;$/m,()=>"do $$ begin raise exception 'Injected migration error'; end; $$;\ncommit;");
    await assert.rejects(db.exec(withFailure),/Injected migration error/);await db.exec('rollback');
    assert.deepEqual(await snapshot(),before);
    if(!partial)assert.equal((await db.query("select to_regclass('public.issue_attachments') as name")).rows[0].name,null);
    await db.exec(sql);
    const after=await snapshot();for(const [table,rows] of Object.entries(before))assert.deepEqual(after[table],rows,`${table} must retain every historical row and field`);
    assert.deepEqual((await db.query('select screenshot_paths from public.issues where id=$1',[historical])).rows[0].screenshot_paths,expectedScreenshots);
    const bucket=(await db.query("select * from storage.buckets where id='report-attachments'")).rows[0];
    assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,5000000);
    await db.exec(sql);assert.deepEqual(await snapshot(),after);
    await as(developer);
    const thread=await report('thread',{id:historical});assert.equal(thread.comments[0].attachments[0].id,replyFile);assert.equal(thread.comments[0].body,'Historical reply');
    assert.deepEqual(thread.issue.screenshot_paths,expectedScreenshots);
    if(partial){assert.equal((await attachment('read',{id:largeId,issueId:historical})).size,8000000);assert.equal((await attachment('remove',{id:pendingId,issueId:historical})).removing,true);}
    await assert.rejects(attachment('reserve',{id:randomUUID(),issueId:historical,name:'over.zip',size:5000001}),/Invalid attachment/);
    const file=await attachment('reserve',{id:randomUUID(),issueId:historical,name:'new.zip',size:5000000});assert.equal(file.size,5000000);
    const page=await report('create',{body:'New dashboard report',context:{url:context.url,origin:context.origin,pagePath:context.pagePath,anchor:{kind:'page'}}});assert.equal(page.context.viewport,undefined);
    await as(null,'anon');await assert.rejects(db.query('select * from public.issue_attachments'),/permission denied/);
  } finally {await db.close();}
});

test('single SQL fails before mutations when the expected base schema is missing',async()=>{
  const db=new PGlite();
  try {await assert.rejects(db.exec(sql),/manca la tabella di base/);await db.exec('rollback');assert.equal((await db.query("select to_regclass('public.issue_attachments') as name")).rows[0].name,null);}
  finally {await db.close();}
});
