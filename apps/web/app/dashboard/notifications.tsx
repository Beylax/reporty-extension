'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog as Primitive } from '@base-ui/react/dialog';
import { Bell, X } from 'lucide-react';
import { formatReportDateTime, type ReportNotification } from '@reporty/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterPill } from '@/components/filter-pill';
import { ReportPagination, useReportPagination, REPORT_PAGE_SIZE } from '@/components/report-pagination';
import { useToastManager } from '@/components/ui/toast';
import { ReportFilter } from './report-filter';
import { NOTIFICATIONS_CHANGED, startNotificationPolling } from '@/lib/notification-polling';
import { notificationAction } from './notification-actions';

const labels = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
export function Notifications() {
  const router = useRouter();
  const toast = useToastManager();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReportNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const [projects, setProjects] = useState<string[]>([]), [environments, setEnvironments] = useState<string[]>([]), [statuses, setStatuses] = useState<string[]>([]), [reads, setReads] = useState<string[]>([]);
  const notifyError = useEffectEvent((description: string) => { toast.add({ title: 'Notifiche non disponibili', description, type: 'error' }); });
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false, failed = false;
    async function refresh() {
      if (lock.current) return;
      const version = revision.current;
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Impossibile caricare le notifiche.');
        if (result.error) throw new Error(result.error);
        if (!disposed && version === revision.current) { setItems(result.data ?? []); failed = false; }
      } catch (error) {
        if (!disposed && !failed) notifyError(error instanceof Error ? error.message : 'Riprova.');
        failed = true;
      } finally { if (!disposed) setLoading(false); }
    }
    const stop = startNotificationPolling(refresh);
    return () => { disposed = true; stop(); controller.abort(); };
  }, []);
  useEffect(() => { if (open) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)); }, [open]);
  async function read(item?: ReportNotification) {
    if (lock.current) return;
    lock.current = true; revision.current++; setBusy(true);
    try {
      const result = await notificationAction(item ? 'notification_read' : 'notifications_read', item?.id);
      if (result.error) throw new Error(result.error);
      setItems(result.data ?? []);
      if (item) {
        setOpen(false);
        router.push(`/dashboard/projects/${item.project_id}?report=${item.issue_id}`);
      } else toast.add({ title: 'Tutte le notifiche segnate come lette', type: 'success' });
    } catch (error) { toast.add({ title: 'Operazione non riuscita', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); }
    finally { lock.current = false; setBusy(false); }
  }
  const projectOptions = [...new Map(items.map(item => [item.project_id, { value: item.project_id, label: item.project_name }])).values()];
  const environmentOptions = [...new Map(items.filter(item => !projects.length || projects.includes(item.project_id)).map(item => [item.environment_id, { value: item.environment_id, label: `${item.project_name} · ${item.environment_name}` }])).values()];
  const readLabels: Record<string, string> = { unread: 'Non lette', read: 'Lette' };
  const filtered = items.filter(item => (!projects.length || projects.includes(item.project_id)) && (!environments.length || environments.includes(item.environment_id)) && (!statuses.length || statuses.includes(item.status)) && (!reads.length || reads.includes(item.read_at ? 'read' : 'unread')));
  const pagination = useReportPagination(filtered.length, JSON.stringify([projects, environments, statuses, reads]));
  const unread = items.filter(item => !item.read_at).length;
  const filters = [
    ...projects.map(value => ({ key: 'project-'+value, label: projectOptions.find(item => item.value === value)?.label ?? value, remove: () => { setProjects(items => items.filter(item => item !== value)); setEnvironments([]); } })),
    ...environments.map(value => ({ key: 'environment-'+value, label: environmentOptions.find(item => item.value === value)?.label ?? value, remove: () => setEnvironments(items => items.filter(item => item !== value)) })),
    ...statuses.map(value => ({ key: 'status-'+value, label: labels[value as keyof typeof labels], remove: () => setStatuses(items => items.filter(item => item !== value)) })),
    ...reads.map(value => ({ key: 'read-'+value, label: readLabels[value], remove: () => setReads(items => items.filter(item => item !== value)) })),
  ];
  return <>
    <Button variant="outline" size="icon" className="relative" aria-label={`Apri notifiche${unread ? `, ${unread} non lette` : ''}`} title="Notifiche" onClick={() => setOpen(true)}><Bell className="size-4" />{unread ? <span aria-hidden="true" className="absolute -top-2 -right-2 min-w-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{unread > 99 ? '99+' : unread}</span> : null}</Button>
    <Primitive.Root open={open} onOpenChange={setOpen}><Primitive.Portal><Primitive.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" /><Primitive.Popup className="fixed inset-y-3 right-3 z-50 flex w-[calc(100%_-_1.5rem)] max-w-xl flex-col gap-5 rounded-2xl border bg-background p-6 text-foreground shadow-2xl outline-none translate-x-0 transition-[translate] duration-300 ease-out data-[starting-style]:translate-x-[calc(100%_+_1rem)] data-[ending-style]:translate-x-[calc(100%_+_1rem)] data-[ending-style]:ease-in motion-reduce:transition-none sm:inset-y-4 sm:right-4 sm:w-[calc(100%_-_2rem)]">
      <header className="flex items-center justify-between gap-3"><Primitive.Title className="text-xl font-semibold">Notifiche</Primitive.Title><Primitive.Close render={<Button variant="outline" size="icon" aria-label="Chiudi notifiche" />}><X className="size-4" /></Primitive.Close></header>
      <Primitive.Description className="text-sm text-muted-foreground">Nuove segnalazioni e cambi di stato di tutti i progetti.</Primitive.Description>
      <Button variant="outline" disabled={busy || loading || !unread} onClick={() => void read()}>Segna tutte come lette</Button>
      <div className="flex gap-2 overflow-x-auto pb-1"><ReportFilter label="Progetto" options={projectOptions} selected={projects} onChange={values => { setProjects(values); setEnvironments([]); }} /><ReportFilter label="Ambiente" options={environmentOptions} selected={environments} onChange={setEnvironments} /><ReportFilter label="Stato" options={Object.entries(labels).map(([value,label]) => ({value,label}))} selected={statuses} onChange={setStatuses} /><ReportFilter label="Lettura" options={Object.entries(readLabels).map(([value,label]) => ({value,label}))} selected={reads} onChange={setReads} /></div>
      {filters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri notifiche attivi">{filters.map(filter => <FilterPill key={filter.key} label={filter.label} onRemove={filter.remove} />)}</div> : null}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">{loading ? <div role="status" aria-label="Caricamento notifiche" className="space-y-3">{[0,1,2].map(item => <div key={item} className="space-y-3 rounded-lg border p-4"><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>)}</div> : filtered.length ? filtered.slice(pagination.start, pagination.start + REPORT_PAGE_SIZE).map(item => <button key={item.id} disabled={busy} onClick={() => void read(item)} className={`block w-full space-y-2 rounded-lg border p-4 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring ${item.read_at ? '' : 'border-primary/30 bg-primary/5'}`}><p className="flex items-center gap-2 text-sm font-medium">{!item.read_at ? <span className="size-2 shrink-0 rounded-full bg-red-600" aria-label="Non letta" /> : null}{item.actor_name}: {item.previous_status === null ? 'Nuova segnalazione' : `${labels[item.previous_status]} → ${labels[item.status]}`}</p><p className="line-clamp-2 break-words text-sm">{item.body}</p><p className="break-all text-xs text-muted-foreground">{item.project_name} · {item.environment_name} · {item.page_path}</p><time className="text-xs text-muted-foreground" dateTime={item.created_at}>{formatReportDateTime(item.created_at)}</time></button>) : <p className="py-6 text-sm text-muted-foreground">Nessuna notifica trovata.</p>}</div>
      <ReportPagination total={filtered.length} page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} />
    </Primitive.Popup></Primitive.Portal></Primitive.Root>
  </>;
}
