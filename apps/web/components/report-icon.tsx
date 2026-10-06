import { CircleDot, LoaderCircle, ShieldCheck, CircleCheck, ArrowDown, Minus, ArrowUp } from 'lucide-react';
const icons = { open: CircleDot, in_progress: LoaderCircle, validation: ShieldCheck, resolved: CircleCheck, low: ArrowDown, medium: Minus, high: ArrowUp };
export function ReportIcon({ value }: { value: string }) {
  const Icon = icons[value as keyof typeof icons];
  return Icon ? <Icon aria-hidden="true" className="size-3 shrink-0" /> : null;
}
