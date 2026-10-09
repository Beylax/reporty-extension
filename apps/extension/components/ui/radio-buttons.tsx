'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { buttonVariants } from './button';
import { cn } from 'cn';

export function RadioButtons({ id, label, value, options, onValueChange, disabled = false }: {
  id: string; label: string; value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void; disabled?: boolean;
}) {
  return <RadioGroup id={id} aria-label={label} value={value} disabled={disabled} onValueChange={onValueChange} className="flex w-fit max-w-full overflow-x-auto rounded-lg border border-border">
    {options.map(option => <Radio.Root key={option.value} value={option.value} className={cn(buttonVariants({ variant: 'outline' }), `${value === option.value ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_var(--primary)] hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20' : ''} relative rounded-none border-0 border-r border-r-border last:border-r-0 focus-visible:z-10 focus-visible:ring-inset`)}>
      {option.label}
    </Radio.Root>)}
  </RadioGroup>;
}
