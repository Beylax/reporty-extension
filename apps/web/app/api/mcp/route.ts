import { appOrigin } from '@/lib/supabase/config';
import { storageClient } from '@/lib/supabase/storage';
import { authenticateMcp, authenticationRequired } from '@/lib/mcp/auth';
import { handleMcpRequest, type McpBackend } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

async function handle(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== appOrigin()) return new Response(null, { status: 403 });
  try {
    const supabase = await authenticateMcp(request);
    if (!supabase) return authenticationRequired();
    const backend: McpBackend = {
      async read(operation, payload = {}) {
        const { data, error } = await supabase.rpc('mcp_read', { operation, payload });
        if (error) throw new Error('Dati non disponibili o accesso revocato.');
        return data;
      },
      async screenshot(file) {
        const { data, error } = await storageClient(file.bucket).download(file.path);
        if (error || !data || data.size > 2500000) throw new Error('Screenshot non disponibile.');
        return Buffer.from(await data.arrayBuffer()).toString('base64');
      },
      async attachment(file) {
        const { data, error } = await storageClient(file.bucket).createSignedUrl(file.path, 60, { download: file.name });
        if (error || !data) throw new Error('Allegato non disponibile.');
        return data.signedUrl;
      },
    };
    const response = await handleMcpRequest(request, backend, appOrigin());
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return Response.json({ error: 'Servizio MCP non disponibile.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
export { handle as POST, handle as GET, handle as DELETE };
