/** The environment is resolved separately from an explicitly configured origin. */
export function getPageContext(input: string) {
  const url = new URL(input);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS pages are supported');
  }
  // Hash routers use #/ or #!/. Ordinary fragment anchors do not identify pages.
  const route = url.hash.startsWith('#/')
    ? url.hash.slice(1)
    : url.hash.startsWith('#!/') ? url.hash.slice(2) : null;
  const pagePath = route === null
    ? url.pathname
    : `${url.pathname}#${route.split('?')[0]}`;
  return { origin: url.origin, pagePath, url: url.href };
}
