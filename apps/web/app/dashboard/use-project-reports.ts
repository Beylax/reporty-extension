'use client';
import { useReportPage } from '@reporty/shared/ui/use-report-page';
import type { Report, ReportPageQuery } from '@reporty/shared';
import { getReportPage } from './report-actions';

export function useProjectReports(environmentId: string | undefined, query: ReportPageQuery, view: 'list' | 'kanban', revision: unknown, onError: (message: string) => void) {
  const load = (input: ReportPageQuery) => environmentId ? getReportPage(environmentId, input) : Promise.resolve({ reports: [], total: 0, projectTotal: 0, pages: [] });
  const options = { scope: environmentId ?? '', revision, onError };
  const list = useReportPage(query, load, { ...options, enabled: view === 'list' });
  const columns = {
    open: useReportPage({ ...query, offset: 0, statuses: ['open'] }, load, { ...options, enabled: view === 'kanban', infinite: true }),
    in_progress: useReportPage({ ...query, offset: 0, statuses: ['in_progress'] }, load, { ...options, enabled: view === 'kanban', infinite: true }),
    validation: useReportPage({ ...query, offset: 0, statuses: ['validation'] }, load, { ...options, enabled: view === 'kanban', infinite: true }),
    resolved: useReportPage({ ...query, offset: 0, statuses: ['resolved'] }, load, { ...options, enabled: view === 'kanban', infinite: true }),
  };
  const active = view === 'list' ? list : columns.open;
  function patchReport(change: Pick<Report, 'id'> & Partial<Pick<Report, 'status' | 'priority'>>) {
    [list, ...Object.values(columns)].forEach(feed => feed.patchReport(change));
  }
  return { ...active, columns, patchReport, poll: async () => { await Promise.all((view === 'list' ? [list] : Object.values(columns)).map(feed => feed.poll())); }, reports: view === 'list' ? list.reports : Object.values(columns).flatMap(column => column.reports) };
}
