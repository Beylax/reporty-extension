import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

type Notice = { id: number; message: string; type: 'success' | 'error' };
type Notify = (message: string, type?: Notice['type']) => void;
const Context = createContext<Notify>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);
  const viewport = useRef<HTMLDivElement>(null);
  const notify = useCallback<Notify>((message, type = 'error') => {
    if (!message) return;
    const id = ++nextId.current;
    setNotices(items => [...items.slice(-2), { id, message, type }]);
    const timer = setTimeout(() => { setNotices(items => items.filter(item => item.id !== id)); timers.current.delete(timer); }, 7000);
    timers.current.add(timer);
  }, []);
  useEffect(() => { const active = timers.current; return () => { active.forEach(clearTimeout); active.clear(); }; }, []);
  // Native dialogs occupy the browser top layer; z-index alone cannot cover them.
  // A manual popover keeps notifications above dialogs without moving outside
  // the extension shadow root or taking focus away from the active control.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (notices.length) {
      element.hidePopover();
      element.showPopover();
    } else element.hidePopover();
  }, [notices]);
  return <Context.Provider value={notify}>{children}<div ref={viewport} popover="manual" style={{ display: notices.length ? 'grid' : 'none', margin: 0, padding: 0, border: 0, background: 'transparent', overflow: 'visible', inset: '12px 12px auto auto' }} className="pointer-events-none fixed right-3 top-3 z-[2147483647] grid w-[min(350px,calc(100vw-24px))] gap-2">{notices.map(item => <div key={item.id} role={item.type === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-background p-3 text-sm text-foreground shadow-xl">{item.type === 'success' ? <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />}<p className="min-w-0 flex-1 break-words">{item.message}</p><button type="button" aria-label="Chiudi notifica" className="rounded p-1 focus-visible:outline-2" onClick={() => setNotices(items => items.filter(notice => notice.id !== item.id))}><X className="size-4" aria-hidden="true" /></button></div>)}</div></Context.Provider>;
}
export const useNotify = () => useContext(Context);
