'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

type Project = { id: string; name: string; environments: { id: string; name: string; origin: string }[] };

export function ProjectList({ projects }: { projects: Project[] }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('it');
  const filtered = projects.filter(project =>
    project.name.toLocaleLowerCase('it').includes(query) ||
    project.environments.some(environment => `${environment.name} ${environment.origin}`.toLocaleLowerCase('it').includes(query)));
  return <section className="space-y-5" aria-label="Lista progetti">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="w-full max-w-md"><Label htmlFor="project-search" className="sr-only">Cerca progetti, ambienti o domini</Label><Input id="project-search" type="search" placeholder="Cerca progetti, ambienti o domini…" value={search} onChange={event => setSearch(event.target.value)} className="bg-background" /></div>
      <p role="status" className="text-sm text-muted-foreground">{filtered.length} di {projects.length} progetti</p>
    </div>
    <div className="overflow-hidden rounded-xl border bg-card">
      {filtered.length ? <ul className="divide-y">{filtered.map(project => <li key={project.id}>
        <Link href={`/dashboard/projects/${project.id}`} className="flex flex-wrap items-center justify-between gap-4 p-5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2]">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted font-semibold">{project.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0"><h2 className="font-medium">{project.name}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{project.environments.map(environment => environment.origin).join(' · ') || 'Nessun ambiente configurato'}</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-4"><Badge variant="secondary">{project.environments.length} ambienti</Badge><span aria-hidden="true" className="text-muted-foreground">→</span></div>
        </Link>
      </li>)}</ul> : <div className="space-y-2 px-6 py-16 text-center"><h2 className="font-medium">{projects.length ? 'Nessun risultato' : 'Il tuo workspace è pronto'}</h2><p className="text-sm text-muted-foreground">{projects.length ? 'Prova un altro nome o dominio.' : 'Crea il primo progetto dal pulsante nella sidebar.'}</p></div>}
    </div>
  </section>;
}
