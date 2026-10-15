'use client';

import { createContext, useContext } from 'react';
import { MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const PlaygroundContext = createContext<((environmentId: string, trigger: HTMLButtonElement) => void) | null>(null);

export function EnvironmentPlaygroundTrigger({ environmentId, environmentName }: { environmentId: string; environmentName: string }) {
  const openPlayground = useContext(PlaygroundContext);
  return <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 max-w-40 whitespace-normal lg:max-w-none lg:whitespace-nowrap" disabled={!openPlayground} aria-label={`Visualizza ${environmentName} in playground`} onClick={event => openPlayground?.(environmentId, event.currentTarget)}><MonitorPlay aria-hidden="true" />Visualizza in playground</Button>;
}
