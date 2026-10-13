'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToastManager } from '@/components/ui/toast';
import { verifyWidgetInstallation } from '@/lib/widget-installation';

export function WidgetInstallationCheck({ environmentOrigin, publicKey, enabled, disabled }: { environmentOrigin: string; publicKey: string; enabled: boolean; disabled?: boolean }) {
  const [checking, setChecking] = useState(false);
  const verification = useRef<AbortController | null>(null);
  const toast = useToastManager();
  useEffect(() => () => { verification.current?.abort(); }, []);
  async function verify() {
    if (verification.current || disabled) return;
    const controller = new AbortController();
    verification.current = controller;
    setChecking(true);
    try {
      await verifyWidgetInstallation(environmentOrigin, publicKey, controller.signal);
      toast.add({ title: 'Script rilevato sul sito', description: enabled ? 'Il loader del widget è installato per questo ambiente e viene eseguito dal browser.' : 'Lo script è installato per questo ambiente. Abilita la revisione per mostrare il widget.', type: 'success' });
    } catch (error) {
      if (!controller.signal.aborted) toast.add({ title: 'Verifica non riuscita', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' });
    } finally {
      if (!controller.signal.aborted) setChecking(false);
      verification.current = null;
    }
  }
  return <Button variant="outline" disabled={disabled || checking} aria-busy={checking} aria-label={checking ? 'Verifica installazione in corso' : undefined} onClick={() => void verify()}><ShieldCheck className="size-4" aria-hidden="true" />{checking ? <Skeleton className="h-4 w-32 bg-current opacity-30" /> : 'Verifica installazione'}</Button>;
}
