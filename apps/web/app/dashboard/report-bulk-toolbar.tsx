'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { priorityLabels, type BulkReportRequest, type Report } from '@reporty/shared';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DeleteConfirm } from '@/components/delete-confirm';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ReportCountBadge } from '@/components/report-count-badge';

const statuses = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
function BulkToolbarPosition({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const [offscreen, setOffscreen] = useState(false);
  const floating = enabled && offscreen;
  useEffect(() => {
    const placeholder = anchor.current, element = toolbar.current;
    if (!placeholder || !element) return;
    // Keep the inline space stable while the same controls become fixed.
    // This also preserves focus, selected values and the deletion dialog.
    const measure = () => {
      if (getComputedStyle(element).position !== 'fixed') placeholder.style.height = `${element.getBoundingClientRect().height}px`;
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    const observer = new IntersectionObserver(([entry]) => {
      setOffscreen(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
    });
    observer.observe(placeholder);
    return () => { observer.disconnect(); resize.disconnect(); placeholder.style.height = ''; };
  }, []);
  return <div ref={anchor}>
    <section ref={toolbar} aria-label="Azioni in blocco" className={`space-y-2 rounded-xl border bg-card p-2 ${floating ? 'fixed bottom-6 left-1/2 z-30 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 shadow-xl' : ''}`}>
      {children}
    </section>
  </div>;
}

export function ReportBulkToolbar({ count, disabled, pending, canUpdate, canDelete, onApply, floatOnScroll = false }: {
  count: number; disabled: boolean;
  pending: { completed: number; total: number; operation: BulkReportRequest['operation'] } | null;
  canUpdate: boolean; canDelete: boolean;
  floatOnScroll?: boolean;
  onApply: (operation: BulkReportRequest['operation'], value?: Report['status'] | Report['priority']) => Promise<void>;
}) {
  const [status, setStatus] = useState(''), [priority, setPriority] = useState('');
  return count > 0 ? <BulkToolbarPosition enabled={floatOnScroll}>
      <div className="flex flex-wrap items-center gap-2 [&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:px-2 [&_[data-slot=select-trigger]]:text-xs">
        <p role="status" aria-atomic="true" className="mr-1 flex items-center gap-1.5 whitespace-nowrap text-xs font-medium"><ReportCountBadge count={count} label={count === 1 ? 'segnalazione selezionata' : 'segnalazioni selezionate'} /><span aria-hidden="true">{count === 1 ? 'selezionata' : 'selezionate'}</span></p>
        <div className="flex items-center gap-1.5">
          <div className="w-36"><Label className="sr-only" htmlFor="bulk-report-status">Stato</Label><SelectField id="bulk-report-status" label="Stato per le selezionate" value={status} disabled={disabled || !canUpdate} onValueChange={setStatus} options={[{value:'',label:'Scegli stato'},...Object.entries(statuses).map(([value,label])=>({value,label}))]} /></div>
          <Button aria-label="Applica stato alle selezionate" disabled={disabled || !status || !canUpdate} onClick={() => void onApply('status', status as Report['status'])}>{pending?.operation === 'status' ? <Skeleton className="h-4 w-12" /> : 'Applica'}</Button>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-36"><Label className="sr-only" htmlFor="bulk-report-priority">Priorità</Label><SelectField id="bulk-report-priority" label="Priorità per le selezionate" value={priority} disabled={disabled || !canUpdate} onValueChange={setPriority} options={[{value:'',label:'Scegli priorità'},...(['high','medium','low'] as const).map(value=>({value,label:priorityLabels[value]}))]} /></div>
          <Button aria-label="Applica priorità alle selezionate" disabled={disabled || !priority || !canUpdate} onClick={() => void onApply('priority', priority as Report['priority'])}>{pending?.operation === 'priority' ? <Skeleton className="h-4 w-12" /> : 'Applica'}</Button>
        </div>
        <DeleteConfirm triggerProps={{ size: 'icon', 'aria-label': 'Elimina selezionate', title: 'Elimina selezionate' }} disabled={disabled || !canDelete} description={`Eliminare ${count} segnalazioni selezionate, incluse quelle nelle altre pagine, e tutte le loro risposte? Questa operazione è definitiva.`} onConfirm={() => onApply('delete')}><Trash2 className="size-4" aria-hidden="true" /></DeleteConfirm>
      </div>
      {pending ? <div role="status" className="space-y-1"><p className="text-xs text-muted-foreground">{pending.operation === 'delete' ? 'Eliminazione' : 'Aggiornamento'} segnalazioni: {pending.completed} di {pending.total}</p><Progress value={pending.completed / pending.total * 100} label="Avanzamento azione in blocco" valueText={`${pending.completed} di ${pending.total}`} /></div> : null}
  </BulkToolbarPosition> : null;
}
