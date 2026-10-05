'use client';

import { Dialog as Primitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { Button } from './button';

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  return <Primitive.Root open={open} onOpenChange={onOpenChange}><Primitive.Portal><Primitive.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" /><Primitive.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-6 shadow-xl outline-none"><Primitive.Close render={<Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Chiudi dettaglio" />}><X /></Primitive.Close>{children}</Primitive.Popup></Primitive.Portal></Primitive.Root>;
}
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
