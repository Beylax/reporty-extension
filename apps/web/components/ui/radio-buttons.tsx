'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { buttonVariants } from './button';
import { cn } from 'cn';

export function RadioButtons({ id, label, value, options, onValueChange, disabled = false, compact = false }: {
  id: string; label: string; value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void; disabled?: boolean; compact?: boolean;
}) {
  return <RadioGroup id={id} aria-label={label} value={value} disabled={disabled} onValueChange={onValueChange} className="flex w-full max-w-full rounded-lg">
    {options.map((option, index) => <Radio.Root key={option.value} value={option.value} className={cn(buttonVariants({ variant: 'outline' }), `${value === option.value ? 'bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20' : ''} ${compact ? '' : 'h-auto min-h-10 py-2'} relative min-w-0 flex-1 rounded-none ${index === 0 ? 'rounded-l-lg ml-0' : '-ml-px'} ${index === options.length - 1 ? 'rounded-r-lg' : ''} border border-border focus-visible:z-20 focus-visible:ring-inset`)}>
      {value === option.value ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border border-primary" /> : null}
      {option.label}
    </Radio.Root>)}
  </RadioGroup>;
}
