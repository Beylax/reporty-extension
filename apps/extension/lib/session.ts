export const apiOrigin = new URL(import.meta.env.WXT_API_URL ?? 'http://localhost:3000').origin;

export type Environment = { id: string; projectId: string; projectName: string; name: string; origin: string };
export type Context = { kind: 'member' | 'guest'; displayName: string | null; environments: Environment[] };
export type Site = { environmentId: string; position: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left' };
export type Sites = Record<string, Site>;

export function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const guestSessionKey = (origin: string) => `guestSession:${origin}`;

export async function getSessionToken(origin?: string): Promise<string | null> {
  if (origin) {
    const key = guestSessionKey(origin);
    const stored = await browser.storage.local.get(key);
    if (typeof stored[key] === 'string') return stored[key];
  }
  const { sessionToken } = await browser.storage.local.get('sessionToken');
  return typeof sessionToken === 'string' ? sessionToken : null;
}

export async function getContext(origin?: string, credential?: string): Promise<Context | null> {
  const sessionToken = credential ?? await getSessionToken(origin);
  if (!sessionToken) return null;
  const response = await fetch(`${apiOrigin}/api/extension/context`, {
    headers: { Authorization: `Bearer ${sessionToken}` }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) {
    // A revoked site must not disconnect another site or a newer connection.
    const key = origin ? guestSessionKey(origin) : 'sessionToken';
    const stored = await browser.storage.local.get(key);
    if (stored[key] === sessionToken) await browser.storage.local.remove(key);
    return null;
  }
  if (!response.ok) throw new Error('Servizio non disponibile. Riprova.');
  const context: Context = await response.json();
  if (origin && context.kind === 'guest' && !context.environments.some(item => item.origin === origin)) return null;
  return context;
}

export function pattern(origin: string) {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}
