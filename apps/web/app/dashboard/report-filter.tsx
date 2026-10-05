'use client';

import { Popover } from '@base-ui/react/popover';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReportFilter({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const summary = selected.length ? options.filter(option => selected.includes(option.value)).map(option => option.label).join(', ') : 'Tutti';
  return <Popover.Root>
    <Popover.Trigger render={<Button variant="outline" className="max-w-full" />} aria-label={`Filtra ${label.toLowerCase()}: ${summary}`}>
      <span className="max-w-52 truncate">{label}: {summary}</span><ChevronDown aria-hidden="true" className="size-4" />
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner sideOffset={8} className="z-30"><Popover.Popup className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
      <fieldset><legend className="mb-2 text-sm font-semibold">{label}</legend>
        <Button size="sm" variant="ghost" className="mb-2 w-full justify-start" onClick={() => onChange([])}>Tutti · rimuovi filtro</Button>
        <div className="max-h-64 space-y-1 overflow-y-auto">{options.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm hover:bg-accent">
          <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={selected.includes(option.value)} onChange={event => onChange(event.target.checked ? [...selected, option.value] : selected.filter(value => value !== option.value))} />
          <span className="break-all">{option.label}</span>
        </label>)}{!options.length ? <p className="p-2 text-sm text-muted-foreground">Nessuna opzione disponibile.</p> : null}</div>
      </fieldset>
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
