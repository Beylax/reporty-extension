type Viewport = { left: number; top: number; width: number; height: number };

/** The collapsed pin extends rightwards and upwards from its anchor. */
export function pinPreviewLayout(x: number, y: number, contentHeight: number, expanded: boolean, viewport: Viewport) {
  const margin = 8;
  const availableWidth = Math.max(0, viewport.width - margin * 2);
  const availableHeight = Math.max(0, viewport.height - margin * 2);
  const width = Math.min(expanded ? 320 : 44, availableWidth);
  const height = Math.min(expanded ? Math.max(44, contentHeight) : 44, availableHeight);
  const right = viewport.left + viewport.width;
  const bottom = viewport.top + viewport.height;
  // Partly visible pins stay reachable; fully offscreen pins stay offscreen.
  const shiftX = x + 44 >= viewport.left && x <= right
    ? Math.max(viewport.left + margin, Math.min(x, right - width - margin)) - x
    : 0;
  const shiftY = y >= viewport.top && y - 44 <= bottom
    ? Math.max(viewport.top + margin, Math.min(y - height, bottom - height - margin)) - (y - height)
    : 0;
  return { width, height, shiftX, shiftY, previewWidth: Math.max(0, Math.min(320, availableWidth) - 4) };
}
