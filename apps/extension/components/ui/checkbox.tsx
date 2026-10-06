'use client';
import { Checkbox as Primitive } from '@base-ui/react/checkbox';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
export function Checkbox(props: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root {...props} data-slot="checkbox" className="inline-flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground"><Primitive.Indicator><Check className="size-3" /></Primitive.Indicator></Primitive.Root>;
}
