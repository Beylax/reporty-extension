'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { ArrowLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export type ReportFilterGroup = {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
};

export function ReportFilterPanel({ filters, disabled }: { filters: ReportFilterGroup[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const group = filters.find(filter => filter.label === active);
  const count = filters.reduce((total, filter) => total + filter.selected.length, 0);

  useEffect(() => { if (open) title.current?.focus(); }, [active, open]);

  return <Dialog.Root open={open} onOpenChange={value => { setOpen(value); if (!value) setActive(null); }}>
    <Dialog.Trigger disabled={disabled} render={<Button variant="outline" className="h-10" />}><SlidersHorizontal aria-hidden="true" />Filtri{count ? <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{count}</span> : null}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
      <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border bg-background pb-[env(safe-area-inset-bottom)] text-foreground shadow-xl outline-none transition-transform duration-200 data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full motion-reduce:transition-none">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
          <Dialog.Title ref={title} tabIndex={-1} className="min-w-0 text-lg font-semibold outline-none">{group?.label ?? 'Filtri'}</Dialog.Title>
          <div className="flex items-center gap-2">
            {group ? <Button variant="outline" size="icon-lg" aria-label="Torna alla lista dei filtri" onClick={() => setActive(null)}><ArrowLeft aria-hidden="true" /></Button> : null}
            <Dialog.Close render={<Button variant="outline" size="icon-lg" aria-label="Chiudi filtri" />}><X aria-hidden="true" /></Dialog.Close>
          </div>
        </header>
        <Dialog.Description className="sr-only">Scegli un filtro e seleziona le opzioni da applicare alle segnalazioni.</Dialog.Description>
        <div className="min-h-0 overflow-y-auto p-4">
          {group ? <fieldset disabled={disabled} aria-label={group.label} className="space-y-1">
            {group.options.map(option => <label key={option.value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg p-3 text-sm hover:bg-muted">
              <Checkbox checked={group.selected.includes(option.value)} onCheckedChange={checked => group.onChange(checked ? [...group.selected, option.value] : group.selected.filter(value => value !== option.value))} />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{option.label}</span>
            </label>)}
            {!group.options.length ? <p className="p-3 text-sm text-muted-foreground">Nessuna opzione disponibile.</p> : null}
          </fieldset> : <nav aria-label="Filtri segnalazioni" className="space-y-1">
            {filters.map(filter => <Button key={filter.label} variant="ghost" disabled={disabled} className="h-auto min-h-12 w-full justify-between gap-3 whitespace-normal px-3 py-3 text-left" onClick={() => setActive(filter.label)}>
              <span className="min-w-0"><span className="block">{filter.label}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{filter.selected.length ? `${filter.selected.length} ${filter.selected.length === 1 ? 'opzione' : 'opzioni'}` : 'Tutti'}</span></span><ChevronRight aria-hidden="true" />
            </Button>)}
          </nav>}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
