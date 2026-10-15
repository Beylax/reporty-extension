import { getPageContext } from '@reporty/shared';

export type PlaygroundEnvironment = { id: string; name: string; origin: string; publicKey: string; enabled: boolean };
export type Viewport = { width: number; height: number };
export const viewportPresets = [
  { label: 'Desktop', width: 1440, height: 900 },
  { label: 'Tablet', width: 768, height: 1024 },
  { label: 'Mobile', width: 390, height: 844 },
] as const;

export function playgroundUrl(input: string, origin: string) {
  const url = new URL(input, `${origin}/`);
  if (url.username || url.password || getPageContext(url.href).origin !== origin) throw new Error('Inserisci un URL dell’ambiente selezionato, con lo stesso protocollo e porta.');
  return url.href;
}

export function isViewportDimension(value: number) {
  return Number.isInteger(value) && value >= 240 && value <= 3840;
}

export function isPlaygroundMessage(event: MessageEvent, frame: HTMLIFrameElement, origin: string, nonce: string) {
  return event.source === frame.contentWindow && event.origin === origin && event.data !== null && typeof event.data === 'object' && event.data.nonce === nonce;
}
