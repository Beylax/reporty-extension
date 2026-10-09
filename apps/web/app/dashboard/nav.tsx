'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Folder } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function DashboardNav({ projects }: { projects: { id: string; name: string }[] }) {
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const itemClass = (active: boolean) => `flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/30 motion-reduce:transition-none ${active ? 'border-primary/25 bg-sidebar-accent text-sidebar-accent-foreground' : 'border-transparent text-sidebar-foreground/80 hover:border-primary/15 hover:bg-primary/5 hover:text-primary'}`;
  return <nav aria-label="Navigazione principale" className="min-h-0 flex-1 space-y-4 overflow-y-auto">
    <Link href="/dashboard" aria-current={pathname === '/dashboard' ? 'page' : undefined} className={itemClass(pathname === '/dashboard')}><Folder className="size-4 shrink-0" />Tutti i progetti</Link>

    <hr className="border-sidebar-border" /><div className="space-y-2"><Input aria-label="Cerca progetti nella sidebar" placeholder="Cerca progetto…" value={search} onChange={event => setSearch(event.target.value)} /><ul className="space-y-1">{projects.filter(project => project.name.toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))).map(project => <li key={project.id}><Link href={`/dashboard/projects/${project.id}`} className={itemClass(pathname === `/dashboard/projects/${project.id}`)} aria-current={pathname === `/dashboard/projects/${project.id}` ? 'page' : undefined}><span className="truncate" title={project.name}>{project.name}</span></Link></li>)}</ul>{!projects.length ? <p className="px-3 text-xs text-muted-foreground">Nessun progetto.</p> : null}</div>
  </nav>;
}
