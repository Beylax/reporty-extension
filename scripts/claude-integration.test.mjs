import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';

// Exercise real Anthropic/Supabase clients with all HTTP intercepted below.
register('./automation-test-loader.mjs', import.meta.url);
const { reconcileTask } = await import('../apps/web/lib/automation/worker.ts');
const { resultSchema } = await import('../apps/web/lib/automation/result.ts');
const originalFetch = globalThis.fetch;
const variables = { NEXT_PUBLIC_SUPABASE_URL: 'https://db.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_AUTOMATION_KEY: 'test', ANTHROPIC_API_KEY: 'test', ANTHROPIC_AGENT_ID: 'agent_test', ANTHROPIC_ENVIRONMENT_ID: 'env_test', GITHUB_APP_ID: '12', GITHUB_APP_PRIVATE_KEY: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }), CLAUDE_TASK_BUDGET_CENTS: '500' };
const previous = Object.fromEntries(Object.keys(variables).map(key => [key, process.env[key]]));
Object.assign(process.env, variables);
const taskTemplate = {
  id: '11111111-1111-4111-8111-111111111111', issue_id: '22222222-2222-4222-8222-222222222222', environment_id: '33333333-3333-4333-8333-333333333333', project_id: '44444444-4444-4444-8444-444444444444',
  status: 'queued', session_id: null, repository: { repository_id: 123, installation_id: 456, full_name: 'team/project', base_branch: 'main' }, snapshot: { body: 'Fix navigation', comments: [{ body: 'Reproduced' }], context: {}, screenshot_path: null },
  branch: 'reporty/claude-11111111-1111-4111-8111-111111111111', base_sha: null, message: '', pr_url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), started_at: null,
};
function mock(task, handler) {
  const calls = [];
  globalThis.fetch = async (input, options) => {
    const request = new Request(input, options), url = new URL(request.url);
    const raw = ['POST', 'PATCH'].includes(request.method) ? await request.text() : '';
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ path: url.pathname, method: request.method, body });
    let data;
    if (url.hostname === 'db.test') {
      if (url.pathname.endsWith('/claim_claude_task')) data = { ...task, lease_id: body.lease };
      else if (url.pathname.endsWith('/finish_claude_task')) { Object.assign(task, { status: body.succeeded ? 'succeeded' : 'failed', message: body.detail, pr_url: body.pull_request }); data = null; }
      else { Object.assign(task, body); data = { id: task.id }; }
    } else data = await handler(url, request.method, body);
    return data instanceof Response ? data : Response.json(data);
  };
  return calls;
}
function session(task, status = 'idle') {
  return { id: 'sesn_test', status, updated_at: new Date(Date.now() - 180000).toISOString(), created_at: task.started_at, metadata: { reporty_task_id: task.id } };
}
const page = data => ({ data, has_more: false, next_page: null, first_id: data[0]?.id, last_id: data.at(-1)?.id });

