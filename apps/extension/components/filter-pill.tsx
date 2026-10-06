import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function FilterPill({ label, onRemove, children }: { label: string; onRemove: () => void; children?: ReactNode }) {
  return <Button type="button" variant="outline" size="sm" onClick={onRemove} aria-label={`Rimuovi filtro ${label}`} title={label} className="h-7 max-w-full gap-1.5 rounded-full border-current bg-primary/5 px-2.5 text-xs font-medium text-primary shadow-none hover:bg-primary/10">
    {children}<span className="truncate">{label}</span><X className="size-3 shrink-0" aria-hidden="true" />
  </Button>;
}
