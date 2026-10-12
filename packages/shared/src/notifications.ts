import type { ReportNotification } from './reports';

/** The first successful snapshot is history. Only newly observed unread IDs generate a toast. */
export function createNotificationArrivalTracker() {
  const seen = new Set<string>();
  let initialized = false;
  return <T extends { id: string; read_at: string | null }>(items: T[]): T[] => {
    const arrivals: T[] = [];
    for (const item of items) {
      if (initialized && !seen.has(item.id) && !item.read_at) arrivals.push(item);
      seen.add(item.id);
    }
    initialized = true;
    return arrivals;
  };
}

export function notificationKind(item: Pick<ReportNotification, 'kind' | 'previous_status'>) {
  return item.kind ?? (item.previous_status === null ? 'created' : 'status_changed');
}
export function notificationSummary(item: Pick<ReportNotification, 'kind' | 'previous_status' | 'status' | 'actor_name'>) {
  const labels = { open: 'Aperta', in_progress: 'In lavorazione', validation: 'Validazione', resolved: 'Chiusa' };
  const kind = notificationKind(item);
  return `${item.actor_name}: ${kind === 'reply' ? 'Nuova risposta' : kind === 'created' ? 'Nuova segnalazione' : `${item.previous_status ? labels[item.previous_status] : ''} → ${labels[item.status]}`}`;
}
