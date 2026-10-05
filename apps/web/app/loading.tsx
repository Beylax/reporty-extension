import { Skeleton } from '@/components/ui/skeleton';
import { DashboardSkeleton } from '@/components/page-skeletons';
export default function Loading() { return <div className="min-h-screen md:grid md:grid-cols-[248px_minmax(0,1fr)]"><aside className="space-y-6 border-r bg-sidebar p-5"><p className="text-xl font-semibold">Reporty</p><Skeleton className="h-8 w-full" /><Skeleton className="h-9 w-full" />{[0,1,2].map(item => <Skeleton key={item} className="h-8 w-full" />)}</aside><DashboardSkeleton /></div>; }
