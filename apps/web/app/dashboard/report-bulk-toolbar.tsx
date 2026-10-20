'use client';

import { Check, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { priorityLabels, type Report } from '@reporty/shared';
import type { BulkReportAction, BulkReportProgress } from '@/lib/bulk-report-update';
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
      const bounds = placeholder.getBoundingClientRect();
      element.style.setProperty('--bulk-toolbar-center', `${bounds.left + bounds.width / 2}px`);
      element.style.setProperty('--bulk-toolbar-width', `${Math.min(bounds.width, window.innerWidth - 32)}px`);
      if (getComputedStyle(element).position !== 'fixed') placeholder.style.height = `${element.getBoundingClientRect().height}px`;
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    resize.observe(placeholder);
    window.addEventListener('resize', measure);
    const observer = new IntersectionObserver(([entry]) => {
      setOffscreen(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
    });
    observer.observe(placeholder);
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', measure); placeholder.style.height = ''; };
  }, []);
  return <div ref={anchor}>
    <section ref={toolbar} aria-label="Azioni in blocco" className={`space-y-2 rounded-xl border bg-card p-2 ${floating ? 'fixed bottom-6 left-[var(--bulk-toolbar-center)] z-30 w-max max-w-[var(--bulk-toolbar-width)] -translate-x-1/2 shadow-xl' : ''}`}>
      {children}
    </section>
  </div>;
}

export function ReportBulkToolbar({ count, total, showSelectAll, selectingAll, onSelectAll, onDeselectAll, disabled, pending, canUpdate, canDelete, onApply, floatOnScroll = false }: {
  count: number; disabled: boolean;
  total: number; showSelectAll: boolean; selectingAll: boolean;
  onSelectAll: () => void; onDeselectAll: () => void;
  pending: BulkReportProgress | null;
  canUpdate: boolean; canDelete: boolean;
  floatOnScroll?: boolean;
  onApply: (action: BulkReportAction) => Promise<void>;
}) {
  const [status, setStatus] = useState(''), [priority, setPriority] = useState('');
  return count > 0 ? <BulkToolbarPosition enabled={floatOnScroll}>
      <div className="flex flex-wrap items-center gap-2 [&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:px-2 [&_[data-slot=select-trigger]]:text-xs">
        <p role="status" aria-atomic="true" className="mr-1 flex items-center text-xs font-medium"><ReportCountBadge count={count} label={count === 1 ? 'segnalazione selezionata' : 'segnalazioni selezionate'} /></p>
        <div className="flex items-center gap-1.5">
          <div className="w-36"><Label className="sr-only" htmlFor="bulk-report-status">Stato</Label><SelectField id="bulk-report-status" label="Stato per le selezionate" value={status} disabled={disabled || !canUpdate} onValueChange={setStatus} options={[{value:'',label:'Scegli stato'},...Object.entries(statuses).map(([value,label])=>({value,label}))]} /></div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-36"><Label className="sr-only" htmlFor="bulk-report-priority">Priorità</Label><SelectField id="bulk-report-priority" label="Priorità per le selezionate" value={priority} disabled={disabled || !canUpdate} onValueChange={setPriority} options={[{value:'',label:'Scegli priorità'},...(['high','medium','low'] as const).map(value=>({value,label:priorityLabels[value]}))]} /></div>
        </div>
        <Button size="icon" aria-label="Applica alle selezionate" title="Applica stato e priorità selezionati" disabled={disabled || (!status && !priority) || !canUpdate} onClick={() => void onApply({ operation: 'update', ...(status ? { status: status as Report['status'] } : {}), ...(priority ? { priority: priority as Report['priority'] } : {}) })}>{pending?.operation === 'update' ? <Skeleton className="size-4" /> : <Check aria-hidden="true" />}</Button>
        <DeleteConfirm triggerProps={{ size: 'icon', 'aria-label': 'Elimina selezionate', title: 'Elimina selezionate' }} disabled={disabled || !canDelete} description={`Eliminare ${count} segnalazioni selezionate, incluse quelle nelle altre pagine, e tutte le loro risposte? Questa operazione è definitiva.`} onConfirm={() => onApply({ operation: 'delete' })}><Trash2 className="size-4" aria-hidden="true" /></DeleteConfirm>
        {showSelectAll ? <Button variant="outline" className="text-xs" disabled={disabled} aria-label={`Seleziona tutte le segnalazioni (${total})`} onClick={onSelectAll}>{selectingAll ? <Skeleton className="h-3 w-32" /> : `Seleziona tutte (${total})`}</Button> : null}
        <Button variant="ghost" className="text-xs" disabled={disabled} onClick={onDeselectAll}>Deseleziona tutte</Button>
      </div>
      {pending ? <div role="status" className="space-y-1"><p className="text-xs text-muted-foreground">{pending.operation === 'delete' ? 'Eliminazione' : 'Aggiornamento'} segnalazioni: {pending.completed} di {pending.total}</p><Progress value={pending.completed / pending.total * 100} label="Avanzamento azione in blocco" valueText={`${pending.completed} di ${pending.total}`} /></div> : null}
  </BulkToolbarPosition> : null;
}
