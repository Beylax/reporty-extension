'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { NotificationCursor, NotificationPage, NotificationPageQuery } from '../src/reports';
import { isPageActive } from '../src/page-activity';
import { usePageActive } from './use-page-active';

const empty: NotificationPage = { items: [], total: 0, totalInScope: 0, unread: 0, cursor: null, arrivalCount: 0, latest: null, projects: [], environments: [] };
const beginning: NotificationCursor = { createdAt: '1970-01-01T00:00:00.000Z', id: '00000000-0000-0000-0000-000000000000' };
const PAGE_SIZE = 20;

/** Poll only counts and one new preview; full history is requested when its list is open. */
export function useNotificationFeed(query: NotificationPageQuery, load: (query: NotificationPageQuery, signal?: AbortSignal) => Promise<NotificationPage>, options: {
  scope: string; enabled: boolean; pollingEnabled?: boolean;
  onArrival: (page: NotificationPage) => void; onError: (message: string) => void;
}) {
  const { scope, enabled, pollingEnabled = true } = options;
  const pageActive = usePageActive();
  const active = pageActive && pollingEnabled;
  const key = JSON.stringify([scope, query]);
  const pagePath = query.pagePath;
  const loader = useEffectEvent(load);
  const onArrival = useEffectEvent(options.onArrival);
  const onError = useEffectEvent(options.onError);
  const [refreshKey, setRefreshKey] = useState(0);
  const [summary, setSummary] = useState({ scope: '', data: empty, revision: 0, failed: false });
  const [list, setList] = useState({ key: '', data: empty, loading: false, failed: false });
  const cursor = useRef<{ scope: string; initialized: boolean; value: NotificationCursor | null }>({ scope: '', initialized: false, value: null });
  const cache = useRef({ key: '', data: empty });
  const listVersion = useRef(0);
  const summaryVersion = useRef(0);
  const listPending = useRef(false);

  useEffect(() => {
    if (!active) return;
    let disposed = false, pending = false, failed = false;
    const controller = new AbortController();
    if (cursor.current.scope !== scope) cursor.current = { scope, initialized: false, value: null };
    async function poll() {
      if (pending || disposed || !isPageActive()) return;
      pending = true;
      const version = summaryVersion.current;
      try {
        const data = await loader({ paginated: true, mode: 'summary', ...(pagePath !== undefined ? { pagePath } : {}), ...(cursor.current.initialized ? { after: cursor.current.value ?? beginning } : {}) }, controller.signal);
        if (disposed || !isPageActive() || version !== summaryVersion.current) return;
        if (cursor.current.initialized && data.arrivalCount) onArrival(data);
        const previous = cursor.current.value;
        if (data.cursor && (!previous || Date.parse(data.cursor.createdAt) > Date.parse(previous.createdAt) || (Date.parse(data.cursor.createdAt) === Date.parse(previous.createdAt) && data.cursor.id > previous.id))) cursor.current.value = data.cursor;
        cursor.current.initialized = true;
        setSummary(previous => ({ scope, data, revision: previous.revision + 1, failed: false }));
        failed = false;
      } catch (error) {
        if (!disposed && version === summaryVersion.current) {
          setSummary(previous => ({ ...previous, scope, failed: true }));
          if (!failed) onError(error instanceof Error ? error.message : 'Notifiche non disponibili.');
          failed = true;
        }
      } finally { pending = false; }
    }
    const first = setTimeout(() => void poll(), 0);
    const timer = setInterval(() => void poll(), 10000);
    const update = () => { void poll(); };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('reporty:notifications-changed', update);
    return () => {
      disposed = true; controller.abort(); clearTimeout(first); clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('reporty:notifications-changed', update);
    };
  }, [scope, pagePath, refreshKey, active]);

  const ready = summary.scope === scope;
  useEffect(() => {
    const version = ++listVersion.current;
    listPending.current = false;
    if (!active || !enabled || !ready || summary.failed) return;
    let disposed = false;
    const controller = new AbortController();
    const parsed = JSON.parse(key)[1] as NotificationPageQuery;
    const previous = cache.current.key === key ? cache.current.data : empty;
    listPending.current = true;
    const timer = setTimeout(() => {
      if (!isPageActive()) { listPending.current = false; return; }
      setList({ key, data: previous, loading: true, failed: false });
      const batches = Math.max(1, Math.ceil(previous.items.length / PAGE_SIZE));
      void Promise.all(Array.from({ length: batches }, (_, index) => loader({ ...parsed, paginated: true, mode: 'page', offset: index * PAGE_SIZE, limit: PAGE_SIZE }, controller.signal))).then(results => {
        if (disposed || version !== listVersion.current) return;
        const data = { ...(results[0] ?? empty), items: results.flatMap(page => page.items) };
        cache.current = { key, data };
        setList({ key, data, loading: false, failed: false });
      }).catch(error => {
        if (!disposed && version === listVersion.current) {
          setList({ key, data: previous, loading: false, failed: true });
          onError(error instanceof Error ? error.message : 'Notifiche non disponibili.');
        }
      }).finally(() => { if (version === listVersion.current) listPending.current = false; });
    }, 0);
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [key, enabled, ready, summary.revision, summary.failed, active]);

  async function loadMore() {
    if (!active || !isPageActive() || !enabled || listPending.current || list.key !== key || list.data.items.length >= list.data.total) return;
    const version = listVersion.current;
    listPending.current = true;
    setList(previous => ({ ...previous, loading: true, failed: false }));
    try {
      const next = await load({ ...query, paginated: true, mode: 'page', offset: list.data.items.length, limit: PAGE_SIZE });
      if (version !== listVersion.current) return;
      const data = { ...next, items: [...list.data.items, ...next.items.filter(item => !list.data.items.some(previous => previous.id === item.id))] };
      cache.current = { key, data };
      setList({ key, data, loading: false, failed: false });
    } catch (error) {
      if (version === listVersion.current) {
        setList(previous => ({ ...previous, loading: false, failed: true }));
        options.onError(error instanceof Error ? error.message : 'Notifiche non disponibili.');
      }
    } finally { if (version === listVersion.current) listPending.current = false; }
  }
  function applyRead(data: NotificationPage, id?: string) {
    // Update the visible rows before resolving the action, preserving focus handoff.
    if (cache.current.key === key) {
      const previous = cache.current.data;
      const onlyUnread = query.reads?.length === 1 && query.reads[0] === 'unread';
      const changed = previous.items.filter(item => !item.read_at && (!id || item.id === id)).length;
      const items = previous.items.map(item => !id || item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item).filter(item => !onlyUnread || !item.read_at);
      const updated = { ...previous, items, total: onlyUnread ? id ? Math.max(0, previous.total - changed) : 0 : previous.total };
      cache.current = { key, data: updated };
      setList(previous => previous.key === key ? { ...previous, data: updated } : previous);
    }
    listVersion.current++; summaryVersion.current++;
    listPending.current = false;
    setSummary(previous => ({ scope, data, revision: previous.revision + 1, failed: false }));
  }
  return {
    ...(ready ? summary.data : empty), items: list.key === key ? list.data.items : [], total: list.key === key ? list.data.total : 0,
    loading: enabled && !(ready && summary.failed) && (!ready || list.key !== key || list.loading), summaryLoading: !ready,
    applyRead, failed: (ready && summary.failed) || (list.key === key && list.failed), loadMore,
    refresh: () => { listVersion.current++; summaryVersion.current++; listPending.current = false; setRefreshKey(value => value + 1); },
  };
}
