export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-muted motion-reduce:animate-none ${className}`} />;
}
export function LoadingSkeleton({ className = '' }: { className?: string }) {
  return <div role="status" aria-label="Caricamento in corso" className={`space-y-3 ${className}`}><span className="sr-only">Caricamento in corso</span><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-24 w-full" /></div>;
}
