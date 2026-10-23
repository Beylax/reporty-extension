'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { ScreenShareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';
import { hasPlaygroundCapture, stopPlaygroundCapture, subscribePlaygroundCapture } from '@/lib/playground-capture';

export function DashboardCaptureSession() {
  // The dashboard layout outlives playground dialogs and project navigation.
  useEffect(() => () => stopPlaygroundCapture(), []);
  return null;
}

export function StopScreenshotSharing({ compact = false }: { compact?: boolean }) {
  const active = useSyncExternalStore(subscribePlaygroundCapture, hasPlaygroundCapture, () => false);
  const toast = useToastManager();
  if (!active) return null;
  return <Button type="button" variant="outline" size={compact ? 'icon-sm' : 'sm'} className={compact ? 'shrink-0' : 'w-full justify-start gap-2'} aria-label="Termina condivisione screenshot" title="Termina condivisione screenshot" onClick={() => {
    stopPlaygroundCapture();
    toast.add({ title: 'Condivisione screenshot terminata', type: 'success' });
  }}><ScreenShareOff className="size-4" aria-hidden="true" />{compact ? null : 'Termina condivisione'}</Button>;
}
