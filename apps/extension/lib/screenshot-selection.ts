export type ScreenshotShape = 'rectangle' | 'screen' | 'circle' | 'freehand';
export type SelectionPoint = { x: number; y: number };
export type ScreenshotImage = { src: string; width: number; height: number };
export type ScreenshotSelection = { path: string; x: number; y: number; width: number; height: number };

export function screenshotSelection(shape: ScreenshotShape, points: SelectionPoint[], width: number, height: number): ScreenshotSelection | null {
  if (shape === 'screen') return { path: `M0 0H${width}V${height}H0Z`, x: 0, y: 0, width, height };
  const clamped = points.map(point => ({ x: Math.max(0, Math.min(width, point.x)), y: Math.max(0, Math.min(height, point.y)) }));
  const start = clamped[0], end = clamped.at(-1);
  if (!start || !end || clamped.length < 2) return null;
  let x = Math.min(...clamped.map(point => point.x)), y = Math.min(...clamped.map(point => point.y));
  let w = Math.max(...clamped.map(point => point.x)) - x, h = Math.max(...clamped.map(point => point.y)) - y;
  if (shape === 'circle') {
    w = h = Math.min(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    x = end.x < start.x ? start.x - w : start.x;
    y = end.y < start.y ? start.y - h : start.y;
  }
  if (w < 4 || h < 4 || (shape === 'freehand' && clamped.length < 3)) return null;
  if (shape === 'freehand') {
    const area = clamped.reduce((sum, point, index) => { const next = clamped[(index + 1) % clamped.length]!; return sum + point.x * next.y - next.x * point.y; }, 0);
    if (Math.abs(area) < 32) return null;
  }
  const path = shape === 'freehand' ? `${clamped.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join('')}Z`
    : shape === 'circle' ? `M${x} ${y + h / 2}A${w / 2} ${h / 2} 0 1 0 ${x + w} ${y + h / 2}A${w / 2} ${h / 2} 0 1 0 ${x} ${y + h / 2}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return { path, x, y, width: w, height: h };
}

export function cropScreenshot(image: HTMLImageElement, selection: ScreenshotSelection, viewport: { width: number; height: number }): ScreenshotImage {
  const scaleX = image.naturalWidth / viewport.width, scaleY = image.naturalHeight / viewport.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(selection.width * scaleX));
  canvas.height = Math.max(1, Math.round(selection.height * scaleY));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Acquisizione immagine non disponibile.');
  // JPEG screenshots keep a white background outside circular and freehand crops.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scaleX, scaleY);
  context.translate(-selection.x, -selection.y);
  context.clip(new Path2D(selection.path), 'evenodd');
  context.drawImage(image, 0, 0, viewport.width, viewport.height);
  const src = canvas.toDataURL('image/jpeg', 0.8);
  if ((src.split(',')[1]?.length ?? 0) * 3 / 4 > 2500000) throw new Error('Screenshot troppo grande. Seleziona un’area più piccola.');
  return { src, width: canvas.width, height: canvas.height };
}
