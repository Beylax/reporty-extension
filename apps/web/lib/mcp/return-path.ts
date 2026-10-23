/** Only the consent route may be resumed after Google login; never an external URL. */
export function oauthReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 250) return null;
  const match = /^\/oauth\/consent\?authorization_id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value);
  return match ? `/oauth/consent?authorization_id=${match[1]}` : null;
}
