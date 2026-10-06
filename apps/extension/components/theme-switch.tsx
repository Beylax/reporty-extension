import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
const key = 'reporty-theme';
export function ThemeSwitch({ host }: { host?: HTMLElement }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let disposed = false;
    const apply = (value?: unknown) => {
      if (disposed) return;
      const next = value === 'dark' || (value !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      setDark(next);
      if (host) { host.dataset.theme = next ? 'dark' : 'light'; host.style.setProperty('color-scheme', next ? 'dark' : 'light', 'important'); }
      else { document.documentElement.classList.toggle('dark', next); document.documentElement.style.colorScheme = next ? 'dark' : 'light'; }
    };
    if (typeof browser !== 'undefined' && browser.storage) {
      void browser.storage.local.get(key).then(value => apply(value[key]));
      const listener = (changes: Record<string, {newValue?: unknown}>, area: string) => { if (area === 'local' && changes[key]) apply(changes[key].newValue); };
      browser.storage.onChanged.addListener(listener);
      return () => { disposed = true; browser.storage.onChanged.removeListener(listener); };
    }
    try { apply(localStorage.getItem(key)); } catch { apply(); }
    return () => { disposed = true; };
  }, [host]);
  return <Button variant="outline" size="icon" aria-label={dark ? 'Attiva tema chiaro' : 'Attiva tema scuro'} title={dark ? 'Tema chiaro' : 'Tema scuro'} onClick={() => {
    const next = !dark;
    setDark(next);
    if (host) { host.dataset.theme = next ? 'dark' : 'light'; host.style.setProperty('color-scheme', next ? 'dark' : 'light', 'important'); }
    else { document.documentElement.classList.toggle('dark', next); document.documentElement.style.colorScheme = next ? 'dark' : 'light'; }
    if (typeof browser !== 'undefined' && browser.storage) void browser.storage.local.set({[key]: next ? 'dark' : 'light'});
    else try { localStorage.setItem(key, next ? 'dark' : 'light'); } catch { /* Keep theme in memory. */ }
  }}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>;
}
