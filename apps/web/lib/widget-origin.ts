// Only the literal localhost hostname is an exception to the environment origin.
export function widgetOriginAllowed(environmentOrigin: string, requestOrigin: string): boolean {
  return requestOrigin === environmentOrigin || /^https?:\/\/localhost(:[0-9]{1,5})?$/.test(requestOrigin);
}
