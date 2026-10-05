'use client';

import { Tabs } from '@base-ui/react/tabs';

export function ProjectTabs({ reports, environments }: { reports: React.ReactNode; environments: React.ReactNode }) {
  return <Tabs.Root defaultValue="reports" className="space-y-6"><Tabs.List className="flex flex-wrap gap-1 rounded-lg border bg-muted p-1" aria-label="Sezioni del progetto">{[['reports', 'Segnalazioni'], ['environments', 'Ambienti']].map(([value, label]) => <Tabs.Tab key={value} value={value} className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-background data-active:text-foreground data-active:shadow-sm">{label}</Tabs.Tab>)}</Tabs.List><Tabs.Panel value="reports" className="space-y-6 outline-none">{reports}</Tabs.Panel><Tabs.Panel value="environments" className="space-y-6 outline-none">{environments}</Tabs.Panel></Tabs.Root>;
}
