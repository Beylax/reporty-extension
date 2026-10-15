'use client';

import { Tabs } from '@base-ui/react/tabs';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlaygroundEnvironment } from '@/lib/playground';

const ProjectPlayground = dynamic(() => import('./project-playground'), { ssr: false, loading: () => <div role="status" aria-label="Apertura playground" className="fixed inset-0 z-50 flex flex-col gap-4 bg-background p-4"><div className="flex items-center gap-3 border-b pb-4"><Skeleton className="h-8 w-60" /><Skeleton className="ml-auto h-8 w-40" /><Skeleton className="size-8" /></div><div className="flex gap-2"><Skeleton className="h-9 w-48" /><Skeleton className="h-9 w-48" /></div><div className="flex min-h-0 flex-1 gap-4"><div className="w-72 space-y-4"><Skeleton className="h-9 w-full" />{[0,1,2].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div><Skeleton className="h-full flex-1" /></div></div> });

export function ProjectTabs({ reports, environments, settings, playgroundEnvironments, projectName, initialTab = "reports" }: { reports: React.ReactNode; environments: React.ReactNode; settings: React.ReactNode; playgroundEnvironments: PlaygroundEnvironment[]; projectName: string; initialTab?: "reports" | "environments" | "settings" }) {
  const playgroundTrigger = useRef<HTMLButtonElement>(null);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  return <><Tabs.Root defaultValue={initialTab} className="min-w-0 space-y-6"><div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted p-1"><Tabs.List className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto" aria-label="Sezioni del progetto">{[['reports', 'Segnalazioni'], ['environments', 'Ambienti'], ['settings', 'Impostazioni']].map(([value, label]) => <Tabs.Tab key={value} value={value} className="shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-background data-active:text-foreground data-active:shadow-sm">{label}</Tabs.Tab>)}</Tabs.List><Button ref={playgroundTrigger} variant="outline" onClick={() => setPlaygroundOpen(true)} disabled={!playgroundEnvironments.length}><MonitorPlay aria-hidden="true" />Playground</Button></div><Tabs.Panel value="reports" className="space-y-6 outline-none">{reports}</Tabs.Panel><Tabs.Panel value="environments" className="space-y-6 outline-none">{environments}</Tabs.Panel><Tabs.Panel value="settings" className="space-y-6 outline-none">{settings}</Tabs.Panel></Tabs.Root>{playgroundOpen ? <ProjectPlayground projectName={projectName} environments={playgroundEnvironments} onClose={() => { setPlaygroundOpen(false); playgroundTrigger.current?.focus(); }} /> : null}</>;
}
