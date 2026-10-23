/** Same-origin GETs omit Origin; Fetch Metadata identifies the browser's request origin. */
export function widgetConfigOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (origin !== null) return origin;
  if (request.method === 'GET' && request.headers.get('sec-fetch-site') === 'same-origin') {
    return new URL(request.url).origin;
  }
  return '';
}

// Only the literal localhost hostname is an exception to the environment origin.
export function widgetOriginAllowed(environmentOrigin: string, requestOrigin: string): boolean {
  return requestOrigin === environmentOrigin || /^https?:\/\/localhost(:[0-9]{1,5})?$/.test(requestOrigin);
}
