'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { Button } from './button';

/** Keep tooltips inside native dialogs and extension/widget shadow roots. */
export function TooltipButton({ label, children, ...props }: ComponentProps<typeof Button> & { label: string }) {
  const trigger = useRef<HTMLElement>(null);
  const setTrigger = useCallback((element: HTMLElement | null) => { trigger.current = element; }, []);
  const [container, setContainer] = useState<HTMLElement | ShadowRoot | null>(null);
  return <Tooltip.Provider delay={150}>
    <Tooltip.Root disabled={props.disabled} onOpenChange={open => {
      if (!open || !trigger.current) return;
      const root = trigger.current.getRootNode();
      setContainer(trigger.current.closest('dialog') ?? (root instanceof ShadowRoot ? root : document.body));
    }}>
      <Tooltip.Trigger ref={setTrigger} render={<Button variant="outline" size="icon" {...props} aria-label={label} />}>{children}</Tooltip.Trigger>
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner side="bottom" sideOffset={6} className="pointer-events-none z-[100]">
          <Tooltip.Popup role="tooltip" className="max-w-xs rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>;
}
