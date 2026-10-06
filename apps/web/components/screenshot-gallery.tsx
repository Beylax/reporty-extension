'use client';
import { useRef, useState } from 'react';
import { Expand, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { LoadingImage } from './loading-image';

export function ScreenshotGallery({ src, aspectRatio }: { src: string; aspectRatio: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(false);
  return <>
    <button type="button" className="group relative block w-full cursor-zoom-in rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring" aria-label="Ingrandisci screenshot" onClick={() => { setZoom(false); dialog.current?.showModal(); }}>
      <LoadingImage src={src} alt="Screenshot originale" aspectRatio={aspectRatio} />
      <span className="absolute right-3 bottom-3 rounded-lg bg-background/90 p-2 shadow"><Expand className="size-4" /></span>
    </button>
    <dialog ref={dialog} aria-label="Screenshot ingrandito" className="fixed inset-0 m-auto h-[90dvh] w-[95vw] max-w-none rounded-xl border bg-background p-4 text-foreground shadow-xl backdrop:bg-black/80" onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <header className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Screenshot</h2><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={zoom ? 'Adatta alla finestra' : 'Dimensione originale'} onClick={() => setZoom(value => !value)}>{zoom ? <ZoomOut /> : <ZoomIn />}</Button><Button variant="outline" size="icon" aria-label="Chiudi screenshot" onClick={() => dialog.current?.close()}><X /></Button></div></header>
      <div className="h-[calc(100%_-_3rem)] overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed screenshot displayed at original resolution */}
        <img src={src} alt="Screenshot ingrandito della segnalazione" className={zoom ? 'max-w-none' : 'mx-auto h-full max-w-full object-contain'} />
      </div>
    </dialog>
  </>;
}
