'use client';

import { useEffect, useRef } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cn } from 'cn';

export function RadioButtons({ id, label, value, options, onValueChange, disabled = false, compact = false }: {
  id: string; label: string; value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void; disabled?: boolean; compact?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLSpanElement>(null);
  const tip = compact ? 7 : 10;

  useEffect(() => {
    const container = scroller.current;
    const segment = selected.current;
    if (!container || !segment) return;
    function revealSelected() {
      if (!container || !segment) return;
      const left = segment.offsetLeft;
      const right = left + segment.offsetWidth;
      if (left < container.scrollLeft) container.scrollLeft = left;
      else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth;
    }
    revealSelected();
    const observer = new ResizeObserver(revealSelected);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value]);

  return <div ref={scroller} className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain py-1">
    <RadioGroup id={id} aria-label={label} value={value} disabled={disabled} onValueChange={onValueChange} className="relative flex w-full min-w-max flex-nowrap">
      {options.map((option, index) => {
        const first = index === 0;
        const last = index === options.length - 1;
        const checked = value === option.value;
        const clipPath = `polygon(0 0, ${last ? '100% 0, 100% 100%' : `calc(100% - ${tip}px) 0, 100% 50%, calc(100% - ${tip}px) 100%`}, 0 100%${first ? '' : `, ${tip}px 50%`})`;
        return <Radio.Root key={option.value} ref={checked ? selected : undefined} value={option.value}
          style={{ clipPath, marginLeft: first ? 0 : -tip, paddingLeft: first ? (compact ? 12 : 16) : tip + (compact ? 10 : 14), paddingRight: last ? (compact ? 12 : 16) : tip + (compact ? 10 : 14) }}
          className={cn('group/segment relative inline-flex shrink-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap border-0 font-medium outline-none transition-colors focus-visible:z-30 focus-visible:bg-ring hover:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 motion-reduce:transition-none', compact ? 'h-8 text-xs' : 'min-h-10 py-2 text-sm', first && 'rounded-l-full', last && 'rounded-r-full', checked ? 'z-10 bg-primary text-primary' : 'bg-border text-foreground hover:bg-primary/40')}>
          <span aria-hidden="true" style={{ clipPath }} className={cn('pointer-events-none absolute inset-px rounded-[inherit] transition-colors motion-reduce:transition-none', checked ? 'bg-[color-mix(in_oklab,var(--primary)_10%,var(--background))] group-hover/segment:bg-[color-mix(in_oklab,var(--primary)_15%,var(--background))]' : 'bg-background group-hover/segment:bg-muted')} />
          <span className="relative group-focus-visible/segment:underline group-focus-visible/segment:underline-offset-4">{option.label}</span>
        </Radio.Root>;
      })}
    </RadioGroup>
  </div>;
}
