'use client';
import { Switch as Primitive } from '@base-ui/react/switch';
import type { ComponentProps } from 'react';
export function Switch(props: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root {...props} data-slot="switch" className="inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[checked]:bg-primary disabled:opacity-50"><Primitive.Thumb className="size-5 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-5 motion-reduce:transition-none" /></Primitive.Root>;
}
