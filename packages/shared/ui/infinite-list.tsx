'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from './button';

export function InfiniteList<T>({ items, total, onLoadMore, failed = false, onRetry, renderItem, loading, loadingContent, emptyContent, disabled = false, label, className }: {
  items: T[]; total: number; onLoadMore: () => void; failed?: boolean; onRetry: () => void; renderItem: (item: T) => ReactNode;
  loading: boolean; loadingContent: ReactNode; emptyContent: ReactNode;
  disabled?: boolean; label: string; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = items.length < total;

  useEffect(() => {
    if (loading || failed || !hasMore || disabled || !root.current || !sentinel.current) return;
    let frame: number | null = null;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && frame === null) frame = requestAnimationFrame(onLoadMore);
    }, { root: root.current, rootMargin: '0px 0px 160px 0px' });
    observer.observe(sentinel.current);
    return () => { observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [hasMore, items.length, loading, failed, disabled, onLoadMore]);

  return <div ref={root} data-notification-list role="region" aria-label={label} tabIndex={-1} aria-busy={loading} className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
    {items.map(renderItem)}
    {loading ? loadingContent : !items.length && !failed ? emptyContent : null}
    {!loading ? <p className="sr-only" role="status">Mostrate {items.length} di {total} notifiche</p> : null}
    {hasMore || failed ? <div ref={sentinel}><Button variant="outline" className="w-full" disabled={disabled || loading} onClick={failed ? onRetry : onLoadMore}>{failed ? 'Riprova il caricamento' : 'Carica altre notifiche'}</Button></div> : null}
  </div>;
}
