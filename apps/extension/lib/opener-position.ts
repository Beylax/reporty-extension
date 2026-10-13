import type { Site } from '@/lib/session';

export const openerPositionOptions = [
  { value: 'bottom_right', label: 'In basso a destra' },
  { value: 'bottom_left', label: 'In basso a sinistra' },
  { value: 'top_right', label: 'In alto a destra' },
  { value: 'top_left', label: 'In alto a sinistra' },
] satisfies { value: Site['position']; label: string }[];

export function isOpenerPosition(value: unknown): value is Site['position'] {
  return openerPositionOptions.some(option => option.value === value);
}
