'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardNav() {
  const pathname = usePathname();
  const active = pathname !== '/dashboard/new';
  return <nav aria-label="Navigazione principale">
    <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Workspace</p>
    <Link href="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined} className={`block rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent'}`}>Progetti</Link>
  </nav>;
}
