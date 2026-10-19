import { Badge } from '@/components/ui/badge';

export function ReportCountBadge({ count, label = 'segnalazioni', className }: { count: number; label?: string; className?: string }) {
  const description = `${count} ${label}`;
  return <Badge variant="secondary" className={`min-w-6 leading-none tabular-nums ${className ?? ''}`} aria-label={description} title={description}>{count}</Badge>;
}
