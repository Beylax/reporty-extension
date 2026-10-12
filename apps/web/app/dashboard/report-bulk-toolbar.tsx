'use client';

import { useState } from 'react';
import { priorityLabels, type BulkReportRequest, type Report } from '@reporty/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DeleteConfirm } from '@/components/delete-confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

const statuses = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
export function ReportBulkToolbar({ count, total, allSelected, disabled, pending, canUpdate, canDelete, onSelectAll, onClear, onApply }: {
  count: number; total: number; allSelected: boolean; disabled: boolean;
  pending: { completed: number; total: number; operation: BulkReportRequest['operation'] } | null;
  canUpdate: boolean; canDelete: boolean;
  onSelectAll: (checked: boolean) => void; onClear: () => void;
  onApply: (operation: BulkReportRequest['operation'], value?: Report['status'] | Report['priority']) => Promise<void>;
}) {
  const [status, setStatus] = useState(''), [priority, setPriority] = useState('');
  return <section aria-label="Azioni in blocco" className="space-y-4 rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><Checkbox checked={allSelected} indeterminate={count > 0 && !allSelected} disabled={disabled || !total} onCheckedChange={checked => onSelectAll(Boolean(checked))} />Seleziona tutte le {total} segnalazioni filtrate</label><div className="flex items-center gap-3"><p className="text-sm text-muted-foreground" aria-live="polite">{count} selezionate</p>{count ? <Button variant="ghost" size="sm" disabled={disabled} onClick={onClear}>Deseleziona tutte</Button> : null}</div></div>
    {count || pending ? <div className="flex flex-wrap items-end gap-3">
      <div className="grid min-w-44 gap-2"><Label htmlFor="bulk-report-status">Stato</Label><SelectField id="bulk-report-status" label="Stato per le selezionate" value={status} disabled={disabled || !canUpdate} onValueChange={setStatus} options={[{value:'',label:'Scegli stato'},...Object.entries(statuses).map(([value,label])=>({value,label}))]} /></div><Button disabled={disabled || !status || !canUpdate} onClick={() => void onApply('status', status as Report['status'])}>{pending?.operation === 'status' ? <Skeleton className="h-4 w-24" /> : 'Applica stato'}</Button>
      <div className="grid min-w-44 gap-2"><Label htmlFor="bulk-report-priority">Priorità</Label><SelectField id="bulk-report-priority" label="Priorità per le selezionate" value={priority} disabled={disabled || !canUpdate} onValueChange={setPriority} options={[{value:'',label:'Scegli priorità'},...(['high','medium','low'] as const).map(value=>({value,label:priorityLabels[value]}))]} /></div><Button disabled={disabled || !priority || !canUpdate} onClick={() => void onApply('priority', priority as Report['priority'])}>{pending?.operation === 'priority' ? <Skeleton className="h-4 w-28" /> : 'Applica priorità'}</Button>
      <DeleteConfirm disabled={disabled || !canDelete} description={`Eliminare ${count} segnalazioni selezionate, incluse quelle nelle altre pagine, e tutte le loro risposte? Questa operazione è definitiva.`} onConfirm={() => onApply('delete')}>Elimina selezionate ({count})</DeleteConfirm>
    </div> : null}
    {pending ? <div role="status" className="space-y-2"><p className="text-sm text-muted-foreground">{pending.operation === 'delete' ? 'Eliminazione' : 'Aggiornamento'} segnalazioni: {pending.completed} di {pending.total}</p><Progress value={pending.completed / pending.total * 100} label="Avanzamento azione in blocco" valueText={`${pending.completed} di ${pending.total}`} /></div> : null}
  </section>;
}
