/** Keep Tailwind defaults local: @property registrations inside a shadow root
 * are not consistently available, and document registrations must not be required.
 */
export function shadowStyles(css: string) {
  // Chromium does not consistently load @font-face inside shadow trees.
  // Register bundled fonts on the document so the isolated panel can use them.
  if (typeof FontFace !== 'undefined') {
    for (const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
      const body = match[1] ?? '';
      const source = body.match(/src:\s*(url\([^)]+\))/)?.[1];
      const weight = body.match(/font-weight:\s*([^;]+)/)?.[1] ?? '400';
      if (source && ![...document.fonts].some(font => font.family === 'Plus Jakarta Sans' && font.weight === weight)) {
        const font = new FontFace('Plus Jakarta Sans', source, { weight });
        document.fonts.add(font);
        void font.load().catch(() => { /* System font remains available. */ });
      }
    }
  }
  // Escaped variable names in Tailwind class selectors are literal class names.
  // Rename declarations and var() references, while preserving those selectors.
  const scoped = css.replace(/--[a-zA-Z][\w-]*(?![\w-]|\\)/g, name => `--reporty-${name.slice(2)}`).replaceAll(':root', ':host').replaceAll('.dark{', ':host([data-theme=dark]){');
  const defaults = Array.from(scoped.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]+)\}/g), ([, name, body = '']) => {
    const value = body.match(/initial-value\s*:\s*([^;}]+)/)?.[1]?.trim() ?? 'initial';
    return `${name}:${value};`;
  }).join('');
  // Base layer stays below utility classes, so border-dashed, rings and
  // transforms can still override their initial values on each element.
  return `${scoped}\n@layer base{*,::before,::after{${defaults}}}\n:host{font:14px/1.5 "Plus Jakarta Sans",sans-serif;color:var(--reporty-foreground);color-scheme:light;direction:ltr}:host([data-theme=dark]){color-scheme:dark}`;
}
