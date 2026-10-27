import type { Report, ReportComment } from '@reporty/shared';

export type PlaygroundReportDetail = { report: Report; comments: ReportComment[] };
type Change = { status: Report['status'] } | { priority: Report['priority'] };
type Entry = {
  base?: PlaygroundReportDetail;
  snapshot?: PlaygroundReportDetail;
  expires: number;
  revision: number;
  pending: Change[];
  queue: Promise<void>;
  request?: Promise<void>;
};

/** Owned by one playground instance; never persisted or shared between accounts. */
export function createPlaygroundReportCache(
  load: (pagePath: string, id: string) => Promise<PlaygroundReportDetail>,
  save: (id: string, change: Change) => Promise<void>,
  now = Date.now,
) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const key = (pagePath: string, id: string) => JSON.stringify([pagePath, id]);
  function entryFor(pagePath: string, id: string) {
    const identity = key(pagePath, id);
    let entry = entries.get(identity);
    if (!entry) {
      entry = { expires: 0, revision: 0, pending: [], queue: Promise.resolve() };
      entries.set(identity, entry);
    }
    return entry;
  }
  function publish(entry: Entry) {
    entry.snapshot = entry.base ? {
      ...entry.base,
      report: Object.assign({}, entry.base.report, ...entry.pending),
    } : undefined;
    listeners.forEach(listener => listener());
  }
  async function refresh(pagePath: string, id: string, force = false): Promise<void> {
    const entry = entryFor(pagePath, id);
    // Do not read an intermediate server value while writes are queued.
    while (entry.pending.length) await entry.queue;
    if (!force && entry.base && now() < entry.expires) return;
    if (entry.request) return entry.request;
    const revision = entry.revision;
    const request = load(pagePath, id).then(detail => {
      // A read started before a click must never undo its optimistic value.
      if (entry.revision !== revision) return;
      entry.base = detail;
      entry.expires = now() + 30_000;
      publish(entry);
    }).finally(() => { if (entry.request === request) entry.request = undefined; });
    entry.request = request;
    return request;
  }
  function update(pagePath: string, id: string, change: Change) {
    const entry = entryFor(pagePath, id);
    if (!entry.base) return Promise.reject(new Error('Segnalazione non disponibile.'));
    entry.revision++;
    entry.pending.push(change);
    publish(entry);
    // Serialize writes to preserve click order, including across drawer mounts.
    const task = entry.queue.then(async () => {
      try {
        await save(id, change);
        entry.base = { ...entry.base!, report: { ...entry.base!.report, ...change } };
      } finally {
        entry.revision++;
        entry.pending = entry.pending.filter(item => item !== change);
        publish(entry);
      }
    });
    // A failed write rolls back only its patch and does not poison later writes.
    entry.queue = task.catch(() => {});
    return task;
  }
  return {
    refresh,
    update,
    get: (pagePath: string, id: string) => entries.get(key(pagePath, id))?.snapshot,
    settled: (pagePath: string, id: string) => entryFor(pagePath, id).queue,
    expire: (pagePath: string, id: string) => {
      const entry = entryFor(pagePath, id);
      entry.revision++;
      entry.expires = 0;
      // An edit/reply needs a new read even if an older read is still in flight.
      entry.request = undefined;
    },
    remove: (pagePath: string, id: string) => { entries.delete(key(pagePath, id)); listeners.forEach(listener => listener()); },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type PlaygroundReportCache = ReturnType<typeof createPlaygroundReportCache>;
