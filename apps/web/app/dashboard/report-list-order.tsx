'use client';

import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import type { ReportTableSort, ReportTableSortField } from '@/lib/report-table-order';

const options = [
  { value: 'status', label: 'Stato' }, { value: 'priority', label: 'Priorità' },
  { value: 'created_at', label: 'Data apertura' }, { value: 'updated_at', label: 'Data aggiornamento' },
  { value: 'body', label: 'Descrizione' }, { value: 'environment', label: 'Ambiente / Pagina' },
  { value: 'authorName', label: 'Autore' },
];

export function ReportListOrder({ value, onChange, disabled }: { value: ReportTableSort; onChange: (value: ReportTableSort) => void; disabled: boolean }) {
  return <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
    <div className="min-w-0 max-w-48 flex-1"><SelectField label="Ordina segnalazioni per" value={value.field} disabled={disabled} options={options} onValueChange={field => onChange({ field: field as ReportTableSortField, direction: field.endsWith('_at') ? 'desc' : 'asc' })} /></div>
    <Button variant="outline" size="icon" className="size-10" disabled={disabled} aria-label={`Ordine ${value.direction === 'asc' ? 'crescente' : 'decrescente'}. Inverti ordine`} onClick={() => onChange({ ...value, direction: value.direction === 'asc' ? 'desc' : 'asc' })}>{value.direction === 'asc' ? <ArrowUpNarrowWide aria-hidden="true" /> : <ArrowDownWideNarrow aria-hidden="true" />}</Button>
  </div>;
}
