import { LoadingSkeleton, Skeleton } from '@/components/ui/skeleton';
export default function Loading() { return <main className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10"><Skeleton className="h-9 w-60" /><LoadingSkeleton /><LoadingSkeleton /><LoadingSkeleton /></main>; }
