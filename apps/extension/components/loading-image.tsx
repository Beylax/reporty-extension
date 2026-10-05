import { useState } from 'react';
import { ScreenshotSkeleton } from '@/components/loading-skeletons';
import { useNotify } from '@/components/ui/toast';

export function LoadingImage({ src, alt, aspectRatio = '16 / 9' }: { src: string; alt: string; aspectRatio?: string }) {
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  const notify = useNotify();
  return <div>{!loaded && !failed ? <ScreenshotSkeleton aspectRatio={aspectRatio} /> : null}<img src={src} alt={alt} className={`rounded-lg border ${!loaded ? 'hidden' : ''}`} onLoad={() => setLoaded(true)} onError={() => { setFailed(true); notify('Screenshot non disponibile. Riaprilo per riprovare.'); }} /></div>;
}
