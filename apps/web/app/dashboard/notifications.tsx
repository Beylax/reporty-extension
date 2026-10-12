'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog as Primitive } from '@base-ui/react/dialog';
import { Bell, X } from 'lucide-react';
import { createNotificationArrivalTracker, notificationSummary, type ReportNotification } from '@reporty/shared';
import { NotificationCard, NotificationRowsSkeleton } from '@/components/notification-content';
import { Button } from '@/components/ui/button';
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
  const [readingId, setReadingId] = useState<string | null>(null);
  const lock = useRef(false);
  const revision = useRef(0);
  const collectArrivals = useRef(createNotificationArrivalTracker());
  const [projects, setProjects] = useState<string[]>([]), [environments, setEnvironments] = useState<string[]>([]), [statuses, setStatuses] = useState<string[]>([]), [reads, setReads] = useState<string[]>(['unread']);
  function acceptNotifications(next: ReportNotification[]) {
    const arrivals = collectArrivals.current(next);
    setItems(next);
    const item = arrivals[0];
    if (!item) return;
    toast.add({ title: arrivals.length === 1 ? 'Nuova notifica' : `${arrivals.length} nuove notifiche`, description: arrivals.length === 1 ? `${notificationSummary(item)} · ${item.project_name} · ${(item.reply_body ?? item.body).slice(0,120)}` : 'Apri il pannello notifiche per consultarle.', type: 'success' });
  }
  const receiveNotifications = useEffectEvent(acceptNotifications);
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
        if (!disposed && version === revision.current) { receiveNotifications(result.data ?? []); failed = false; }
      } catch (error) {
        if (!disposed && !failed) notifyError(error instanceof Error ? error.message : 'Riprova.');
        failed = true;
      } finally { if (!disposed) setLoading(false); }
    }
    const stop = startNotificationPolling(refresh);
    return () => { disposed = true; stop(); controller.abort(); };
  }, []);
  useEffect(() => { if (open) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)); }, [open]);
  async function read(item?: ReportNotification, openReport = true) {
    if (lock.current) return;
    lock.current = true; revision.current++; setBusy(true);
    setReadingId(item && !openReport ? item.id : null);
    try {
      const result = await notificationAction(item ? 'notification_read' : 'notifications_read', item?.id);
      if (result.error) throw new Error(result.error);
      acceptNotifications(result.data ?? []);
      if (item && openReport) {
        setOpen(false);
        router.push(`/dashboard/projects/${item.project_id}?report=${item.issue_id}`);
      } else toast.add({ title: item ? 'Notifica segnata come letta' : 'Tutte le notifiche segnate come lette', type: 'success' });
    } catch (error) { toast.add({ title: 'Operazione non riuscita', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); }
    finally { lock.current = false; setBusy(false); setReadingId(null); }
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
      <Primitive.Description className="text-sm text-muted-foreground">Nuove segnalazioni, cambi di stato e risposte di tutti i progetti.</Primitive.Description>
      <Button variant="outline" disabled={busy || loading || !unread} onClick={() => void read()}>Segna tutte come lette</Button>
      <div className="flex gap-2 overflow-x-auto pb-1"><ReportFilter label="Progetto" options={projectOptions} selected={projects} onChange={values => { setProjects(values); setEnvironments([]); }} /><ReportFilter label="Ambiente" options={environmentOptions} selected={environments} onChange={setEnvironments} /><ReportFilter label="Stato" options={Object.entries(labels).map(([value,label]) => ({value,label}))} selected={statuses} onChange={setStatuses} /><ReportFilter label="Lettura" options={Object.entries(readLabels).map(([value,label]) => ({value,label}))} selected={reads} onChange={setReads} /></div>
      {filters.length ? <div className="flex flex-wrap gap-2" aria-label="Filtri notifiche attivi">{filters.map(filter => <FilterPill key={filter.key} label={filter.label} onRemove={filter.remove} />)}</div> : null}
      <div data-notification-list tabIndex={-1} className="min-h-0 flex-1 space-y-3 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring">{loading ? <NotificationRowsSkeleton showProject /> : filtered.length ? filtered.slice(pagination.start, pagination.start + REPORT_PAGE_SIZE).map(item => <NotificationCard key={item.id} item={item} showProject disabled={busy} reading={readingId === item.id} onOpen={() => read(item)} onMarkRead={() => read(item, false)} />) : <p className="py-6 text-sm text-muted-foreground">Nessuna notifica trovata.</p>}</div>
      <ReportPagination total={filtered.length} page={pagination.page} pages={pagination.pages} onChange={pagination.setPage} />
    </Primitive.Popup></Primitive.Portal></Primitive.Root>
  </>;
}
