import { requireUser } from '@/lib/auth';
import { Feedback } from './feedback';
import { Badge } from '@/components/ui/badge';
import { ProjectList } from './project-list';

export default async function Dashboard({ searchParams }: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { supabase } = await requireUser();
  const [projectsResult, adminResult, { message }] = await Promise.all([
    supabase.from('projects').select('id, name, environments(id, name, origin)').order('created_at', { ascending: false }),
    supabase.rpc('is_platform_admin'),
    searchParams,
  ]);
  if (projectsResult.error || adminResult.error) throw new Error('Impossibile caricare i progetti');
  const projects = projectsResult.data ?? [];
  const isAdmin = adminResult.data === true;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-10 lg:px-10">
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">Workspace / Progetti</p>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">{isAdmin ? 'Tutti i progetti' : 'I tuoi progetti'}</h1>{isAdmin ? <Badge variant="secondary">Amministratore generale</Badge> : null}</div>
        <p className="text-muted-foreground">{isAdmin ? 'Gestisci tutti i siti della piattaforma e i loro ambienti.' : 'I siti che hai creato e quelli condivisi con te.'}</p>
      </header>
      <Feedback message={message} />
      <ProjectList projects={projects} />
    </main>
  );
}
