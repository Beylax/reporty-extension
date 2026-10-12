'use client';

import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { formatReportDateTime, priorityLabels, type Report } from '@reporty/shared';
import { ReportIcon } from '@/components/report-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioButtons } from '@/components/ui/radio-buttons';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

type Status = Report['status'];
const columns: { value: Status; label: string }[] = [
  { value: 'open', label: 'Aperta' }, { value: 'in_progress', label: 'In lavorazione' },
  { value: 'validation', label: 'Validazione' }, { value: 'resolved', label: 'Chiusa' },
];
const colors = { open: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', in_progress: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200', validation: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200', resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' };

const COLUMN_BATCH_SIZE = 20;

function InfiniteColumn({ children, total, visible, onLoadMore }: {
  children: React.ReactNode; total: number; visible: number; onLoadMore: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = visible < total;
  useEffect(() => {
    if (!hasMore || !root.current || !sentinel.current) return;
    let frame: number | null = null;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && frame === null) {
        frame = requestAnimationFrame(onLoadMore);
      }
    }, { root: root.current, rootMargin: '0px 0px 160px 0px' });
    observer.observe(sentinel.current);
    return () => { observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [hasMore, visible, onLoadMore]);
  return <div ref={root} className="max-h-[65vh] min-h-40 space-y-3 overflow-y-auto p-3">
    {children}
    {hasMore ? <div ref={sentinel} role="status" aria-label="Caricamento altre segnalazioni" className="space-y-3">
      <div className="space-y-3 rounded-xl border bg-card p-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-10 w-full" /></div>
      <Button variant="outline" className="w-full" onClick={onLoadMore}>Carica altre segnalazioni</Button>
    </div> : null}
  </div>;
}

export function ReportKanban({ reports, environments, busy, movingId, onOpen, onMove, onPriorityChange }: {
  reports: Report[];
  environments: { id: string; name: string }[];
  busy: boolean;
  movingId: string | null;
  onOpen: (report: Report) => void;
  onMove: (report: Report, status: Status) => void;
  onPriorityChange: (report: Report, priority: Report['priority']) => void;
}) {
  const [limits, setLimits] = useState<Record<Status, number>>({ open: COLUMN_BATCH_SIZE, in_progress: COLUMN_BATCH_SIZE, validation: COLUMN_BATCH_SIZE, resolved: COLUMN_BATCH_SIZE });
  const dragging = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const clickResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (clickResetTimer.current !== null) clearTimeout(clickResetTimer.current); }, []);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [target, setTarget] = useState<Status | null>(null);
  function resetDrag() {
    dragging.current = null; setDraggedId(null); setTarget(null);
    // The optimistic move unmounts the source card, so its dragend may never fire.
    // Release click suppression on drop too, after any synthetic drag click.
    if (clickResetTimer.current !== null) clearTimeout(clickResetTimer.current);
    clickResetTimer.current = setTimeout(() => { suppressClick.current = false; clickResetTimer.current = null; }, 0);
  }
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Trascina una card in un’altra colonna per cambiarne lo stato. Usa il menu nella card per cambiare la priorità.</p>
    <div className="grid grid-cols-4 items-start gap-4 overflow-x-auto pb-3" style={{ gridTemplateColumns: 'repeat(4, minmax(300px, 1fr))' }}>
      {columns.map(column => {
        const items = reports.filter(report => report.status === column.value);
        return <section key={column.value} aria-label={`${column.label}: ${items.length} segnalazioni`} className={`min-w-0 rounded-xl border bg-muted/40 transition-colors ${target === column.value ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border'}`}
          onDragOver={event => { if (!dragging.current || busy) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setTarget(column.value); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTarget(null); }}
          onDrop={event => { event.preventDefault(); const report = reports.find(item => item.id === dragging.current); resetDrag(); if (report && report.canChangeStatus && !busy && report.status !== column.value) onMove(report, column.value); }}>
          <header className={`flex items-center gap-2 rounded-t-xl border-b p-3 ${colors[column.value]}`}><h3 className="m-0 flex items-center gap-2 text-sm font-semibold leading-none [&>svg]:block [&>svg]:size-4"><ReportIcon value={column.value} /><span className="block leading-none">{column.label} - {items.length}</span></h3></header>
          <InfiniteColumn total={items.length} visible={limits[column.value]} onLoadMore={() => setLimits(current => ({ ...current, [column.value]: current[column.value] + COLUMN_BATCH_SIZE }))}>
            {!items.length ? <p className="py-8 text-center text-xs text-muted-foreground">Nessuna segnalazione</p> : null}
            {items.slice(0, limits[column.value]).map(report => <Card key={report.id} aria-busy={movingId === report.id} size="sm" className={`cursor-pointer border shadow-none ring-0 transition-colors hover:border-primary/30 hover:bg-primary/5 ${draggedId === report.id ? 'opacity-40' : ''}`}
              onClick={event => { if (!busy && !suppressClick.current && !(event.target as HTMLElement).closest('button, input, a, [role="radiogroup"]')) onOpen(report); }}
              draggable={report.canChangeStatus && !busy}
              onDragStart={event => { if (busy || !report.canChangeStatus || (event.target as HTMLElement).closest('[role="radiogroup"]')) { event.preventDefault(); return; } if (clickResetTimer.current !== null) { clearTimeout(clickResetTimer.current); clickResetTimer.current = null; } dragging.current = report.id; suppressClick.current = true; setDraggedId(report.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', report.id); }}
              onDragEnd={resetDrag}>
              <CardHeader className="gap-2"><div className="flex items-start gap-2">
                <CardTitle className="min-w-0 flex-1"><Button variant="ghost" className="h-auto w-full justify-start whitespace-normal p-0 text-left hover:bg-transparent" disabled={busy} onClick={() => { if (!suppressClick.current) onOpen(report); }}><span className="line-clamp-4 break-words">{report.body}</span></Button></CardTitle>
                {report.canChangeStatus ? <GripVertical aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
              </div></CardHeader>
              <CardContent className="space-y-5"><div className="space-y-1 text-xs text-muted-foreground"><p className="truncate" title={report.authorName}>{report.authorName}</p><p className="truncate" title={report.page_path}>{environments.find(item => item.id === report.environment_id)?.name} · {report.page_path}</p><time dateTime={report.created_at} className="block">{formatReportDateTime(report.created_at)}</time></div>
                <div className="grid gap-2"><Label className="text-xs text-muted-foreground" htmlFor={`kanban-priority-${report.id}`}>Priorità</Label><RadioButtons compact id={`kanban-priority-${report.id}`} label="Priorità" value={report.priority ?? 'medium'} options={Object.entries(priorityLabels).map(([value, label]) => ({ value, label }))} disabled={busy || !report.canChangeStatus} onValueChange={value => onPriorityChange(report, value as Report['priority'])} /></div>
              </CardContent>
            </Card>)}
          </InfiniteColumn>
        </section>;
      })}
    </div>
  </div>;
}
