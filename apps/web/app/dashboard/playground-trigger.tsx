'use client';

import { createContext, useContext } from 'react';
import { MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type PlaygroundReport = { id: string; url: string };
export const PlaygroundContext = createContext<((environmentId: string, trigger: HTMLElement, report?: PlaygroundReport) => void) | null>(null);

export function EnvironmentPlaygroundTrigger({ environmentId, environmentName }: { environmentId: string; environmentName: string }) {
  const openPlayground = useContext(PlaygroundContext);
  if (!openPlayground) return null;
  return <Button type="button" variant="outline" size="sm" className="hidden h-auto min-h-8 md:inline-flex max-w-40 whitespace-normal lg:max-w-none lg:whitespace-nowrap" disabled={!openPlayground} aria-label={`Visualizza ${environmentName} in playground`} onClick={event => openPlayground?.(environmentId, event.currentTarget)}><MonitorPlay aria-hidden="true" />Visualizza in playground</Button>;
}
