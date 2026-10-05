'use client';

import { Toast } from '@base-ui/react/toast';
import { CircleCheck, CircleAlert, X } from 'lucide-react';
import { Button } from './button';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <Toast.Provider timeout={7000} limit={3}>{children}<ToastViewport /></Toast.Provider>;
}

function ToastViewport() {
  const { toasts } = Toast.useToastManager();
  return <Toast.Portal><Toast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw_-_2rem))] flex-col gap-3 outline-none">{toasts.map(toast => <Toast.Root key={toast.id} toast={toast} className="rounded-xl border bg-background p-4 shadow-xl data-limited:hidden">
    <Toast.Content className="flex items-start gap-3">{toast.type === 'success' ? <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-emerald-600" /> : <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />}<div className="min-w-0 flex-1"><Toast.Title className="text-sm font-semibold" /><Toast.Description className="mt-1 text-sm text-muted-foreground" /></div><Toast.Close render={<Button variant="ghost" size="icon-xs" aria-label="Chiudi notifica" />}><X aria-hidden="true" /></Toast.Close></Toast.Content>
  </Toast.Root>)}</Toast.Viewport></Toast.Portal>;
}

export const useToastManager = Toast.useToastManager;
