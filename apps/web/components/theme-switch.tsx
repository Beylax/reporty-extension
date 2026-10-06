'use client';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { useSyncExternalStore } from 'react';
function subscribe(callback: () => void) {
  window.addEventListener('reporty-theme', callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== 'reporty-theme') return;
    const dark = event.newValue === 'dark' || (event.newValue === null && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    callback();
  };
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener('reporty-theme', callback); window.removeEventListener('storage', onStorage); };
}
export function ThemeSwitch() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.classList.contains('dark'), () => false);
  return <Button variant="outline" size="icon" aria-label={dark ? 'Attiva tema chiaro' : 'Attiva tema scuro'} title={dark ? 'Tema chiaro' : 'Tema scuro'} onClick={() => {
    document.documentElement.classList.toggle('dark', !dark);
    document.documentElement.style.colorScheme = dark ? 'light' : 'dark';
    try { localStorage.setItem('reporty-theme', dark ? 'light' : 'dark'); } catch { /* Preference remains in memory. */ }
    window.dispatchEvent(new Event('reporty-theme'));
  }}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>;
}
