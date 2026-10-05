export function validateName(input: string, maxLength: number): string {
  const value = input.trim();
  if (!value || [...value].length > maxLength) throw new Error('invalid-name');
  return value;
}

/** Accept an explicit origin, never silently discard credentials or page paths. */
export function normalizeOrigin(input: string): string {
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('invalid-origin');
  return url.origin;
}

export function isUuid(input: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
}
