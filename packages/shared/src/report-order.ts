import type { Report } from './reports';
const statusOrder = { open: 0, in_progress: 1, validation: 2, resolved: 3 };
const priorityOrder = { high: 0, medium: 1, low: 2 };
export function compareReports(a: Pick<Report, 'status' | 'priority' | 'created_at' | 'id'>, b: Pick<Report, 'status' | 'priority' | 'created_at' | 'id'>) {
  return statusOrder[a.status] - statusOrder[b.status]
    || priorityOrder[a.priority ?? 'medium'] - priorityOrder[b.priority ?? 'medium']
    || Date.parse(a.created_at) - Date.parse(b.created_at)
    || a.id.localeCompare(b.id);
}

export type ReportSortField = 'status' | 'priority' | 'created_at' | 'updated_at';
export type ReportSort = { field: ReportSortField; direction: 'asc' | 'desc' };
type SortableReport = Pick<Report, 'status' | 'priority' | 'created_at' | 'updated_at' | 'id'>;
function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
export function compareReportsBy(a: SortableReport, b: SortableReport, sort: ReportSort) {
  let difference = 0;
  if (sort.field === 'status') difference = statusOrder[a.status] - statusOrder[b.status];
  else if (sort.field === 'priority') difference = priorityOrder[a.priority ?? 'medium'] - priorityOrder[b.priority ?? 'medium'];
  else {
    const first = timestamp(a[sort.field]), second = timestamp(b[sort.field]);
    // Reports without a recorded update stay last in either direction.
    if (first === null || second === null) {
      if (first !== second) return first === null ? 1 : -1;
    } else difference = first - second;
  }
  if (difference) return sort.direction === 'desc' ? -difference : difference;
  return (sort.field === 'status' ? priorityOrder[a.priority ?? 'medium'] - priorityOrder[b.priority ?? 'medium'] : 0)
    || (timestamp(a.created_at) ?? 0) - (timestamp(b.created_at) ?? 0)
    || a.id.localeCompare(b.id);
}
