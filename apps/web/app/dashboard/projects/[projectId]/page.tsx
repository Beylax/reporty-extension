import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { renameProject, saveEnvironment } from '../../actions';
import { Feedback } from '../../feedback';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SubmitButton } from '@/components/submit-button';
import { ProjectInvitations } from '../../project-invitations';
import { ProjectReports } from '../../project-reports';

export default async function Project({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { supabase } = await requireUser();
  const { projectId } = await params;
  if (!isUuid(projectId)) notFound();
  const [projectResult, environmentsResult, permissionResult, { message }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle(),
    supabase.from('environments').select('id, name, origin').eq('project_id', projectId).order('created_at'),
    supabase.rpc('can_manage_project', { target: projectId }),
    searchParams,
  ]);
  if (projectResult.error || environmentsResult.error || permissionResult.error) {
    throw new Error('Impossibile caricare il progetto. Riprova tra poco.');
  }
  const project = projectResult.data;
  if (!project) notFound();
  const canManage = permissionResult.data === true;
  const environments = environmentsResult.data ?? [];
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <Link href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-4">← Tutti i progetti</Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
        <Badge variant="secondary">{canManage ? 'Amministratore' : 'Membro'}</Badge>
      </header>
      <Feedback message={message} />
      <ProjectReports environments={environments} />
      {canManage ? <Card>
        <CardHeader><CardTitle>Nome del progetto</CardTitle><CardDescription>Il nome condiviso con tutti i membri.</CardDescription></CardHeader>
        <CardContent><form action={renameProject} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid min-w-60 flex-1 gap-2"><Label htmlFor="project-name">Nome</Label><Input id="project-name" name="name" defaultValue={project.name} maxLength={120} required /></div>
          <SubmitButton>Salva nome</SubmitButton>
        </form></CardContent>
      </Card> : null}
      <section className="space-y-4" aria-labelledby="environments-title">
        <div><h2 id="environments-title" className="text-xl font-semibold">Ambienti</h2><p className="mt-1 text-sm text-muted-foreground">Produzione, staging e sviluppo mantengono segnalazioni separate.</p></div>
        {!environments.length ? <Card><CardContent className="py-6 text-muted-foreground">Nessun ambiente aggiunto.</CardContent></Card> : null}
        {environments.map(environment => <Card key={environment.id}>
          <CardHeader><CardTitle>{environment.name}</CardTitle><CardDescription className="break-all">{environment.origin}</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <a href={environment.origin} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-4">Apri sito ↗</a>
            {canManage ? <form action={saveEnvironment} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="environmentId" value={environment.id} />
              <div className="grid flex-1 gap-2"><Label htmlFor={`name-${environment.id}`}>Nome ambiente</Label><Input id={`name-${environment.id}`} name="name" defaultValue={environment.name} maxLength={80} required /></div>
              <div className="grid min-w-60 flex-1 gap-2"><Label htmlFor={`origin-${environment.id}`}>Origine del sito</Label><Input id={`origin-${environment.id}`} name="origin" type="url" defaultValue={environment.origin} required /></div>
              <SubmitButton>Salva ambiente</SubmitButton>
            </form> : null}
          </CardContent>
        </Card>)}
      </section>
      {canManage ? <Card>
        <CardHeader><CardTitle>Aggiungi un ambiente</CardTitle><CardDescription>Inserisci protocollo e dominio, senza percorsi. Per localhost includi la porta.</CardDescription></CardHeader>
        <CardContent><form action={saveEnvironment} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-2"><Label htmlFor="new-name">Nome ambiente</Label><Input id="new-name" name="name" placeholder="Produzione" maxLength={80} required /></div>
          <div className="grid gap-2"><Label htmlFor="new-origin">Origine del sito</Label><Input id="new-origin" name="origin" type="url" placeholder="https://example.com" required /></div>
          <div className="sm:col-span-2"><SubmitButton>Aggiungi ambiente</SubmitButton></div>
        </form></CardContent>
      </Card> : null}
      {canManage ? <ProjectInvitations projectId={projectId} /> : null}
    </main>
  );
}
