'use client';
import { useState } from 'react';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useToastManager } from '@/components/ui/toast';

export function LoadingImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const toast = useToastManager();
  return <div className="space-y-2">{!loaded && !failed ? <LoadingSkeleton /> : null}
    {/* eslint-disable-next-line @next/next/no-img-element -- private signed images bypass caching */}
    <img src={src} alt={alt} className={`rounded-lg border ${!loaded ? 'hidden' : ''}`} onLoad={() => setLoaded(true)} onError={() => { setFailed(true); toast.add({ title: 'Screenshot non disponibile', description: 'Riapri lo screenshot per riprovare.', type: 'error' }); }} />
  </div>;
}
