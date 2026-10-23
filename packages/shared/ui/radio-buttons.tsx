'use client';

import { useEffect, useRef, useState } from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { cn } from 'cn';

function SegmentShape({ first, last, tip, checked }: { first: boolean; last: boolean; tip: number; checked: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = svg.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Layout dimensions stay accurate while dialogs animate with scale().
      const box = entry.borderBoxSize[0];
      const width = box?.inlineSize ?? element.offsetWidth;
      const height = box?.blockSize ?? element.offsetHeight;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const edge = 0.5;
  const radius = Math.max(0, height / 2 - edge);
  const left = first ? height / 2 : edge;
  const right = last ? width - height / 2 : width - tip - edge;
  const path = `M ${left} ${edge} H ${right} ${last
    ? `A ${radius} ${radius} 0 0 1 ${right} ${height - edge}`
    : `L ${width - edge} ${height / 2} L ${right} ${height - edge}`}
    H ${left} ${first
      ? `A ${radius} ${radius} 0 0 1 ${left} ${edge}`
      : `L ${tip + edge} ${height / 2}`} Z`;

  return <svg ref={svg} aria-hidden="true" viewBox={width && height ? `0 0 ${width} ${height}` : undefined} preserveAspectRatio="none" className="pointer-events-auto absolute inset-0 size-full overflow-visible group-data-[disabled]/segment:pointer-events-none">
    {width && height ? <>
      <path d={path} className={cn('fill-background', !checked && 'group-hover/segment:fill-muted')} />
      {checked ? <path d={path} className="fill-primary/10 group-hover/segment:fill-primary/15" /> : null}
      <path d={path} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" className={cn('transition-colors group-hover/segment:stroke-primary group-focus-visible/segment:stroke-primary motion-reduce:transition-none', checked ? 'stroke-primary' : 'stroke-border')} />
    </> : null}
  </svg>;
}

export function RadioButtons({ id, label, value, options, onValueChange, disabled = false, compact = false, variant = 'chevron' }: {
  id: string; label: string; value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void; disabled?: boolean; compact?: boolean; variant?: 'chevron' | 'standard';
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLSpanElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const tip = compact ? 7 : 10;

  useEffect(() => {
    if (variant !== 'standard') return;
    const segment = selected.current;
    const group = segment?.parentElement;
    if (!segment || !group) return;
    function positionIndicator() {
      if (!segment) return;
      const left = segment.offsetLeft;
      const width = segment.offsetWidth;
      setIndicator(previous => previous?.left === left && previous.width === width ? previous : { left, width });
    }
    positionIndicator();
    const observer = new ResizeObserver(positionIndicator);
    observer.observe(group);
    observer.observe(segment);
    return () => observer.disconnect();
  }, [value, variant, compact, options.length]);

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
    <RadioGroup id={id} aria-label={label} value={value} disabled={disabled} onValueChange={onValueChange} className={cn('relative isolate flex w-full min-w-max flex-nowrap', variant === 'standard' && 'rounded-full bg-muted p-1')}>
      {variant === 'standard' && indicator ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-clip rounded-full">
        <span
          className={cn('absolute inset-y-1 left-0 rounded-full bg-background shadow-sm transition-[transform,width] duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none', disabled && 'opacity-50')}
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }} />
      </span> : null}
      {options.map((option, index) => {
        const first = index === 0;
        const last = index === options.length - 1;
        const checked = value === option.value;
        if (variant === 'standard') return <Radio.Root key={option.value} ref={checked ? selected : undefined} value={option.value}
          className={cn('relative z-10 inline-flex shrink-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 bg-transparent font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 motion-reduce:transition-none', compact ? 'h-8 px-3 text-xs' : 'min-h-10 px-4 py-2 text-sm', checked ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>
          {option.label}
        </Radio.Root>;
        return <Radio.Root key={option.value} ref={checked ? selected : undefined} value={option.value}
          style={{ marginLeft: first ? 0 : -(tip + 1), paddingLeft: first ? (compact ? 12 : 16) : tip + (compact ? 10 : 14), paddingRight: last ? (compact ? 12 : 16) : tip + (compact ? 10 : 14) }}
          className={cn('group/segment pointer-events-none relative inline-flex shrink-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap border-0 font-medium outline-none transition-colors focus-visible:z-30 hover:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 motion-reduce:transition-none', compact ? 'h-8 text-xs' : 'min-h-10 py-2 text-sm', first && 'rounded-l-full', last && 'rounded-r-full', checked ? 'z-10 text-primary' : 'text-foreground')}>
          <SegmentShape first={first} last={last} tip={tip} checked={checked} />
          <span className="pointer-events-none relative group-focus-visible/segment:underline group-focus-visible/segment:underline-offset-4">{option.label}</span>
        </Radio.Root>;
      })}
    </RadioGroup>
  </div>;
}
