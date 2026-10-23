import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isOAuthAuthorizationId } from '../apps/web/lib/mcp/return-path.ts';

const source = stripTypeScriptTypes(await readFile(new URL('../apps/web/app/oauth/consent/actions.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export async function', 'async function');
const user = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const client = '33333333-3333-4333-8333-333333333333';
const opaqueId = 'q3z7wfnmqejfn5rsxsclcvhemxep2vca';
function setup({ expired = false, account = user } = {}) {
  const calls = [];
  const supabase = {
    auth: { oauth: {
      getAuthorizationDetails: async id => { calls.push(['details', id]); return expired ? { error: {} } : { data: { authorization_id: id, user: { id: account }, client: { id: client, name: 'Codex' } } }; },
      approveAuthorization: async id => { calls.push(['approve', id]); return { data: { redirect_url: 'http://127.0.0.1/callback?code=example' } }; },
      denyAuthorization: async id => { calls.push(['deny', id]); return { data: { redirect_url: 'http://127.0.0.1/callback?error=access_denied' } }; },
    } },
    rpc: async (name, input) => { calls.push([name, input]); return { data: 'connection' }; },
  };
  const action = new Function('isOAuthAuthorizationId', 'isUuid', 'requireUser', 'appOrigin', source + '\nreturn decideMcpConsent;')(
    isOAuthAuthorizationId, value => /^[0-9a-f-]{36}$/.test(value), async () => ({ supabase, userId: user }), () => 'https://reporty.example',
  );
  return { calls, action };
}
test('consent accepts the real opaque ID format while keeping project/client bindings server-side', async () => {
  const { calls, action } = setup();
  const result = await action(opaqueId, project, true);
  assert.ok(result.redirect);
  assert.deepEqual(calls, [['details', opaqueId], ['authorize_mcp_connection', { client, client_label: 'Codex', target: project, resource_url: 'https://reporty.example/api/mcp' }], ['approve', opaqueId]]);
});
test('denying an opaque authorization never creates a project connection', async () => {
  const { calls, action } = setup();
  assert.ok((await action(opaqueId, '', false)).redirect);
  assert.deepEqual(calls, [['details', opaqueId], ['deny', opaqueId]]);
});
test('invalid identifiers, expired requests and mismatched users cannot grant access', async () => {
  for (const [authorization, target] of [['../other', project], [opaqueId, 'not-a-project']]) {
    const { calls, action } = setup();
    assert.ok((await action(authorization, target, true)).error); assert.deepEqual(calls, []);
  }
  for (const options of [{ expired: true }, { account: client }]) {
    const { calls, action } = setup(options);
    assert.ok((await action(opaqueId, project, true)).error);
    assert.deepEqual(calls, [['details', opaqueId]]);
  }
});
