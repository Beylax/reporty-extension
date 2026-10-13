'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from './button';

const BATCH_SIZE = 20;

export function InfiniteList<T>({ items, renderItem, loading, loadingContent, emptyContent, disabled = false, label, className }: {
  items: T[]; renderItem: (item: T) => ReactNode;
  loading: boolean; loadingContent: ReactNode; emptyContent: ReactNode;
  disabled?: boolean; label: string; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(BATCH_SIZE);
  const hasMore = !loading && visible < items.length;

  useEffect(() => {
    if (!hasMore || disabled || !root.current || !sentinel.current) return;
    let frame: number | null = null;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && frame === null) {
        frame = requestAnimationFrame(() => setVisible(count => Math.min(count + BATCH_SIZE, items.length)));
      }
    }, { root: root.current, rootMargin: '0px 0px 160px 0px' });
    observer.observe(sentinel.current);
    return () => { observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [hasMore, visible, items.length, disabled]);

  return <div ref={root} data-notification-list role="region" aria-label={label} tabIndex={-1} className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
    {loading ? loadingContent : items.length ? items.slice(0, visible).map(renderItem) : emptyContent}
    {!loading ? <p className="sr-only" role="status">Mostrate {Math.min(visible, items.length)} di {items.length} notifiche</p> : null}
    {hasMore ? <div ref={sentinel}><Button variant="outline" className="w-full" disabled={disabled} onClick={() => setVisible(count => Math.min(count + BATCH_SIZE, items.length))}>Carica altre notifiche</Button></div> : null}
  </div>;
}
