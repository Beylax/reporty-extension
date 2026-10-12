'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReportTableSort, ReportTableSortField } from '@/lib/report-table-order';

export function ReportTableHeading({ field, label, order, disabled, onChange }: {
  field: ReportTableSortField; label: string; order: ReportTableSort; disabled: boolean;
  onChange: (order: ReportTableSort) => void;
}) {
  const active = order.field === field;
  const nextDirection = active ? order.direction === 'asc' ? 'desc' : 'asc' : field.endsWith('_at') ? 'desc' : 'asc';
  const Icon = active ? order.direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;
  return <th scope="col" aria-sort={active ? order.direction === 'asc' ? 'ascending' : 'descending' : 'none'} className="px-4 py-3 font-medium">
    <button type="button" disabled={disabled} aria-label={`Ordina per ${label.toLocaleLowerCase('it')}: ${nextDirection === 'asc' ? 'crescente' : 'decrescente'}`} onClick={() => onChange({field,direction:nextDirection})} className={`inline-flex items-center gap-2 whitespace-nowrap rounded-sm text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 ${active ? 'text-foreground' : ''}`}>
      {label}<Icon aria-hidden="true" className={`size-3.5 shrink-0 ${active ? '' : 'opacity-50'}`} />
    </button>
  </th>;
}
