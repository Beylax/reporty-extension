'use client';
import { Accordion as Primitive } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
export function AccordionSection({ title, children }: { title: string; children: ReactNode }) {
  return <Primitive.Root><Primitive.Item className="rounded-xl border"><Primitive.Header><Primitive.Trigger className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring [&[data-panel-open]>svg]:rotate-180">{title}<ChevronDown className="size-4 shrink-0 transition-transform motion-reduce:transition-none" /></Primitive.Trigger></Primitive.Header><Primitive.Panel className="h-[var(--accordion-panel-height)] overflow-hidden transition-[height] duration-200 data-[starting-style]:h-0 data-[ending-style]:h-0 motion-reduce:transition-none"><div className="space-y-5 border-t p-4">{children}</div></Primitive.Panel></Primitive.Item></Primitive.Root>;
}
