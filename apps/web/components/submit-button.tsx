'use client';

import { useFormStatus } from 'react-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function SubmitButton({ children, pendingLabel = 'Salvataggio…', variant, size }: {
  children: React.ReactNode; pendingLabel?: string; variant?: React.ComponentProps<typeof Button>['variant']; size?: React.ComponentProps<typeof Button>['size'];
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} variant={variant} size={size}>{pending ? <><span className="sr-only">{pendingLabel}</span><Skeleton className="h-4 w-24 bg-current opacity-30" /></> : children}</Button>;
}
