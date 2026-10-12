'use client';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import type { ReportSort } from '@reporty/shared';
import { SelectField } from './ui/select';
import { Button } from './ui/button';
const options = [
  { value: 'status', label: 'Stato' }, { value: 'priority', label: 'Priorità' },
  { value: 'created_at', label: 'Data apertura' }, { value: 'updated_at', label: 'Data aggiornamento' },
];
export function ReportOrder({ value, onChange, kanban = false }: { value: ReportSort; onChange: (sort: ReportSort) => void; kanban?: boolean }) {
  const dates = value.field === 'created_at' || value.field === 'updated_at';
  const direction = dates ? value.direction === 'desc' ? 'Più recenti prima' : 'Più vecchie prima'
    : value.field === 'priority' ? value.direction === 'asc' ? 'Alta → Bassa' : 'Bassa → Alta'
    : value.direction === 'asc' ? 'Aperta → Chiusa' : 'Chiusa → Aperta';
  return <div className="ml-auto flex shrink-0 items-center gap-2">
    <span className="whitespace-nowrap text-xs text-muted-foreground">Ordina per</span>
    <div className="w-44"><SelectField label="Ordina segnalazioni per" value={value.field} options={options.filter(option => !kanban || option.value !== 'status')} onValueChange={field => onChange({ field: field as ReportSort['field'], direction: field.endsWith('_at') ? 'desc' : 'asc' })} /></div>
    <Button variant="outline" size="icon" className="size-10" aria-label={`Ordine: ${direction}. Inverti ordine`} title={`${direction} · inverti ordine`} onClick={() => onChange({ ...value, direction: value.direction === 'asc' ? 'desc' : 'asc' })}>{value.direction === 'asc' ? <ArrowUpNarrowWide className="size-4" /> : <ArrowDownWideNarrow className="size-4" />}</Button>
  </div>;
}
