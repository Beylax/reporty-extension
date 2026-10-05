'use client';
import { useState } from 'react';
import { ScreenshotSkeleton } from '@/components/page-skeletons';
import { useToastManager } from '@/components/ui/toast';

export function LoadingImage({ src, alt, aspectRatio = '16 / 9' }: { src: string; alt: string; aspectRatio?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const toast = useToastManager();
  return <div className="space-y-2">{!loaded && !failed ? <ScreenshotSkeleton aspectRatio={aspectRatio} /> : null}
    {/* eslint-disable-next-line @next/next/no-img-element -- private signed images bypass caching */}
    <img src={src} alt={alt} className={`rounded-lg border ${!loaded ? 'hidden' : ''}`} onLoad={() => setLoaded(true)} onError={() => { setFailed(true); toast.add({ title: 'Screenshot non disponibile', description: 'Riapri lo screenshot per riprovare.', type: 'error' }); }} />
  </div>;
}
