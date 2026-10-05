export const apiOrigin = new URL(import.meta.env.WXT_API_URL ?? 'http://localhost:3000').origin;

export type Environment = { id: string; projectId: string; projectName: string; name: string; origin: string };
export type Context = { kind: 'member' | 'guest'; displayName: string; environments: Environment[] };
export type Site = { environmentId: string; position: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left' };
export type Sites = Record<string, Site>;

export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getContext(): Promise<Context | null> {
  const { sessionToken } = await browser.storage.local.get('sessionToken');
  if (typeof sessionToken !== 'string') return null;
  const response = await fetch(`${apiOrigin}/api/extension/context`, {
    headers: { Authorization: `Bearer ${sessionToken}` }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) { await browser.storage.local.remove('sessionToken'); return null; }
  if (!response.ok) throw new Error('Servizio non disponibile. Riprova.');
  return response.json();
}

export function pattern(origin: string) {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}
