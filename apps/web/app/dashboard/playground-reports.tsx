'use client';

import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { Search } from 'lucide-react';
import { priorityLabels, type Report, type ReportPageQuery } from '@reporty/shared';
import { useDebouncedValue } from '@reporty/shared/ui/use-debounced-value';
import { useReportPage } from '@reporty/shared/ui/use-report-page';
import { FilterPill } from '@/components/filter-pill';
import { ReportIcon } from '@/components/report-icon';
import { ReportPagination, REPORT_PAGE_SIZE } from '@/components/report-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToastManager } from '@/components/ui/toast';
import { startNotificationPolling } from '@/lib/notification-polling';
import { getReportPage } from './report-actions';
import { ReportFilter } from './report-filter';

const statusLabels = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
const statusColors = {
  open: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  in_progress: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  validation: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};
const priorityColors = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  medium: 'bg-amber-100 text-amber-800 dark:bg-orange-950 dark:text-orange-200',
  high: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const priorityOptions = (['high', 'medium', 'low'] as const).map(value => ({ value, label: priorityLabels[value] }));

function PlaygroundReportsSkeleton() {
  return <div role="status" aria-label="Caricamento segnalazioni della pagina" className="space-y-3">
    <span className="sr-only">Caricamento segnalazioni…</span>
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3 rounded-xl border p-3" aria-hidden="true">
      <div className="flex gap-2"><Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
      <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>
      <Skeleton className="h-3 w-28" />
    </div>)}
  </div>;
}

export function PlaygroundReports({ environment, pagePath, onSelectReport, connected }: {
  environment: { id: string; name: string; origin: string };
  pagePath: string;
  onSelectReport: (id: string) => void;
  connected: boolean;
}) {
  const toast = useToastManager();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);
  const [statuses, setStatuses] = useState<string[]>(['open', 'in_progress', 'validation']);
  const [priorities, setPriorities] = useState<string[]>([]);
  const filterKey = JSON.stringify([environment.id, pagePath, search, statuses, priorities]);
  const [selection, setSelection] = useState({ key: filterKey, page: 1 });
  const page = selection.key === filterKey ? selection.page : 1;
  const load = useCallback((query: ReportPageQuery) => getReportPage(environment.id, {
    ...query,
    // The dashboard action reads across the project: always constrain this sidebar.
    environments: [environment.id],
    pages: [pagePath],
  }), [environment.id, pagePath]);
  const feed = useReportPage({
    offset: (page - 1) * REPORT_PAGE_SIZE,
    limit: REPORT_PAGE_SIZE,
    search,
    statuses: statuses as Report['status'][],
    priorities: priorities as Report['priority'][],
    environments: [environment.id],
    pages: [pagePath],
    sort: { field: 'priority', direction: 'asc' },
  }, load, {
    scope: JSON.stringify([environment.id, pagePath]),
    onError: message => toast.add({ title: 'Caricamento non riuscito', description: message, type: 'error' }),
  });
  const pages = Math.max(1, Math.ceil(feed.total / REPORT_PAGE_SIZE));
  if (!feed.loading && !feed.failed && page > pages) setSelection({ key: filterKey, page: pages });

  const refresh = useEffectEvent(async () => {
    if (searchInput !== search) return;
    await feed.poll();
  });
  useEffect(() => startNotificationPolling(() => refresh()), []);

  return <section aria-label="Segnalazioni della pagina corrente" className="flex min-h-0 flex-col gap-4">
    <header className="space-y-1">
      <h2 className="text-base font-semibold">Segnalazioni della pagina</h2>
      <p className="truncate text-xs text-muted-foreground" title={`${environment.origin}${pagePath}`}>{environment.name} · {pagePath}</p>
    </header>
    <div className="space-y-3">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Cerca segnalazioni della pagina" placeholder="Cerca segnalazioni…" className="pl-9" maxLength={10000} value={searchInput} onChange={event => setSearchInput(event.target.value)} />
      </div>
      <div className="flex gap-2">
        <ReportFilter label="Stato" options={statusOptions} selected={statuses} onChange={setStatuses} />
        <ReportFilter label="Priorità" options={priorityOptions} selected={priorities} onChange={setPriorities} />
      </div>
      {searchInput || statuses.length || priorities.length ? <div className="flex flex-wrap gap-1.5" aria-label="Filtri attivi">
        {searchInput ? <FilterPill label={`Ricerca: ${searchInput}`} onRemove={() => setSearchInput('')} /> : null}
        {statuses.map(status => <FilterPill key={status} label={statusLabels[status as Report['status']]} onRemove={() => setStatuses(values => values.filter(value => value !== status))}><ReportIcon value={status} /></FilterPill>)}
        {priorities.map(priority => <FilterPill key={priority} label={`Priorità ${priorityLabels[priority as Report['priority']].toLowerCase()}`} onRemove={() => setPriorities(values => values.filter(value => value !== priority))}><ReportIcon value={priority} /></FilterPill>)}
      </div> : null}
    </div>
    {!connected ? <p className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">Attendi il collegamento del widget per aprire una segnalazione nella pagina.</p> : null}
    <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={feed.loading}>
      {feed.loading ? <PlaygroundReportsSkeleton /> : feed.failed ? <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">Le segnalazioni della pagina non sono disponibili.</p>
        <Button variant="outline" size="sm" onClick={feed.refresh}>Riprova</Button>
      </div> : feed.reports.length ? <ul className="space-y-3">
        {feed.reports.map(report => <li key={report.id}>
          <button type="button" disabled={!connected} onClick={() => onSelectReport(report.id)} aria-label={`Apri segnalazione: ${report.body}`} className="w-full space-y-3 rounded-xl border bg-card p-3 text-left transition-colors enabled:hover:border-primary/40 enabled:hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed motion-reduce:transition-none">
            <span className="flex flex-wrap gap-1.5">
              <Badge className={`border-[color-mix(in_oklab,currentColor_25%,transparent)] ${statusColors[report.status]}`}><ReportIcon value={report.status} />{statusLabels[report.status]}</Badge>
              <Badge className={`border-[color-mix(in_oklab,currentColor_25%,transparent)] ${priorityColors[report.priority ?? 'medium']}`}><ReportIcon value={report.priority ?? 'medium'} />{priorityLabels[report.priority ?? 'medium']}</Badge>
            </span>
            <span className="line-clamp-3 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{report.body}</span>
            <span className="block truncate text-xs text-muted-foreground">{report.authorName}</span>
          </button>
        </li>)}
      </ul> : <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nessuna segnalazione per questa pagina con i filtri selezionati.</p>}
    </div>
    {!feed.loading && !feed.failed ? <ReportPagination total={feed.total} page={page} pages={pages} onChange={next => setSelection({ key: filterKey, page: next })} /> : null}
  </section>;
}
