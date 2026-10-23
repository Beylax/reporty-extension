/** Supabase authorization IDs are opaque URL-safe strings, not database UUIDs. */
export function isOAuthAuthorizationId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

/** Only the consent route may be resumed after Google login; never an external URL. */
export function oauthReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  const prefix = '/oauth/consent?authorization_id=';
  if (!value.startsWith(prefix)) return null;
  const authorizationId = value.slice(prefix.length);
  return isOAuthAuthorizationId(authorizationId) ? `${prefix}${authorizationId}` : null;
}
