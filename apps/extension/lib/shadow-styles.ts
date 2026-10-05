/** Keep Tailwind defaults local: @property registrations inside a shadow root
 * are not consistently available, and document registrations must not be required.
 */
export function shadowStyles(css: string) {
  const scoped = css.replace(/--[a-zA-Z][\w-]*/g, name => `--reporty-${name.slice(2)}`).replaceAll(':root', ':host');
  const defaults = Array.from(scoped.matchAll(/@property\s+(--[\w-]+)\s*\{([^}]+)\}/g), ([, name, body = '']) => {
    const value = body.match(/initial-value\s*:\s*([^;}]+)/)?.[1]?.trim() ?? 'initial';
    return `${name}:${value};`;
  }).join('');
  // Base layer stays below utility classes, so border-dashed, rings and
  // transforms can still override their initial values on each element.
  return `${scoped}\n@layer base{*,::before,::after{${defaults}}}\n:host{font:14px/1.5 system-ui,sans-serif;color:#171717;color-scheme:light;direction:ltr}`;
}
