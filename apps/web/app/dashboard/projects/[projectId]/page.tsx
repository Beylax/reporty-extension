import { AccordionSection } from '@/components/ui/accordion';
import { Plus, Save } from 'lucide-react';
import { EnvironmentWidget } from '../../environment-widget';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid, type ProjectParticipant } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { renameProject, saveEnvironment } from '../../actions';
import { Feedback } from '../../feedback';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SubmitButton } from '@/components/submit-button';
import { ReviewLinkForm } from '../../review-link-form';
import { appOrigin } from '@/lib/supabase/config';
import { FeedbackToast } from '@/components/feedback-toast';
import { ProjectReports } from '../../project-reports';
import { buttonVariants } from '@/components/ui/button';
import { ResourceDelete } from '../../resource-delete';
import { ProjectTabs } from '../../project-tabs';
import { EnvironmentPlaygroundTrigger } from '../../playground-trigger';

export default async function Project({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ message?: string; report?: string; tab?: string; environment?: string }>;
}) {
  const { supabase } = await requireUser();
  const { projectId } = await params;
  if (!isUuid(projectId)) notFound();
  const [projectResult, environmentsResult, permissionResult, linksResult, widgetsResult, participantsResult, { message, report, tab, environment: expandedEnvironment }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle(),
    supabase.from('environments').select('id, name, origin').eq('project_id', projectId).order('created_at'),
    supabase.rpc('can_manage_project', { target: projectId }),
    supabase.from('environment_review_links').select('environment_id,token,environments!inner(project_id)').eq('environments.project_id', projectId),
    supabase.from('environment_widgets').select('environment_id,public_key,enabled'),
    supabase.rpc('list_project_participants', { target: projectId }),
    searchParams,
  ]);
  if (projectResult.error || environmentsResult.error || permissionResult.error) {
    throw new Error('Impossibile caricare il progetto. Riprova tra poco.');
  }
  const project = projectResult.data;
  if (!project) notFound();
  const canManage = permissionResult.data === true;
  const environments = environmentsResult.data ?? [];
  const participants = (participantsResult.data ?? []) as ProjectParticipant[];
  const settingsParticipants = [
    ...participants.filter(person => person.kind === 'developer'),
    ...participants.filter(person => person.kind === 'guest'),
  ];
  return (
    <main className="w-full space-y-8 px-6 py-10 lg:px-10">
      <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>← Tutti i progetti</Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
        <Badge variant="secondary">Sviluppatore</Badge>
      </header>
      <Feedback message={message} />
      <ProjectTabs projectName={project.name} playgroundEnvironments={environments.map(environment => { const widget = widgetsResult.data?.find(item => item.environment_id === environment.id); return { ...environment, publicKey: widget?.public_key ?? "", enabled: widget?.enabled === true }; })} key={`${report ?? "project"}:${tab ?? "reports"}:${expandedEnvironment ?? ""}`} initialTab={tab === "environments" || tab === "settings" ? tab : "reports"} reports={<ProjectReports initialReportId={report} environments={environments} participants={participants} />} environments={<>
      <section className="space-y-4" aria-labelledby="environments-title">
        <div><h2 id="environments-title" className="text-xl font-semibold">Ambienti</h2></div>
        {!environments.length ? <Card><CardContent className="py-6 text-muted-foreground">Nessun ambiente aggiunto.</CardContent></Card> : null}
        {environments.map(environment => <AccordionSection key={environment.id} defaultOpen={environment.id === expandedEnvironment} variant="card" title={<span className="min-w-0 space-y-1"><span className="block break-words text-base font-semibold">{environment.name}</span><span className="block break-all text-sm font-normal text-muted-foreground">{environment.origin}</span></span>} action={<div className="flex flex-col items-end gap-2 lg:flex-row"><EnvironmentPlaygroundTrigger environmentId={environment.id} environmentName={environment.name} /><a href={environment.origin} target="_blank" rel="noopener noreferrer" aria-label={`Apri sito ${environment.name}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Apri sito ↗</a></div>}>
            {canManage ? <form action={saveEnvironment} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="environmentId" value={environment.id} />
              <div className="grid flex-1 gap-2"><Label htmlFor={`name-${environment.id}`}>Nome ambiente</Label><Input id={`name-${environment.id}`} name="name" defaultValue={environment.name} maxLength={80} required /></div>
              <div className="grid min-w-0 basis-60 flex-1 gap-2"><Label htmlFor={`origin-${environment.id}`}>Origine del sito</Label><Input id={`origin-${environment.id}`} name="origin" type="url" defaultValue={environment.origin} required /></div>
              <SubmitButton><Save className="size-4" aria-hidden="true" />Salva ambiente</SubmitButton>
            </form> : null}
            <AccordionSection title="Script di revisione e link di invito" defaultOpen={environment.id === expandedEnvironment}>
            {widgetsResult.data?.find(widget => widget.environment_id === environment.id) ? <EnvironmentWidget environmentId={environment.id} enabled={widgetsResult.data.find(widget => widget.environment_id === environment.id)!.enabled} publicKey={widgetsResult.data.find(widget => widget.environment_id === environment.id)!.public_key} origin={appOrigin()} environmentOrigin={environment.origin} /> : <FeedbackToast message="Applica supabase/widget.sql per attivare gli script per ambiente." />}
            {linksResult.data?.find(link => link.environment_id === environment.id) ? <ReviewLinkForm projectId={projectId} environmentId={environment.id} link={`${appOrigin()}/guest/${linksResult.data.find(link => link.environment_id === environment.id)!.token}`} /> : <FeedbackToast message="Link ospite non disponibile. Inizializza il database con supabase/initialize.sql secondo il README Supabase." />}
            </AccordionSection>
            {canManage ? <ResourceDelete id={environment.id} kind="environment" name={environment.name} /> : null}
        </AccordionSection>)}
      </section>
      {canManage ? <Card className="bg-primary/5 ring-primary/15">
        <CardHeader><CardTitle>Aggiungi un ambiente</CardTitle><CardDescription>Inserisci protocollo e dominio, senza percorsi. Per localhost includi la porta.</CardDescription></CardHeader>
        <CardContent><form action={saveEnvironment} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-2"><Label htmlFor="new-name">Nome ambiente</Label><Input id="new-name" name="name" placeholder="Produzione" maxLength={80} required /></div>
          <div className="grid gap-2"><Label htmlFor="new-origin">Origine del sito</Label><Input id="new-origin" name="origin" type="url" placeholder="https://example.com" required /></div>
          <div className="sm:col-span-2"><SubmitButton><Plus className="size-4" aria-hidden="true" />Aggiungi ambiente</SubmitButton></div>
        </form></CardContent>
      </Card> : null}
      </>} settings={canManage ? <><Card>
        <CardHeader><CardTitle>Nome del progetto</CardTitle><CardDescription>Il nome condiviso con tutti gli sviluppatori.</CardDescription></CardHeader>
        <CardContent><form action={renameProject} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid min-w-60 flex-1 gap-2"><Label htmlFor="project-name">Nome</Label><Input id="project-name" name="name" defaultValue={project.name} maxLength={120} required /></div>
          <SubmitButton><Save className="size-4" aria-hidden="true" />Salva nome</SubmitButton>
        </form></CardContent>
      </Card><AccordionSection variant="card" title="Utenti">
        <p className="text-sm text-muted-foreground">Sviluppatori e ospiti che hanno partecipato al progetto. Gli ospiti sono identificati dalla propria sessione.</p>
        <div className="space-y-3">
          {participantsResult.error ? <FeedbackToast message="Impossibile caricare gli utenti. Verifica di aver applicato supabase/report_updates.sql." /> : settingsParticipants.length ? settingsParticipants.map(person => <div key={person.key} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/50 p-3"><span className="min-w-0 break-words text-sm">{person.name}</span><Badge variant="secondary">{person.kind === 'developer' ? 'Sviluppatore' : 'Guest'}</Badge></div>) : <p className="text-sm text-muted-foreground">Nessun partecipante.</p>}
        </div>
      </AccordionSection><section aria-label="Zona pericolosa" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="text-sm font-semibold text-destructive">Zona pericolosa</h3><ResourceDelete fullWidth id={projectId} kind="project" name={project.name} /></section></> : null} />
    </main>
  );
}
