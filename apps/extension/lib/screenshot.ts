import type { ReportContext } from '@reporty/shared';
import { anchorPosition } from './anchor';

// Capture a temporary annotation alongside the page, keeping Reporty's UI hidden.
export async function captureHighlightedScreenshot(host: HTMLElement, context: ReportContext, capture: () => Promise<string>) {
  const point = anchorPosition(context.anchor);
  if (!point) throw new Error('Elemento non trovato: seleziona nuovamente il punto da segnalare.');
  const marker = document.createElement('div');
  marker.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  marker.setAttribute('aria-hidden', 'true');
  const shadow = marker.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = '.highlight{position:fixed;box-sizing:border-box;pointer-events:none;border:3px solid #e11d48;background:rgba(244,63,94,.16);box-shadow:0 0 0 2px white;border-radius:5px}.point{position:fixed;box-sizing:border-box;pointer-events:none;width:28px;height:28px;transform:translate(-50%,-50%);border:3px solid #e11d48;border-radius:50%;background:rgba(244,63,94,.2);box-shadow:0 0 0 2px white}.point:after{content:"";position:absolute;width:6px;height:6px;top:8px;left:8px;border-radius:50%;background:#e11d48}';
  shadow.append(style);
  if (context.anchor.kind === 'element') {
    const element = document.querySelector(context.anchor.selector);
    if (!element) throw new Error('Elemento non trovato.');
    const rect = element.getBoundingClientRect();
    const highlight = document.createElement('div');
    highlight.className = 'highlight';
    highlight.style.left = `${rect.left}px`; highlight.style.top = `${rect.top}px`;
    highlight.style.width = `${rect.width}px`; highlight.style.height = `${rect.height}px`;
    shadow.append(highlight);
  }
  const pin = document.createElement('div');
  pin.className = 'point'; pin.style.left = `${point.x}px`; pin.style.top = `${point.y}px`;
  shadow.append(pin);
  const surfaces = [...new Set([host, document.getElementById('reporty-overlay'), document.getElementById('reporty-widget')])].filter((element): element is HTMLElement => element instanceof HTMLElement);
  const previousDisplay = surfaces.map(element => ({
    element,
    value: element.style.getPropertyValue('display'),
    priority: element.style.getPropertyPriority('display'),
  }));
  try {
    // Hide the entire shadow tree, including fixed buttons and toast portals.
    surfaces.forEach(element => element.style.setProperty('display', 'none', 'important'));
    document.documentElement.append(marker);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return await capture();
  } finally {
    marker.remove();
    previousDisplay.forEach(({ element, value, priority }) => {
      if (value) element.style.setProperty('display', value, priority);
      else element.style.removeProperty('display');
    });
  }
}
