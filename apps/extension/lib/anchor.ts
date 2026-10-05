import type { Anchor } from '@reporty/shared';

export function elementAnchor(element: Element, x: number, y: number): Anchor {
  let selector = '';
  const testId = element.getAttribute('data-testid');
  if (testId) selector = `[data-testid="${CSS.escape(testId)}"]`;
  if (!selector || document.querySelectorAll(selector).length !== 1) selector = element.id ? `#${CSS.escape(element.id)}` : '';
  if (!selector || document.querySelectorAll(selector).length !== 1) {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && parts.join(' > ').length < 3500) {
      const node: Element = current;
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(sibling => sibling.tagName === node.tagName) : [];
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${Math.max(1, siblings.indexOf(node) + 1)})`);
      current = node.parentElement;
    }
    selector = parts.join(' > ');
  }
  const rect = element.getBoundingClientRect();
  return { kind: 'element', selector, offsetX: Math.max(0, Math.min(1, (x - rect.left) / (rect.width || 1))), offsetY: Math.max(0, Math.min(1, (y - rect.top) / (rect.height || 1))), textExcerpt: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) };
}

export function anchorPosition(anchor: Anchor): { x: number; y: number } | null {
  if (anchor.kind === 'pin') return { x: anchor.documentX - scrollX, y: anchor.documentY - scrollY };
  try {
    const nodes = document.querySelectorAll(anchor.selector);
    if (nodes.length !== 1) return null;
    const node = nodes[0]!;
    if (anchor.textExcerpt && node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) !== anchor.textExcerpt) return null;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { x: rect.left + rect.width * anchor.offsetX, y: rect.top + rect.height * anchor.offsetY };
  } catch { return null; }
}
