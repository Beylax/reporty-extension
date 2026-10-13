'use client';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { useSyncExternalStore } from 'react';
function subscribe(callback: () => void) {
  window.addEventListener('reporty-theme', callback);
  return () => window.removeEventListener('reporty-theme', callback);
}
export function ThemeSwitch() {
  const dark = useSyncExternalStore(subscribe, () => document.documentElement.classList.contains('dark'), () => false);
  return <Button variant="outline" size="icon" aria-label={dark ? 'Attiva tema chiaro' : 'Attiva tema scuro'} title={dark ? 'Tema chiaro' : 'Tema scuro'} onClick={() => {
    window.dispatchEvent(new CustomEvent('reporty-theme-choice', { detail: dark ? 'light' : 'dark' }));
  }}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>;
}
