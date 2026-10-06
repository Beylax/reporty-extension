'use client';

import { useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover } from '@base-ui/react/popover';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReportFilter({ label, options, selected, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | ShadowRoot | null>(null);
  const summary = selected.length ? options.filter(option => selected.includes(option.value)).map(option => option.label).join(', ') : 'Tutti';
  return <Popover.Root onOpenChange={open => { if(open && trigger.current) setContainer(trigger.current.closest('dialog') ?? (trigger.current.getRootNode() instanceof ShadowRoot ? trigger.current.getRootNode() as ShadowRoot : document.body)); }}>
    <Popover.Trigger ref={trigger} render={<Button variant="outline" className="max-w-full" />} aria-label={`Filtra ${label.toLowerCase()}: ${summary}`}>
      <span className="max-w-52 truncate">{label}</span><ChevronDown aria-hidden="true" className="size-4" />
    </Popover.Trigger>
    <Popover.Portal container={container}><Popover.Positioner sideOffset={8} className="pointer-events-auto z-30"><Popover.Popup className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
      <fieldset aria-label={label}>
        <div className="max-h-64 space-y-1 overflow-y-auto">{options.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm hover:bg-accent">
          <Checkbox checked={selected.includes(option.value)} onCheckedChange={checked => onChange(checked ? [...selected, option.value] : selected.filter(value => value !== option.value))} />
          <span className="break-all">{option.label}</span>
        </label>)}{!options.length ? <p className="p-2 text-sm text-muted-foreground">Nessuna opzione disponibile.</p> : null}</div>
      </fieldset>
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
