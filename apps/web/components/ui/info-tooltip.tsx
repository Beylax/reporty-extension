'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import { Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  return (
    <Tooltip.Provider delay={150}>
      <Tooltip.Root open={open} onOpenChange={setOpen} triggerId={triggerId}>
        <Tooltip.Trigger id={triggerId} closeOnClick={false} onClick={() => setOpen(true)} type="button" aria-label={label} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Info className="size-4" aria-hidden="true" />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6} className="z-50">
            <Tooltip.Popup className="max-w-xs rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
              {children}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
