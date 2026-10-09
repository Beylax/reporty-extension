import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const user = '11111111-1111-4111-8111-111111111111';
const otherUser = '22222222-2222-4222-8222-222222222222';
const issue = '33333333-3333-4333-8333-333333333333';
const lease = '44444444-4444-4444-8444-444444444444';
const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('incremental GitHub migration, task locks, guest isolation and backend-only completion', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);`);
    const schema = await read('initialize.sql');
    // Start from the pre-feature schema and then apply the non-destructive migration.
    await db.exec(schema.slice(0, schema.indexOf('-- BEGIN GitHub / Claude')) + 'commit;');
    await db.query('insert into auth.users values($1,$2,now()),($3,$4,now())', [user, 'dev@test.example', otherUser, 'other@test.example']);
    async function as(id = user, role = 'authenticated', anonymous = false) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(id ? { sub: id, is_anonymous: anonymous } : {})]);
      await db.exec(`set role ${role}`);
    }
    await as();
    const project = (await db.query("select public.create_project_with_production('Example','https://example.com') as id")).rows[0].id;
    const env = (await db.query('select id from public.environments where project_id=$1', [project])).rows[0].id;
    const invitation = (await db.query('select token from public.environment_review_links where environment_id=$1', [env])).rows[0].token;
    const context = { url: 'https://example.com/path', origin: 'https://example.com', pagePath: '/path', anchor: { kind: 'pin', documentX: 5, documentY: 5 }, viewport: { width: 1000, height: 800, devicePixelRatio: 1 }, scroll: { x: 0, y: 0 } };
    await db.query('select public.report_operation(null,$1,$2,$3)', [env, 'create', { id: issue, body: 'Fix this', context }]);
    await db.exec('reset role'); await db.exec(await read('github_claude.sql'));
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 2);
    assert.equal((await db.query('select body from public.issues')).rows[0].body, 'Fix this');
    await as();
    await assert.rejects(db.query('select public.start_claude_task($1)', [issue]), /Repository required/);
    const repo = { repository_id: 12, installation_id: 34, full_name: 'test/repo', base_branch: 'main' };
    await assert.rejects(db.query('select public.create_github_project($1,$2,$3,$4)', [user, 'Denied', 'https://denied.example', repo]), /permission denied/);
    await assert.rejects(db.query('insert into public.environment_repositories values($1,34,12,$2,$3)', [env, 'test/repo', 'main']), /permission denied/);
    await assert.rejects(db.query('select public.save_github_environment($1,$2,$3,$4,$5,$6)', [user, project, env, 'Production', 'https://example.com', repo]), /permission denied/);
    await as(null, 'service_role');
    const created = (await db.query('select public.create_github_project($1,$2,$3,$4) as id', [user, 'Connected', 'https://connected.example', repo])).rows[0].id;
    const connectedEnv = (await db.query('select environment_id from public.environment_repositories')).rows[0].environment_id;
    assert.ok(connectedEnv);
    await as();
    await db.query('select public.platform_delete_resource($1,$2)', [created, 'project']);
    await as(null, 'service_role');
    await db.query('select public.save_github_environment($1,$2,$3,$4,$5,$6)', [user, project, env, 'Production', 'https://example.com', repo]);
    await as(otherUser);
    const task = (await db.query('select public.start_claude_task($1) as id', [issue])).rows[0].id;
    await assert.rejects(db.query('select public.start_claude_task($1)', [issue]), /Claude task active/);
    await assert.rejects(db.query('select snapshot from public.claude_tasks'), /permission denied/);
    assert.equal((await db.query('select status from public.claude_tasks')).rows[0].status, 'queued');
    for (const [operation, payload] of [['edit', { body: 'Changed' }], ['status', { status: 'resolved' }], ['priority', { priority: 'high' }], ['delete', {}], ['screenshot', {}]]) {
      await assert.rejects(db.query('select public.report_operation(null,$1,$2,$3)', [env, operation, { id: issue, ...payload }]), /Claude task active/);
    }
    await assert.rejects(db.query('select public.report_operation_without_claude(null,$1,$2,$3)', [env, 'delete', { id: issue }]), /permission denied/);
    await assert.rejects(db.query('select public.platform_delete_resource($1,$2)', [project, 'project']), /Claude task active/);
    await assert.rejects(db.query('select public.platform_delete_resource($1,$2)', [env, 'environment']), /Claude task active/);
    await assert.rejects(db.query('update public.environments set origin=$1 where id=$2', ['https://new.example', env]), /Claude task active/);
    await db.query('select public.report_operation(null,$1,$2,$3)', [env, 'reply', { id: issue, body: 'Developer comment during task' }]);
    const listed = (await db.query('select public.report_operation(null,$1,$2) as data', [env, 'list'])).rows[0].data[0];
    assert.equal(listed.claudeLocked, true); assert.equal(listed.canEdit, false); assert.equal(listed.canChangeStatus, false);
    await assert.rejects(db.query('select public.claim_claude_task($1,$2)', [task, lease]), /permission denied/);
    await as(user, 'authenticated', true);
    assert.equal((await db.query('select status from public.claude_tasks')).rows.length, 0);
    await assert.rejects(db.query('select public.start_claude_task($1)', [issue]), /Not authorized/);
    await as(null, 'anon');
    const guest = 'a'.repeat(64), handoff = 'b'.repeat(64), extension = 'c'.repeat(64);
    await db.query('select public.start_guest_session($1,$2,$3)', [invitation, 'Guest', guest]);
    await db.query("select public.create_guest_handoff($1,encode(sha256(convert_to($2,'UTF8')),'hex'))", [guest, handoff]);
    await db.query('select public.redeem_extension_handoff($1,$2)', [handoff, extension]);
    await db.query('select public.report_operation($1,$2,$3,$4)', [extension, env, 'reply', { id: issue, body: 'Guest comment during task' }]);
    await assert.rejects(db.query('select public.report_operation($1,$2,$3,$4)', [extension, env, 'priority', { id: issue, priority: 'low' }]), /Claude task active/);
    await assert.rejects(db.query('select status from public.claude_tasks'), /permission denied/);
    await assert.rejects(db.query('select public.start_claude_task($1)', [issue]), /permission denied/);
    await as(null, 'service_role');
    assert.ok((await db.query('select public.claim_claude_task($1,$2) as data', [task, lease])).rows[0].data);
    assert.equal((await db.query('select public.claim_claude_task($1,$2) as data', [task, user])).rows[0].data, null);
    await assert.rejects(db.query('select public.finish_claude_task($1,$2,true,$3,$4)', [task, user, 'Ready', 'https://github.com/test/repo/pull/1']), /lease expired/);
    await db.query('select public.finish_claude_task($1,$2,true,$3,$4)', [task, lease, 'Ready', 'https://github.com/test/repo/pull/1']);
    await as();
    assert.equal((await db.query('select status from public.issues where id=$1', [issue])).rows[0].status, 'validation');
    await db.query('select public.report_operation(null,$1,$2,$3)', [env, 'edit', { id: issue, body: 'Editable again' }]);
    const task2 = (await db.query('select public.start_claude_task($1) as id', [issue])).rows[0].id;
    await as(null, 'service_role');
    await db.query('select public.claim_claude_task($1,$2)', [task2, lease]);
    await db.query('select public.finish_claude_task($1,$2,false,$3)', [task2, lease, 'Failed']);
    await as();
    assert.equal((await db.query('select status from public.issues where id=$1', [issue])).rows[0].status, 'validation');
    await db.query('select public.platform_delete_resource($1,$2)', [project, 'project']);
    await db.exec('reset role');
    await db.exec(schema); // Authoritative reset remains runnable after the feature migration.
  } finally { await db.close(); }
});
