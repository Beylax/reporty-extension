import { compareReportsBy, type Report, type ReportSort } from '@reporty/shared';

export type ReportTableSortField = ReportSort['field'] | 'body' | 'environment' | 'authorName';
export type ReportTableSort = { field: ReportTableSortField; direction: ReportSort['direction'] };
const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

export function compareReportTableRows(a: Report, b: Report, sort: ReportTableSort, environmentNames: ReadonlyMap<string, string>) {
  if (sort.field === 'status' || sort.field === 'priority' || sort.field === 'created_at' || sort.field === 'updated_at') return compareReportsBy(a,b,{field:sort.field,direction:sort.direction});
  const difference = sort.field === 'environment'
    ? collator.compare(environmentNames.get(a.environment_id) ?? '',environmentNames.get(b.environment_id) ?? '') || collator.compare(a.page_path,b.page_path)
    : collator.compare(a[sort.field],b[sort.field]);
  if (difference) return sort.direction === 'desc' ? -difference : difference;
  return compareReportsBy(a,b,{field:'created_at',direction:'asc'});
}
