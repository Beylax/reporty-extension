'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';

function subscribeToViewport(onChange: () => void) {
  const mobile = window.matchMedia('(width < 768px)');
  mobile.addEventListener('change', onChange);
  return () => mobile.removeEventListener('change', onChange);
}

const isMobileViewport = () => window.matchMedia('(width < 768px)').matches;
const serverViewport = () => false;

export function DashboardSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const mobile = useSyncExternalStore(subscribeToViewport, isMobileViewport, serverViewport);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  return <>
    <aside className="sticky top-0 hidden h-screen min-h-0 border-r bg-sidebar text-sidebar-foreground md:block">{mobile ? null : children}</aside>
    <Dialog.Root open={mobile && open} onOpenChange={setOpen}>
      <header className="flex items-center gap-3 border-b bg-sidebar px-6 py-3 text-sidebar-foreground md:hidden">
        <Dialog.Trigger render={<Button variant="outline" size="icon" aria-label="Apri menu di navigazione" />}><Menu aria-hidden="true" /></Dialog.Trigger>
        <BrandLogo />
      </header>
      {mobile ? <Dialog.Portal keepMounted>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl outline-none transition-transform duration-200 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full motion-reduce:transition-none">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
            <Dialog.Title className="text-sm font-semibold">Navigazione</Dialog.Title>
            <Dialog.Close render={<Button variant="outline" size="icon" aria-label="Chiudi menu di navigazione" />}><X aria-hidden="true" /></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1" onClick={event => {
            if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false);
          }}>{children}</div>
        </Dialog.Popup>
      </Dialog.Portal> : null}
    </Dialog.Root>
  </>;
}
