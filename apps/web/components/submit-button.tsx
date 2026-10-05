'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export function SubmitButton({ children, pendingLabel = 'Salvataggio…' }: {
  children: React.ReactNode; pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? pendingLabel : children}</Button>;
}
