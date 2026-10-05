import { useState } from 'react';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useNotify } from '@/components/ui/toast';

export function LoadingImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  const notify = useNotify();
  return <div>{!loaded && !failed ? <LoadingSkeleton /> : null}<img src={src} alt={alt} className={`rounded-lg border ${!loaded ? 'hidden' : ''}`} onLoad={() => setLoaded(true)} onError={() => { setFailed(true); notify('Screenshot non disponibile. Riaprilo per riprovare.'); }} /></div>;
}
