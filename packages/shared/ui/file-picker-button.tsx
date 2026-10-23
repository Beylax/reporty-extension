'use client';

import { useId, useRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from './button';

export function FilePickerButton({ children, description, disabled, accept, onSelect }: {
  children: ReactNode; description: string; disabled?: boolean; accept?: string;
  onSelect: (files: File[]) => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  return <div className="grid min-w-0 gap-2">
    <input ref={input} type="file" hidden multiple accept={accept} disabled={disabled} onChange={event => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length) void onSelect(files);
    }} />
    <Button type="button" variant="outline" className="w-full" disabled={disabled} aria-describedby={descriptionId} onClick={() => input.current?.click()}><Plus className="size-4" aria-hidden="true" />{children}</Button>
    <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p>
  </div>;
}
