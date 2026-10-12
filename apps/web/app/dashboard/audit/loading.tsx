import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
export default function AuditLoading() {
  return <main aria-label="Caricamento metriche Supabase" className="mx-auto w-full max-w-7xl space-y-8 px-6 py-10 lg:px-10">
    <Skeleton className="h-8 w-40" />
    <div className="flex items-center justify-between gap-3"><div className="space-y-2"><Skeleton className="h-9 w-64" /><Skeleton className="h-5 w-56" /></div><Skeleton className="h-8 w-28" /></div>
    <Skeleton className="h-4 w-80 max-w-full" />
    <div className="grid gap-5 md:grid-cols-2">{['database','storage','screenshots','api'].map(kind => <Card key={kind}><CardHeader><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-full" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-8 w-44" />{kind === 'database' || kind === 'storage' ? <><Skeleton className="h-2 w-full" /><Skeleton className="h-5 w-32" /></> : kind === 'api' ? <div className="grid grid-cols-2 gap-2">{[0,1,2,3].map(index => <div key={index} className="space-y-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-12" /></div>)}</div> : <Skeleton className="h-4 w-56" />}</CardContent></Card>)}</div>
    <Card><CardHeader><Skeleton className="h-5 w-56" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-8 w-40" /></CardContent></Card>
  </main>;
}
