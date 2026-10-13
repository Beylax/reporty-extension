export type Theme = 'light' | 'dark';
export const themeKey = 'reporty-theme';
export const themeEvent = 'reporty-theme';

type ThemeStorage = 'extension' | 'widget';
const targets = new WeakMap<HTMLElement, { set: (theme: Theme) => void }>();

function preference(value: unknown): Theme | null {
  return value === 'light' || value === 'dark' ? value : null;
}

export function currentTheme(host?: HTMLElement): Theme {
  return (host ? host.dataset.theme === 'dark' : document.documentElement.classList.contains('dark')) ? 'dark' : 'light';
}

/** Initialize independently of the settings panel, before mounting any UI. */
export async function initializeTheme(host?: HTMLElement, storage: ThemeStorage = 'extension'): Promise<() => void> {
  const target = host ?? document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let saved: Theme | null = null;
  let version = 0;
  const apply = () => {
    const theme = saved ?? (media.matches ? 'dark' : 'light');
    if (host) {
      host.dataset.theme = theme;
      host.style.setProperty('color-scheme', theme, 'important');
    } else {
      target.classList.toggle('dark', theme === 'dark');
      target.style.colorScheme = theme;
    }
    target.dispatchEvent(new Event(themeEvent));
  };
  const set = (theme: Theme) => {
    version++;
    saved = theme;
    apply();
    if (storage === 'extension') void browser.storage.local.set({ [themeKey]: theme }).catch(() => { /* Keep preference in memory. */ });
    else try { localStorage.setItem(themeKey, theme); } catch { /* Keep preference in memory. */ }
  };
  const onSystem = () => { if (!saved) apply(); };
  media.addEventListener('change', onSystem);
  let unsubscribe: () => void;
  if (storage === 'extension') {
    const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !changes[themeKey]) return;
      version++;
      saved = preference(changes[themeKey].newValue);
      apply();
    };
    browser.storage.onChanged.addListener(onStorage);
    unsubscribe = () => browser.storage.onChanged.removeListener(onStorage);
    const initialVersion = version;
    try {
      const values = await browser.storage.local.get(themeKey);
      if (version === initialVersion) saved = preference(values[themeKey]);
    } catch { /* Use device theme when storage is unavailable. */ }
  } else {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== themeKey && event.key !== null) return;
      saved = preference(event.newValue);
      apply();
    };
    window.addEventListener('storage', onStorage);
    unsubscribe = () => window.removeEventListener('storage', onStorage);
    try { saved = preference(localStorage.getItem(themeKey)); } catch { /* Use device theme. */ }
  }
  targets.set(target, { set });
  apply();
  return () => {
    media.removeEventListener('change', onSystem);
    unsubscribe();
    targets.delete(target);
  };
}

export function setTheme(theme: Theme, host?: HTMLElement) {
  targets.get(host ?? document.documentElement)?.set(theme);
}
