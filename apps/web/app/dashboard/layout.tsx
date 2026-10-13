import { Plus, Activity } from 'lucide-react';
import { ThemeSwitch } from '@/components/theme-switch';

import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { signOut } from '@/app/login/actions';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/submit-button';
import { Notifications } from './notifications';
import { DashboardNav } from './nav';
import { DashboardSidebar } from './sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { email, supabase } = await requireUser();
  const projects = await supabase.from('projects').select('id,name').order('name');
  if (projects.error) throw new Error('Impossibile caricare la navigazione.');
  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <DashboardSidebar>
        <div className="flex h-full min-h-0 flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2"><Link href="/dashboard" className="min-w-0"><BrandLogo /></Link><div className="flex shrink-0 items-center gap-1"><Link href="/dashboard/audit" prefetch={false} aria-label="Apri audit Supabase" title="Audit Supabase" className={buttonVariants({ variant: 'outline', size: 'icon' })}><Activity className="size-4" aria-hidden="true" /></Link><Notifications /><ThemeSwitch /></div></div>
          <DashboardNav projects={projects.data ?? []} />
          <Link href="/dashboard/new" className={buttonVariants({ className: 'w-full justify-start gap-2' })}><Plus className="size-4" aria-hidden="true" />Nuovo progetto</Link>
          <div className="mt-auto flex min-w-0 items-center gap-2 border-t pt-4">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={email}>{email}</p>
            <form action={signOut}><SubmitButton variant="outline" size="sm" pendingLabel="Uscita…">Esci</SubmitButton></form>
          </div>
        </div>
      </DashboardSidebar>
      <div className="min-w-0 bg-muted/30">{children}</div>
    </div>
  );
}