test('Claude artifacts reject traversal, workflow changes, secrets, duplicate paths and binary contents', () => {
  const valid = { summary: 'Fixed', tests: 'npm test passed', files: [{ path: 'src/index.ts', content: 'export {};' }] };
  assert.equal(resultSchema.safeParse(valid).success, true);
  for (const path of ['../secret', '/etc/passwd', '.git/config', '.env', 'src/.env.local', '.github/workflows/build.yml', 'a\\b', 'a//b']) {
    assert.equal(resultSchema.safeParse({ ...valid, files: [{ path, content: 'test' }] }).success, false, path);
  }
  assert.equal(resultSchema.safeParse({ ...valid, files: [...valid.files, ...valid.files] }).success, false);
  assert.equal(resultSchema.safeParse({ ...valid, files: [{ path: 'image.jpg', content: '\u0000' }] }).success, false);
});
test('starts a scoped read-only session with a budget and persists its ID', async () => {
  const task = structuredClone(taskTemplate);
  const calls = mock(task, (url, method, body) => {
    if (url.pathname.endsWith('/access_tokens')) { assert.deepEqual(body, { repository_ids: [123], permissions: { contents: 'read' } }); return { token: 'github-read-token' }; }
    if (url.pathname.endsWith('/branches/main')) return { commit: { sha: 'base-sha' } };
    if (url.pathname === '/v1/sessions' && method === 'POST') {
      assert.equal(body.resources[0].checkout.sha, 'base-sha');
      assert.equal(body.budget.max_list_cost.amount, '500');
      assert.equal(body.metadata.reporty_task_id, task.id);
      assert.equal(body.initial_events[0].content[0].text.includes('Reproduced'), true);
      assert.deepEqual(body.agent.mcp_servers, []);
      return session(task, 'running');
    }
    throw new Error(`Unexpected HTTP ${method} ${url}`);
  });
  await reconcileTask(task.id);
  assert.equal(task.status, 'running'); assert.equal(task.session_id, 'sesn_test');
  assert.equal(calls.filter(call => call.path === '/v1/sessions').length, 1);
});
test('recovers a timed-out session creation without starting a second session', async () => {
  const task = { ...structuredClone(taskTemplate), status: 'starting', started_at: new Date().toISOString(), base_sha: 'base-sha' };
  const calls = mock(task, (url, method) => {
    if (url.pathname === '/v1/sessions' && method === 'GET') return page([session(task, 'running')]);
    if (url.pathname.endsWith('/events')) return page([]);
    if (url.pathname === '/v1/sessions/sesn_test') return session(task, 'running');
    throw new Error(`Unexpected HTTP ${method} ${url}`);
  });
  await reconcileTask(task.id);
  assert.equal(task.session_id, 'sesn_test');
  assert.equal(calls.some(call => call.path === '/v1/sessions' && call.method === 'POST'), false);
});
test('idle is not success: a budget pause fails and releases the issue', async () => {
  const task = { ...structuredClone(taskTemplate), status: 'running', started_at: new Date().toISOString(), session_id: 'sesn_test' };
  mock(task, url => {
    if (url.pathname.endsWith('/events')) return page([{ type: 'session.status_idle', stop_reason: { type: 'budget_reached' } }]);
    return session(task);
  });
  await reconcileTask(task.id);
  assert.equal(task.status, 'failed'); assert.match(task.message, /Budget/);
});
test('uncertain create response stays locked and does not retry the POST', async () => {
  const task = structuredClone(taskTemplate);
  const calls = mock(task, url => {
    if (url.pathname.endsWith('/access_tokens')) return { token: 'read-token' };
    if (url.pathname.endsWith('/branches/main')) return { commit: { sha: 'base-sha' } };
    if (url.pathname === '/v1/sessions') throw new TypeError('Network disconnected after POST');
    throw new Error(`Unexpected HTTP ${url}`);
  });
  await reconcileTask(task.id);
  assert.equal(task.status, 'starting'); assert.equal(task.session_id, null);
  assert.equal(calls.filter(call => call.path === '/v1/sessions').length, 1);
  assert.equal(calls.some(call => call.path.endsWith('/finish_claude_task')), false);
});
test('a temporarily missing output is retried; absence never counts as success', async () => {
  const task = { ...structuredClone(taskTemplate), status: 'running', started_at: new Date().toISOString(), session_id: 'sesn_test' };
  mock(task, url => {
    if (url.pathname.endsWith('/events')) return page([{ type: 'session.status_idle', stop_reason: { type: 'end_turn' } }]);
    if (url.pathname === '/v1/files') return page([]);
    return { ...session(task), updated_at: new Date().toISOString() };
  });
  await reconcileTask(task.id);
  assert.equal(task.status, 'running'); assert.match(task.message, /Attendo/);
});
test('webhook verifier rejects invalid signatures and stale deliveries', async () => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { createHmac } = await import('node:crypto');
  const api = new Anthropic({ apiKey: 'test' });
  const secret = Buffer.from('test-signing-key-at-least-32-bytes'), key = `whsec_${secret.toString('base64')}`;
  const body = JSON.stringify({ id: 'whe_test', type: 'event', created_at: new Date().toISOString(), data: { id: 'sesn_test', type: 'session.status_idled', organization_id: 'org_test', workspace_id: 'wrk_test' } });
  function headers(timestamp) {
    const signature = createHmac('sha256', secret).update(`whe_test.${timestamp}.${body}`).digest('base64');
    return { 'webhook-id': 'whe_test', 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}` };
  }
  assert.equal(api.beta.webhooks.unwrap(body, { key, headers: headers(Math.floor(Date.now() / 1000)) }).data.id, 'sesn_test');
  assert.throws(() => api.beta.webhooks.unwrap(body + ' ', { key, headers: headers(Math.floor(Date.now() / 1000)) }));
  assert.throws(() => api.beta.webhooks.unwrap(body, { key, headers: headers(Math.floor(Date.now() / 1000) - 600) }));
});
test('publishes one ready PR; retries reuse it instead of pushing again', async () => {
  let prCreated = false, branchCreated = false;
  let pushes = 0, prs = 0;
  const task = { ...structuredClone(taskTemplate), status: 'running', started_at: new Date().toISOString(), session_id: 'sesn_test', base_sha: 'base-sha' };
  const handler = (url, method, body) => {
    if (url.pathname.endsWith('/events')) return page([{ type: 'session.status_idle', stop_reason: { type: 'end_turn' } }]);
    if (url.pathname === '/v1/sessions/sesn_test') return session(task);
    if (url.pathname === '/v1/files') return page([{ id: 'file_test', filename: 'reporty-result.json', size_bytes: 100 }]);
    if (url.pathname.endsWith('/files/file_test/content')) return { summary: 'Fixed navigation', tests: 'Test passed', files: [{ path: 'src/index.ts', content: 'fixed' }] };
    if (url.pathname.endsWith('/access_tokens')) return { token: 'write-token' };
    if (url.pathname.endsWith('/pulls') && method === 'GET') return prCreated ? [{ html_url: 'https://github.com/team/project/pull/1', base: { ref: 'main' }, head: { ref: task.branch, repo: { id: 123 } }, draft: false }] : [];
    if (url.pathname.includes('/git/ref/heads/')) return branchCreated ? { object: { sha: 'commit' } } : Response.json({}, { status: 404 });
    if (url.pathname.endsWith('/git/commits/base-sha')) return { tree: { sha: 'base-tree' } };
    if (url.pathname.endsWith('/git/trees')) { assert.equal(body.base_tree, 'base-tree'); return { sha: 'new-tree' }; }
    if (url.pathname.endsWith('/git/commits')) return { sha: 'commit' };
    if (url.pathname.endsWith('/git/refs')) { pushes++; branchCreated = true; return {}; }
    if (url.pathname.endsWith('/pulls') && method === 'POST') { assert.equal(body.draft, false); prs++; prCreated = true; return { html_url: 'https://github.com/team/project/pull/1' }; }
    throw new Error(`Unexpected HTTP ${method} ${url}`);
  };
  mock(task, handler); await reconcileTask(task.id);
  assert.equal(task.status, 'succeeded'); assert.equal(task.pr_url, 'https://github.com/team/project/pull/1');
  task.status = 'publishing';
  mock(task, handler); await reconcileTask(task.id);
  assert.equal(task.status, 'succeeded'); assert.equal(pushes, 1); assert.equal(prs, 1);
});
test.after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
