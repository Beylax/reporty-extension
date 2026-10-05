import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const project = '44444444-4444-4444-8444-444444444444';
const hash = value => createHash('sha256').update(value).digest('hex');

test('invitation permissions, email binding and guest revocation on PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      insert into auth.users values
        ('${owner}', 'owner@example.com', now()),
        ('${member}', 'member@example.com', now()),
        ('${outsider}', 'outsider@example.com', now());
    `);
    for (const file of ['202610050001_initial.sql', '202610050002_project_management.sql', '202610050003_invitations.sql', '202610050004_extension_sessions.sql', '202610050005_reports.sql']) {
      await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    }
    const as = async (id, role = 'authenticated') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(id ? { sub: id, is_anonymous: false } : {})]);
      await db.exec(`set role ${role}`);
    };
    await as(owner);
    await db.query('insert into public.projects(id, name, created_by) values ($1, $2, $3)', [project, 'Website', owner]);
    await db.query('insert into public.environments(project_id, name, origin) values ($1, $2, $3)', [project, 'Production', 'https://example.com']);
    const memberSecret = 'a'.repeat(64);
    const invite = (await db.query('select public.create_member_invite($1, $2, $3) as id', [project, 'member@example.com', hash(memberSecret)])).rows[0].id;
    await assert.rejects(db.query('select token_hash from public.member_invites'));

    await as(outsider);
    assert.equal((await db.query('select id from public.projects')).rows.length, 0);
    await assert.rejects(db.query('select public.accept_member_invite($1)', [memberSecret]));
    await assert.rejects(db.query('select public.create_guest_invite($1, $2)', [project, hash('b'.repeat(64))]));
    assert.equal((await db.query('select id from public.member_invites')).rows.length, 0);

    await as(member);
    assert.equal((await db.query('select public.accept_member_invite($1) as id', [memberSecret])).rows[0].id, project);
    assert.equal((await db.query('select public.accept_member_invite($1) as id', [memberSecret])).rows[0].id, project);
    assert.equal((await db.query('select id from public.projects')).rows.length, 1);
    await assert.rejects(db.query('select public.create_guest_invite($1, $2)', [project, hash('b'.repeat(64))]));
    await assert.rejects(db.query('select * from public.list_project_members($1)', [project]));

    await as(owner);
    assert.equal((await db.query('select * from public.list_project_members($1)', [project])).rows.length, 2);
    const revokedSecret = 'd'.repeat(64);
    const revokedInvite = (await db.query('select public.create_member_invite($1, $2, $3) as id', [project, 'outsider@example.com', hash(revokedSecret)])).rows[0].id;
    await db.query('select public.revoke_project_invite($1, $2, $3)', [project, revokedInvite, 'member']);
    await as(outsider);
    await assert.rejects(db.query('select public.accept_member_invite($1)', [revokedSecret]));

    await as(owner);
    const guestSecret = 'b'.repeat(64);
    const guestInvite = (await db.query('select public.create_guest_invite($1, $2) as id', [project, hash(guestSecret)])).rows[0].id;
    await assert.rejects(db.query('select token_hash from public.guest_invites'));
    await as(null, 'anon');
    await assert.rejects(db.query('select * from public.projects'));
    await assert.rejects(db.query('select * from public.guest_sessions'));
    assert.equal((await db.query('select * from public.preview_guest_invite($1)', [guestSecret])).rows[0].project_id, project);
    assert.equal((await db.query('select * from public.preview_guest_invite($1)', ['x'.repeat(64)])).rows.length, 0);
    const sessionSecret = 'c'.repeat(64);
    await db.query('select public.start_guest_session($1, $2, $3)', [guestSecret, 'Designer', sessionSecret]);
    await db.query('select public.start_guest_session($1, $2, $3)', [guestSecret, 'Second designer', 'e'.repeat(64)]);
    assert.equal((await db.query('select * from public.get_guest_session($1)', [sessionSecret])).rows[0].display_name, 'Designer');
    assert.equal((await db.query('select * from public.get_guest_session($1)', ['z'.repeat(64)])).rows.length, 0);
    const handoff = '1'.repeat(64);
    const extensionSecret = '2'.repeat(64);
    await db.query('select public.create_guest_handoff($1, $2)', [sessionSecret, hash(handoff)]);
    await db.query('select public.redeem_extension_handoff($1, $2)', [handoff, extensionSecret]);
    await assert.rejects(db.query('select public.redeem_extension_handoff($1, $2)', [handoff, '3'.repeat(64)]));
    const guestContext = (await db.query('select public.extension_context($1) as context', [extensionSecret])).rows[0].context;
    assert.equal(guestContext.kind, 'guest');
    assert.equal(guestContext.environments.length, 1);
    assert.equal(guestContext.environments[0].origin, 'https://example.com');
    await assert.rejects(db.query('select * from public.extension_sessions'));
    const environmentId = guestContext.environments[0].id;
    const reportContext = { origin: 'https://example.com', url: 'https://example.com/products?sort=price', pagePath: '/products', anchor: { kind: 'pin', documentX: 100, documentY: 200 }, viewport: { width: 1280, height: 720, devicePixelRatio: 1 }, scroll: { x: 0, y: 0 } };
    const issueId = '99999999-9999-4999-8999-999999999999';
    const createdReport = (await db.query('select public.report_operation($1,$2,$3,$4) as report', [extensionSecret, environmentId, 'create', { id: issueId, body: 'Align the title', context: reportContext }])).rows[0].report;
    assert.equal(createdReport.guest_session_id !== null, true);
    assert.equal(createdReport.author_id, null);
    assert.equal((await db.query('select public.report_operation($1,$2,$3,$4) as report', [extensionSecret, environmentId, 'create', { id: issueId, body: 'Align the title', context: reportContext }])).rows[0].report.id, issueId);
    await assert.rejects(db.query('select public.report_operation($1,$2,$3,$4)', [extensionSecret, environmentId, 'status', { id: issueId, status: 'resolved' }]));
    await assert.rejects(db.query('select public.report_operation($1,$2,$3,$4)', [extensionSecret, environmentId, 'delete', { id: issueId }]));
    await assert.rejects(db.query('select public.report_operation($1,$2,$3,$4)', [extensionSecret, environmentId, 'edit', { id: issueId, body: 'Changed' }]));
    await db.query('select public.report_operation($1,$2,$3,$4)', [extensionSecret, environmentId, 'reply', { id: issueId, body: 'Client reply' }]);
    assert.equal((await db.query('select public.report_operation($1,$2,$3,$4) as report', [extensionSecret, environmentId, 'thread', { id: issueId }])).rows[0].report.comments.length, 1);
    const pageReports = (await db.query('select public.report_operation($1,$2,$3,$4) as reports', [extensionSecret, environmentId, 'list', { pagePath: '/products' }])).rows[0].reports;
    assert.equal(pageReports.length, 1);
    assert.equal(pageReports[0].canChangeStatus, false);
    assert.equal((await db.query('select public.report_operation($1,$2,$3,$4) as reports', [extensionSecret, environmentId, 'list', { pagePath: '/other' }])).rows[0].reports.length, 0);
    await as(outsider);
    await assert.rejects(db.query('select public.report_operation(null,$1,$2,$3)', [environmentId, 'list', {}]));
    const otherProject = '88888888-8888-4888-8888-888888888888';
    await db.query('insert into public.projects(id,name,created_by) values($1,$2,$3)', [otherProject, 'Other website', outsider]);
    const otherEnv = (await db.query('insert into public.environments(project_id,name,origin) values($1,$2,$3) returning id', [otherProject, 'Production', 'https://other.com'])).rows[0].id;
    await as(null, 'anon');
    await assert.rejects(db.query('select public.report_operation($1,$2,$3,$4)', [extensionSecret, otherEnv, 'list', {}]));
    await as(member);
    await db.query('select public.report_operation(null,$1,$2,$3)', [environmentId, 'status', { id: issueId, status: 'in_progress' }]);
    await assert.rejects(db.query('select public.report_operation(null,$1,$2,$3)', [environmentId, 'delete', { id: issueId }]));
    await as(owner);
    await db.query('select public.report_operation(null,$1,$2,$3)', [environmentId, 'edit', { id: issueId, body: 'Updated by admin' }]);
    assert.equal((await db.query('select public.report_operation(null,$1,$2,$3) as report', [environmentId, 'thread', { id: issueId }])).rows[0].report.issue.body, 'Updated by admin');
    await as(null, 'anon');

    await as(owner);
    await db.query('select public.revoke_project_invite($1, $2, $3)', [project, guestInvite, 'guest']);
    await as(null, 'anon');
    assert.equal((await db.query('select * from public.get_guest_session($1)', [sessionSecret])).rows.length, 0);
    await assert.rejects(db.query('select public.extension_context($1)', [extensionSecret]));
    await assert.rejects(db.query('select public.report_operation($1,$2,$3,$4)', [extensionSecret, environmentId, 'thread', { id: issueId }]));
    assert.equal((await db.query('select * from public.preview_guest_invite($1)', [guestSecret])).rows.length, 0);
    await assert.rejects(db.query('select public.start_guest_session($1, $2, $3)', [guestSecret, 'Designer', 'f'.repeat(64)]));
    await as(member);
    const memberHandoff = '4'.repeat(64), memberExtension = '5'.repeat(64);
    await db.query('select public.create_member_handoff($1)', [hash(memberHandoff)]);
    await as(null, 'anon');
    await db.query('select public.redeem_extension_handoff($1, $2)', [memberHandoff, memberExtension]);
    assert.equal((await db.query('select public.extension_context($1) as context', [memberExtension])).rows[0].context.environments.length, 1);
    await db.exec('reset role');
    await db.query('delete from public.project_members where project_id = $1 and user_id = $2', [project, member]);
    await as(null, 'anon');
    assert.equal((await db.query('select public.extension_context($1) as context', [memberExtension])).rows[0].context.environments.length, 0);
    await db.query('select public.revoke_extension_session($1)', [memberExtension]);
    await assert.rejects(db.query('select public.extension_context($1)', [memberExtension]));
    await as(owner);
    assert.equal((await db.query('select accepted_at from public.member_invites where id = $1', [invite])).rows.length, 1);
  } finally { await db.close(); }
});
