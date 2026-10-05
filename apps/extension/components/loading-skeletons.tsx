import { Skeleton } from '@/components/ui/skeleton';

export function PopupSkeleton() {
  return <div role="status" aria-label="Caricamento sito e account" className="space-y-4"><div className="space-y-4 rounded-xl border bg-card p-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-5/6" /><div className="space-y-2 rounded-lg bg-muted p-3"><Skeleton className="h-4 w-40 bg-background" /><Skeleton className="h-3 w-24 bg-background" /></div><Skeleton className="h-4 w-36" /><Skeleton className="h-9 w-full" /><Skeleton className="h-8 w-full" /></div><div className="space-y-3 rounded-xl border bg-card p-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-48" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div></div>;
}
export function ReportRowsSkeleton() {
  return <div role="status" aria-label="Caricamento segnalazioni" className="grid gap-2">{[0,1,2].map(item => <div key={item} className="space-y-2 rounded-lg border p-3"><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" /><div className="flex gap-2"><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-6 w-28 rounded-full" /></div></div>)}</div>;
}
export function RepliesSkeleton() {
  return <div role="status" aria-label="Caricamento risposte" className="grid gap-2">{[0,1].map(item => <div key={item} className="space-y-2 rounded-lg bg-muted p-3"><Skeleton className="h-3 w-20 bg-background" /><Skeleton className="h-4 w-4/5 bg-background" /></div>)}</div>;
}
export function ScreenshotSkeleton({ aspectRatio = '16 / 9' }: { aspectRatio?: string }) {
  return <div role="status" aria-label="Caricamento screenshot" style={{ aspectRatio }} className="w-full overflow-hidden rounded-lg border"><Skeleton className="h-full w-full rounded-none" /></div>;
}
export function ReviewStartSkeleton() {
  return <div role="status" aria-label="Caricamento ambiente" className="space-y-4"><Skeleton className="mx-auto h-5 w-56" /><Skeleton className="mx-auto h-4 w-64" /><Skeleton className="mx-auto h-8 w-48" /></div>;
}
