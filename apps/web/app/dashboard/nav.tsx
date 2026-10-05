'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Folder, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function DashboardNav({ projects, canManageUsers }: { projects: { id: string; name: string }[]; canManageUsers: boolean }) {
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const itemClass = (active: boolean) => `flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent'}`;
  return <nav aria-label="Navigazione principale" className="min-h-0 flex-1 space-y-4 overflow-y-auto">
    <Link href="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined} className={itemClass(pathname === '/dashboard')}><Folder className="size-4 shrink-0" />Tutti i progetti</Link>
    {canManageUsers ? <Link href="/dashboard/users" className={itemClass(pathname === '/dashboard/users')} aria-current={pathname === '/dashboard/users' ? 'page' : undefined}><Users className="size-4 shrink-0" />Utenti</Link> : null}
    <div className="space-y-2"><p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Progetti</p><Input aria-label="Cerca progetti nella sidebar" placeholder="Cerca progetto…" value={search} onChange={event => setSearch(event.target.value)} /><ul className="space-y-1">{projects.filter(project => project.name.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))).map(project => <li key={project.id}><Link href={`/dashboard/projects/${project.id}`} className={itemClass(pathname === `/dashboard/projects/${project.id}`)} aria-current={pathname === `/dashboard/projects/${project.id}` ? 'page' : undefined}><span className="truncate" title={project.name}>{project.name}</span></Link></li>)}</ul>{!projects.length ? <p className="px-3 text-xs text-muted-foreground">Nessun progetto.</p> : null}</div>
  </nav>;
}
