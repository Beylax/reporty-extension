// Run against a started Reporty server. No login or database writes are performed.
import assert from 'node:assert/strict';
const root=process.env.REPORTY_MCP_TEST_URL ?? 'http://127.0.0.1:3109';
for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/api/mcp']) {
  const response=await fetch(root+path); assert.equal(response.status,200);
  const metadata=await response.json(); assert.ok(metadata.resource.endsWith('/api/mcp')); assert.ok(metadata.authorization_servers[0].endsWith('/auth/v1'));
  console.log(path+': metadata OAuth validi');
}
for(const headers of [{},{authorization:'Bearer invalid-token'}]) {
  const response=await fetch(root+'/api/mcp',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'});
  assert.equal(response.status,401); assert.match(response.headers.get('www-authenticate'),/resource_metadata=/);
  console.log('MCP senza credenziali valide: 401 + discovery');
}
const denied=await fetch(root+'/api/mcp',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'});
assert.equal(denied.status,403); console.log('MCP con Origin esterna: 403');
const invalid=await fetch(root+'/oauth/consent');
assert.equal(invalid.status,200); assert.match(await invalid.text(),/Collegamento non disponibile/);
console.log('Consenso senza richiesta: stato non disponibile');
for (const authorizationId of ['11111111-1111-4111-8111-111111111111', 'q3z7wfnmqejfn5rsxsclcvhemxep2vca']) {
  const consent='/oauth/consent?authorization_id='+authorizationId;
  const resume=await fetch(root+consent,{redirect:'manual'});
  // A streamed Next.js response delivers redirects through a refresh meta tag.
  if (resume.status === 307) {
    assert.equal(new URL(resume.headers.get('location'), root).searchParams.get('next'), consent);
  } else {
    assert.equal(resume.status,200);
    const body=await resume.text();
    assert.match(body, /url=\/login\?next=|NEXT_REDIRECT;replace;\/login\?next=/);
    assert.ok(body.includes(encodeURIComponent(consent)));
  }
  console.log('Consenso senza login: ritorno preservato per ID '+(authorizationId.includes('-')?'UUID':'opaco'));
}
