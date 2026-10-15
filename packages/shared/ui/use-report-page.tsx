'use client';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Report, ReportPage, ReportPageQuery } from '../src/reports';

const empty: ReportPage = { reports: [], total: 0, projectTotal: 0, pages: [] };
/** One request per page; stale requests cannot update a different filter or scope. */
export function useReportPage(query: ReportPageQuery, load: (query: ReportPageQuery) => Promise<ReportPage>, options: { enabled?: boolean; revision?: unknown; infinite?: boolean; scope: string; onError: (message: string) => void }) {
  const { enabled = true, revision, infinite = false, scope } = options;
  const key = JSON.stringify([scope, query]);
  const [state, setState] = useState({ key: '', data: empty, loading: false, failed: false });
  const version = useRef(0);
  const pending = useRef(false);
  const polling = useRef(false);
  const pollingFailed = useRef(false);
  const cache = useRef({ key: '', data: empty });
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchPage = useEffectEvent(load);
  const onError = useEffectEvent(options.onError);
  useEffect(() => {
    const request = ++version.current;
    pending.current = true;
    if (!enabled) { pending.current = false; return; }
    let disposed = false;
    const parsed = JSON.parse(key)[1] as ReportPageQuery;
    const previous = cache.current.key === key ? cache.current.data : empty;
    setState({ key, data: previous, loading: true, failed: false });
    // Debounce typing and collapse changes to multiple filters in the same render.
    const timer = setTimeout(() => {
      const size = parsed.limit ?? 20;
      const batches = infinite ? Math.max(1, Math.ceil(previous.reports.length / size)) : 1;
      void Promise.all(Array.from({ length: batches }, (_, index) => fetchPage({ ...parsed, offset: (parsed.offset ?? 0) + index * size }))).then(results => {
        const data = { ...(results[0] ?? empty), reports: results.flatMap(result => result.reports) };
        if (!disposed && request === version.current) { cache.current = { key, data }; setState({ key, data, loading: false, failed: false }); }
      }).catch(error => {
        if (!disposed && request === version.current) { setState({ key, data: previous, loading: false, failed: true }); onError(error instanceof Error ? error.message : 'Segnalazioni non disponibili.'); }
      }).finally(() => { if (request === version.current) pending.current = false; });
    }, parsed.search ? 250 : 0);
    return () => { disposed = true; clearTimeout(timer); version.current++; };
  }, [key, enabled, revision, refreshKey, infinite]);
  const loadMore = useCallback(async () => {
    if (!infinite || !enabled || pending.current || state.key !== key || state.data.reports.length >= state.data.total) return;
    // A user request takes precedence over an in-flight background update.
    const request = ++version.current;
    pending.current = true;
    setState(previous => ({ ...previous, loading: true, failed: false }));
    try {
      const data = await load({ ...query, offset: state.data.reports.length });
      if (request === version.current) {
        const merged = { ...data, reports: [...state.data.reports, ...data.reports.filter(item => !state.data.reports.some(old => old.id === item.id))] };
        cache.current = { key, data: merged };
        setState({ key, data: merged, loading: false, failed: false });
      }
    } catch (error) {
      if (request === version.current) { setState(previous => ({ ...previous, loading: false, failed: true })); options.onError(error instanceof Error ? error.message : 'Segnalazioni non disponibili.'); }
    } finally { if (request === version.current) pending.current = false; }
  }, [enabled, infinite, key, state, load, query, options]);
  async function poll() {
    if (!enabled || pending.current || polling.current || state.key !== key) return;
    const request = version.current;
    const previous = cache.current.key === key ? cache.current.data : state.data;
    polling.current = true;
    try {
      const size = query.limit ?? 20;
      const batches = infinite ? Math.max(1, Math.ceil(previous.reports.length / size)) : 1;
      const results = await Promise.all(Array.from({ length: batches }, (_, index) => load({ ...query, offset: (query.offset ?? 0) + index * size })));
      if (request !== version.current) return;
      const data = { ...(results[0] ?? empty), reports: results.flatMap(result => result.reports) };
      cache.current = { key, data };
      // Replace only the data: background work never enables skeletons or disables controls.
      setState({ key, data, loading: false, failed: false });
      pollingFailed.current = false;
    } catch (error) {
      if (request === version.current && !pollingFailed.current) {
        pollingFailed.current = true;
        options.onError(error instanceof Error ? error.message : 'Segnalazioni non disponibili.');
      }
    } finally { polling.current = false; }
  }
  function patchReport(change: Pick<Report, 'id'> & Partial<Pick<Report, 'status' | 'priority'>>) {
    if (cache.current.key !== key) return;
    // Confirm the mutation before the optimistic transition ends. Older reads
    // must not restore the value from before this confirmed write.
    version.current++;
    pending.current = false;
    const data = { ...cache.current.data, reports: cache.current.data.reports.map(report => report.id === change.id ? { ...report, ...change } : report) };
    cache.current = { key, data };
    setState({ key, data, loading: false, failed: false });
  }
  return { ...(state.key === key ? state.data : empty), loading: enabled && (state.key !== key || state.loading), failed: state.key === key && state.failed, loadMore, poll, patchReport, refresh: () => setRefreshKey(value => value + 1) };
}
