'use client';

import { useSyncExternalStore } from 'react';

const query = '(width < 768px)';
function subscribe(onChange: () => void) {
  const viewport = window.matchMedia(query);
  viewport.addEventListener('change', onChange);
  return () => viewport.removeEventListener('change', onChange);
}
const getSnapshot = () => window.matchMedia(query).matches;
const getServerSnapshot = () => false;

export function useMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
