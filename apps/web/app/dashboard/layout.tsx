import { Plus } from 'lucide-react';
import { ThemeSwitch } from '@/components/theme-switch';

import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { signOut } from '@/app/login/actions';
import { buttonVariants } from '@/components/ui/button';
import { SubmitButton } from '@/components/submit-button';
import { DashboardNav } from './nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { email, supabase } = await requireUser();
  const projects = await supabase.from('projects').select('id,name').order('name');
  if (projects.error) throw new Error('Impossibile caricare la navigazione.');
  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-b bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <div className="flex h-full min-h-0 flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2"><Link href="/dashboard" className="min-w-0"><BrandLogo /></Link><ThemeSwitch /></div>
          <DashboardNav projects={projects.data ?? []} />
          <Link href="/dashboard/new" className={buttonVariants({ className: 'w-full justify-start gap-2' })}><Plus className="size-4" aria-hidden="true" />Nuovo progetto</Link>
          <div className="mt-auto flex min-w-0 items-center gap-2 border-t pt-4">
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={email}>{email}</p>
            <form action={signOut}><SubmitButton variant="outline" size="sm" pendingLabel="Uscita…">Esci</SubmitButton></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 bg-muted/30">{children}</div>
    </div>
  );
}
