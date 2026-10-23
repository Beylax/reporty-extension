import { requireUser } from '@/lib/auth';
import { appOrigin } from '@/lib/supabase/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FeedbackToast } from '@/components/feedback-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyMcpEndpoint, RevokeMcpConnection } from './mcp-controls';

export async function McpSettings({ projectId }: { projectId: string }) {
  const { supabase, userId } = await requireUser();
  const [{ data, error }, grants] = await Promise.all([
    supabase.from('mcp_connections').select('id,client_id,client_name,project_id,created_at,revoked_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.auth.oauth.listGrants(),
  ]);
  const projectConnections = data?.filter(connection => connection.project_id === projectId) ?? [];
  const activeClients = new Set(data?.filter(connection => !connection.revoked_at).map(connection => connection.client_id));
  const endpoint = `${appOrigin()}/api/mcp`;
  return <Card><CardHeader><CardTitle>Collegamenti MCP</CardTitle><CardDescription>Collega Codex a questo progetto in sola lettura. Ogni sviluppatore gestisce i propri collegamenti.</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="grid gap-2"><Label htmlFor="mcp-endpoint">URL del server MCP</Label><Input id="mcp-endpoint" readOnly value={endpoint} className="font-mono text-xs" /><div><CopyMcpEndpoint endpoint={endpoint} /></div></div>
    <p className="text-sm text-muted-foreground">Aggiungi questo URL tra i server MCP di Codex e avvia l’accesso OAuth. Nella pagina Reporty seleziona il progetto e autorizza la lettura di segnalazioni, risposte, screenshot e file allegati.</p>
    {error ? <><FeedbackToast message="Impossibile caricare i collegamenti MCP." /><p className="text-sm text-muted-foreground">Collegamenti non disponibili. Verifica di aver applicato l’aggiornamento MCP e configurato OAuth in Supabase come indicato nel README.</p></> : projectConnections.length ? <ul className="space-y-3" aria-label="I tuoi collegamenti MCP">{projectConnections.map(connection => <li key={connection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{connection.client_name}</p><p className="text-xs text-muted-foreground">{connection.revoked_at ? 'Accesso revocato' : 'Sola lettura'} · {new Date(connection.created_at).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })}</p></div>{!connection.revoked_at || (!activeClients.has(connection.client_id) && (grants.error || grants.data?.some(grant => grant.client.id === connection.client_id))) ? <RevokeMcpConnection connectionId={connection.id} revoked={!!connection.revoked_at} /> : null}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nessun collegamento MCP autorizzato da te per questo progetto.</p>}
  </CardContent></Card>;
}
export function McpSettingsSkeleton() { return <div className="space-y-5 rounded-xl border p-6" role="status" aria-label="Caricamento collegamenti MCP"><div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-4/5" /></div><div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-40" /></div><Skeleton className="h-12 w-full" /><Skeleton className="h-16 w-full" /></div>; }
