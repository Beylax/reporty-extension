'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { ScreenshotSkeleton } from './page-skeletons';
import { LoadingImage } from './loading-image';

export function ScreenshotGallery({ src, sources, aspectRatio, autoOpen = false, loading = false, onClose }: { src: string; sources?: string[]; aspectRatio: string; autoOpen?: boolean; loading?: boolean; onClose?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(false);
  const [selectedSrc, setSelectedSrc] = useState(src);
  const [loadedSrc, setLoadedSrc] = useState('');
  const images = sources?.length ? sources : src ? [src] : [];
  const index = Math.max(0, images.indexOf(selectedSrc || src));
  const current = images[index] ?? '';
  const loaded = Boolean(current) && loadedSrc === current;
  useEffect(() => { if (autoOpen) dialog.current?.showModal(); }, [autoOpen]);
  function navigate(direction: number) {
    const next = images[(index + direction + images.length) % images.length];
    if (next) { setSelectedSrc(next); setZoom(false); }
  }
  return <>
    {!autoOpen ? <button type="button" className="group relative block w-full cursor-zoom-in rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring" aria-label="Ingrandisci screenshot" onClick={() => { setSelectedSrc(src); setZoom(false); dialog.current?.showModal(); }}>
      <LoadingImage src={src} alt="Screenshot originale" aspectRatio={aspectRatio} />
      <span className="absolute right-3 bottom-3 rounded-lg bg-background/90 p-2 shadow"><Expand className="size-4" aria-hidden="true" /></span>
    </button> : null}
    <dialog onClose={event => { event.stopPropagation(); if (onClose) window.setTimeout(onClose, 180); }} onCancel={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape') event.stopPropagation();
      if (images.length > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); event.stopPropagation(); navigate(event.key === 'ArrowLeft' ? -1 : 1); }
    }} ref={dialog} aria-label="Screenshot ingrandito" className="fixed inset-0 m-auto h-[90dvh] w-[95vw] max-w-none rounded-xl border bg-background p-4 text-foreground shadow-xl backdrop:bg-black/80" onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <div className="flex h-full flex-col gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold" aria-live="polite">Screenshot{images.length > 1 ? ` ${index + 1} di ${images.length}` : ''}</h2><div className="flex gap-2">
          {images.length > 1 ? <><Button type="button" variant="outline" size="icon" aria-label="Screenshot precedente" onClick={() => navigate(-1)}><ChevronLeft aria-hidden="true" /></Button><Button type="button" variant="outline" size="icon" aria-label="Screenshot successivo" onClick={() => navigate(1)}><ChevronRight aria-hidden="true" /></Button></> : null}
          <Button type="button" variant="outline" size="icon" aria-label={zoom ? 'Adatta alla finestra' : 'Dimensione originale'} onClick={() => setZoom(value => !value)}>{zoom ? <ZoomOut aria-hidden="true" /> : <ZoomIn aria-hidden="true" />}</Button><Button type="button" variant="outline" size="icon" aria-label="Chiudi screenshot" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></Button>
        </div></header>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading || !loaded ? <ScreenshotSkeleton aspectRatio={aspectRatio} /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- private screenshots bypass caching */}
          {current ? <img key={current} onLoad={() => setLoadedSrc(current)} src={current} alt={`Screenshot ${index + 1} della segnalazione`} className={`${!loaded ? 'hidden' : ''} ${zoom ? 'max-w-none' : 'mx-auto h-full max-w-full object-contain'}`} /> : null}
        </div>
      </div>
    </dialog>
  </>;
}
