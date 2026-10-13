import { useCallback, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { currentTheme, setTheme, themeEvent } from '@/lib/theme';
import { Button } from './ui/button';

export function ThemeSwitch({ host }: { host?: HTMLElement }) {
  const subscribe = useCallback((callback: () => void) => {
    const target = host ?? document.documentElement;
    target.addEventListener(themeEvent, callback);
    return () => target.removeEventListener(themeEvent, callback);
  }, [host]);
  const dark = useSyncExternalStore(subscribe, () => currentTheme(host) === 'dark', () => false);
  return <Button variant="outline" size="icon" aria-label={dark ? 'Attiva tema chiaro' : 'Attiva tema scuro'} title={dark ? 'Tema chiaro' : 'Tema scuro'} onClick={() => setTheme(dark ? 'light' : 'dark', host)}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button>;
}
