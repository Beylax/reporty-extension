'use client';
import { Progress as Primitive } from '@base-ui/react/progress';
import { cn } from 'cn';
export function Progress({ value, label, valueText, indicatorClassName }: { value: number; label: string; valueText?: string; indicatorClassName?: string }) {
  return <Primitive.Root value={value} max={100} aria-label={label} aria-valuetext={valueText}>
    <Primitive.Track className="h-2 overflow-hidden rounded-full bg-muted">
      <Primitive.Indicator className={cn('h-full rounded-full bg-primary', indicatorClassName)} style={{ width: `${value}%` }} />
    </Primitive.Track>
  </Primitive.Root>;
}
