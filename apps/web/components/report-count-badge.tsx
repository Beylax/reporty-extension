import { Badge } from '@/components/ui/badge';

export function ReportCountBadge({ count, label = 'segnalazioni' }: { count: number; label?: string }) {
  const description = `${count} ${label}`;
  return <Badge variant="secondary" className="min-w-6 tabular-nums" aria-label={description} title={description}>{count}</Badge>;
}
