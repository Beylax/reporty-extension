import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

for (const migration of [false, true]) test(`report pages: ${migration ? 'incremental update' : 'fresh schema'}, filters, ordering, limits and authorization`, async () => {
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
    const source = await readFile(new URL('../initialize.sql', import.meta.url), 'utf8');
    await db.exec(migration ? source.split('-- Incremental, non-destructive pagination API.')[0] : source);
    const developer = randomUUID();
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [developer,'dev@example.com']);
    const as = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(id ? { sub:id,is_anonymous:false } : {})]);
      await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
    };
    await as(developer);
    const project = (await db.query("select public.create_project_with_production('Pages','https://pages.example') as id")).rows[0].id;
    const env = (await db.query('select id from public.environments where project_id=$1',[project])).rows[0].id;
    const env2 = randomUUID();
    await db.query("insert into public.environments(id,project_id,name,origin) values($1,$2,'Staging','https://stage.example')",[env2,project]);
    const otherProject = (await db.query("select public.create_project_with_production('Other','https://other.example') as id")).rows[0].id;
    const otherEnv = (await db.query('select id from public.environments where project_id=$1',[otherProject])).rows[0].id;
    const context={ url:'https://pages.example/catalog',origin:'https://pages.example',pagePath:'/catalog',anchor:{kind:'pin',documentX:10,documentY:20},viewport:{width:1280,height:800,devicePixelRatio:1},scroll:{x:0,y:0} };
    await db.exec('reset role');
    const ids = Array.from({ length: 65 }, () => randomUUID());
    for (let index=0;index<65;index++) {
      await db.query(`insert into public.issues(id,project_id,environment_id,page_path,body,author_id,context,status,priority,created_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-01-01'::timestamptz + $10 * interval '1 second')`,
      [ids[index],project,index<60?env:env2,index%2?'/catalog':'/about',index===59?'needle special':`Report ${index}`,developer,context,index<50?'open':'resolved',index%3?'medium':'high',index]);
    }
    await db.query("insert into public.issues(project_id,environment_id,page_path,body,author_id,context) values($1,$2,'/','Other project',$3,$4)",[otherProject,otherEnv,developer,context]);
    await as(developer);
    if (migration) {
      await db.exec('reset role');
      const sql = await readFile(new URL('../report_pagination.sql', import.meta.url),'utf8');
      await db.exec(sql); await db.exec(sql);
      assert.equal((await db.query('select count(*)::int n from public.issues')).rows[0].n,66);
      await as(developer);
    }
    const page = async (payload={}, secret=null,target=env) => (await db.query('select public.report_page($1,$2,$3) result',[secret,target,payload])).rows[0].result;
    const pins = async (secret=null,target=env) => (await db.query('select public.report_pins($1,$2,$3) result',[secret,target,{pagePath:'/catalog'}])).rows[0].result;
    const query = {projectScope:true,sort:{field:'created_at',direction:'asc'}};
    const first = await page(query), second = await page({...query,offset:20}), third = await page({...query,offset:40}), fourth = await page({...query,offset:60});
    assert.equal(first.total,65); assert.equal(first.reports.length,20); assert.equal(second.reports.length,20); assert.equal(third.reports.length,20); assert.equal(fourth.reports.length,5);
    assert.deepEqual([...first.reports,...second.reports,...third.reports,...fourth.reports].map(row=>row.id),ids);
    assert.deepEqual((await page({...query,offset:1000})).reports,[]);
    const selection = await page({...query,selectionOnly:true});
    assert.equal(selection.reports.length,65);
    assert.equal(selection.reports[0].body,undefined);
    assert.equal(selection.reports[0].canEdit,true);
    assert.deepEqual(first.pages,['/about','/catalog']);
    assert.equal((await page({...query,statuses:['open']})).total,50);
    assert.equal((await page({...query,statuses:['resolved']})).total,15);
    assert.equal((await page({...query,environments:[env2]})).total,5);
    assert.deepEqual((await page({...query,environments:[otherEnv]})).reports,[]);
    assert.equal((await page({...query,users:[`user:${developer}`]})).total,65);
    assert.equal((await page({...query,users:['guest:'+randomUUID()]})).total,0);
    assert.equal((await page({...query,pages:['/catalog'],search:'NEEDLE',priorities:['medium']})).reports[0].id,ids[59]);
    assert.equal((await page({...query,id:ids[64],limit:1})).reports[0].id,ids[64]);
    assert.equal((await page({...query,sort:{field:'created_at',direction:'desc'}})).reports[0].id,ids[64]);
    for (const payload of [{limit:101},{limit:0},{offset:-1},{sort:{field:'bad'}}]) await assert.rejects(page(payload),/Invalid pagination/);
    const naturallySorted = await page({...query,sort:{field:'body',direction:'asc'},limit:100});
    assert.ok(naturallySorted.reports.findIndex(row=>row.body==='Report 2') < naturallySorted.reports.findIndex(row=>row.body==='Report 10'));
    const pinList = await pins();
    assert.equal(pinList.length,30); assert.equal(pinList[0].project_id,undefined); assert.equal(pinList[0].screenshot_path,undefined);
    assert.equal(pinList[0].context.viewport,undefined);
    const link = (await db.query('select token from public.environment_review_links where environment_id=$1',[env])).rows[0].token;
    const widget = (await db.query('select public_key from public.environment_widgets where environment_id=$1',[env])).rows[0].public_key;
    await db.query('update public.environment_widgets set enabled=true where environment_id=$1',[env]);
    await as(null);
    await assert.rejects(page(),/Not authorized/); await assert.rejects(pins(),/Not authorized/);
    const guest='a'.repeat(64), handoff='b'.repeat(64), extension='c'.repeat(64), widgetToken='d'.repeat(64);
    await db.query('select public.start_guest_session($1,null,$2)',[link,guest]);
    await db.query("select public.create_guest_handoff($1,encode(sha256(convert_to($2,'UTF8')),'hex'))",[guest,handoff]);
    await db.query('select public.redeem_extension_handoff($1,$2)',[handoff,extension]);
    const guestPage = await page({pagePath:'/catalog'},extension);
    assert.equal(guestPage.total,30); assert.equal(guestPage.reports.length,20);
    assert.equal(guestPage.reports[0].canEdit,false);
    assert.equal((await pins(extension)).length,30);
    await assert.rejects(page({projectScope:true},extension),/Not authorized/);
    await assert.rejects(page({},extension,otherEnv),/Not authorized|unavailable/);
    await assert.rejects(pins(extension,otherEnv),/Not authorized|unavailable/);
    await db.query('select public.start_widget_session($1,$2,null,$3)',[widget,'https://pages.example',widgetToken]);
    assert.equal((await page({},widgetToken)).total,60);
    await assert.rejects(page({projectScope:true},widgetToken),/Not authorized/);
    assert.deepEqual((await page({id:ids[64]},widgetToken)).reports,[]);
    await assert.rejects(page({},widgetToken,env2),/Not authorized|unavailable/);
    await as(developer);
    await db.query('update public.environment_widgets set enabled=false where environment_id=$1',[env]);
    await as(null);
    await assert.rejects(page({},widgetToken),/unavailable/); await assert.rejects(pins(widgetToken),/unavailable/);
    await as(developer);
    await db.query('select public.regenerate_environment_review_link($1)',[env]);
    await as(null);
    await assert.rejects(page({},extension),/unavailable|Not authorized|revoked/);
  } finally { await db.close(); }
});
