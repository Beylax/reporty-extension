'use client';
import { useEffect, useRef } from 'react';
import { useToastManager } from '@/components/ui/toast';

export function FeedbackToast({ message, type = 'error', eventKey }: { message?: string; type?: 'success' | 'error'; eventKey?: unknown }) {
  const toast = useToastManager();
  const shown = useRef<unknown>(undefined);
  useEffect(() => {
    if (!message || shown.current === (eventKey ?? message)) return;
    shown.current = eventKey ?? message;
    toast.add({ title: type === 'success' ? 'Operazione completata' : 'Attenzione', description: message, type });
  }, [message, type, toast, eventKey]);
  return null;
}
