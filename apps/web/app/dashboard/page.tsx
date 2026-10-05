import { requireUser } from '@/lib/auth';
import { Feedback } from './feedback';
import { ProjectList } from './project-list';

export default async function Dashboard({ searchParams }: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { supabase } = await requireUser();
  const [projectsResult, { message }] = await Promise.all([
    supabase.from('projects').select('id, name, environments(id, name, origin)').order('created_at', { ascending: false }),
    searchParams,
  ]);
  if (projectsResult.error) throw new Error('Impossibile caricare i progetti');
  const projects = projectsResult.data ?? [];
  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-10 lg:px-10">
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">Workspace / Progetti</p>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">Tutti i progetti</h1></div>
        <p className="text-muted-foreground">Gestisci tutti i siti, gli ambienti e le segnalazioni insieme agli altri sviluppatori.</p>
      </header>
      <Feedback message={message} />
      <ProjectList projects={projects} />
    </main>
  );
}
