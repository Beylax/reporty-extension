import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { ProjectInvitations } from '../project-invitations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

export default async function Users({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { supabase, userId } = await requireUser();
  const [projects, memberships, admin, params] = await Promise.all([
    supabase.from('projects').select('id,name').order('name'),
    supabase.from('project_members').select('project_id').eq('user_id', userId).eq('role', 'admin'),
    supabase.rpc('is_platform_admin'), searchParams,
  ]);
  if (projects.error || memberships.error || admin.error) throw new Error('Impossibile caricare gli utenti.');
  const managed = (projects.data ?? []).filter(project => admin.data === true || memberships.data?.some(member => member.project_id === project.id));
  const selected = managed.find(project => project.id === params.project) ?? managed[0];
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-10"><header className="space-y-2"><h1 className="text-3xl font-semibold">Gestione utenti</h1><p className="text-muted-foreground">Gestisci sviluppatori, ruoli e inviti dei {admin.data === true ? 'progetti della piattaforma' : 'progetti che amministri'}.</p></header>{!managed.length ? <Card><CardContent className="py-6 text-muted-foreground">Non amministri alcun progetto.</CardContent></Card> : <><Card><CardHeader><CardTitle>Seleziona progetto</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{managed.map(project => <Link key={project.id} href={`/dashboard/users?project=${project.id}`} className={buttonVariants({ variant: selected?.id === project.id ? 'default' : 'outline' })} aria-current={selected?.id === project.id ? 'page' : undefined}>{project.name}</Link>)}</CardContent></Card>{selected ? <ProjectInvitations key={selected.id} projectId={selected.id} /> : null}</>}</main>;
}
