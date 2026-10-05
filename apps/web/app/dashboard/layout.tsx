import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { signOut } from '@/app/login/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { DashboardNav } from './nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { email, userId, supabase } = await requireUser();
  const [projects, memberships, platformAdmin] = await Promise.all([
    supabase.from('projects').select('id,name').order('name'),
    supabase.from('project_members').select('role').eq('user_id', userId).eq('role', 'admin'),
    supabase.rpc('is_platform_admin'),
  ]);
  if (projects.error || memberships.error || platformAdmin.error) throw new Error('Impossibile caricare la navigazione.');
  const canManageUsers = platformAdmin.data === true || Boolean(memberships.data?.length);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-b bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <div className="flex h-full min-h-0 flex-col gap-6 p-5">
          <Link href="/dashboard" className="flex items-center gap-3 text-xl font-semibold tracking-tight"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-base text-primary-foreground">R</span>Reporty</Link>
          <Link href="/dashboard/new" className={buttonVariants({ className: 'w-full justify-start' })}>+ Nuovo progetto</Link>
          <DashboardNav projects={projects.data ?? []} canManageUsers={canManageUsers} />
          <div className="mt-auto flex min-w-0 items-center gap-2 border-t pt-4">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={email}>{email}</p>
            <form action={signOut}><Button type="submit" variant="outline" size="sm">Esci</Button></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 bg-muted/30">{children}</div>
    </div>
  );
}
