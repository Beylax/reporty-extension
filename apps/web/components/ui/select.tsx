'use client';
import { Select as Primitive } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
type Option = { value: string; label: string };
export function SelectField({ id, value, options, disabled, onValueChange, label }: { id?: string; value: string; options: Option[]; disabled?: boolean; onValueChange: (value: string) => void; label?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | ShadowRoot | null>(null);
  return <Primitive.Root value={value} items={options} disabled={disabled} onValueChange={value => { if (value !== null) onValueChange(value); }} onOpenChange={open => { if (open && trigger.current) setContainer(trigger.current.closest('dialog') ?? (trigger.current.getRootNode() instanceof ShadowRoot ? trigger.current.getRootNode() as ShadowRoot : document.body)); }}>
    <Primitive.Trigger ref={trigger} id={id} aria-label={label} data-slot="select-trigger" className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"><Primitive.Value /><Primitive.Icon><ChevronDown className="size-4 text-muted-foreground" /></Primitive.Icon></Primitive.Trigger>
    <Primitive.Portal container={container}><Primitive.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-[100] pointer-events-auto"><Primitive.Popup data-slot="select-content" style={{ minWidth: "var(--anchor-width)", maxHeight: "var(--available-height)" }} className="overflow-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"><Primitive.List>{options.map(option => <Primitive.Item key={option.value} value={option.value} className="relative flex cursor-default items-center justify-between gap-3 rounded-md px-3 py-2 outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"><Primitive.ItemText>{option.label}</Primitive.ItemText><Primitive.ItemIndicator><Check className="size-4" /></Primitive.ItemIndicator></Primitive.Item>)}</Primitive.List></Primitive.Popup></Primitive.Positioner></Primitive.Portal>
  </Primitive.Root>;
}
