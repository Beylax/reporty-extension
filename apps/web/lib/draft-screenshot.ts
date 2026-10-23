import { attachmentMime, MAX_REPORT_ATTACHMENT_BYTES } from '@reporty/shared';

export type DraftScreenshot = { id: string; src: string; width: number; height: number; uploaded?: boolean };

export async function readDraftScreenshot(file: File): Promise<DraftScreenshot> {
  if (!file.size || file.size > MAX_REPORT_ATTACHMENT_BYTES) throw new Error('Ogni immagine deve pesare al massimo 5 MB e non essere vuota.');
  const mime = attachmentMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Scegli immagini JPG, PNG o WebP.');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 4096 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossibile preparare lo screenshot.');
    for (let attempt = 0; attempt < 5; attempt++) {
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const src = canvas.toDataURL('image/jpeg', 0.9 - attempt * 0.1);
      if ((src.length - src.indexOf(',') - 1) * 0.75 <= 2500000) return { id: crypto.randomUUID(), src, width: canvas.width, height: canvas.height };
      canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
    }
    throw new Error('Immagine troppo grande: scegli uno screenshot più piccolo.');
  } finally { image.close(); }
}
