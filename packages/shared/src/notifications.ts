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
