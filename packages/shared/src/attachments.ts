import { z } from 'zod';

export const MAX_ATTACHMENT_BYTES = 2500000;
export const MAX_REPLY_ATTACHMENTS = 5;
export const MAX_REPORT_ATTACHMENT_BYTES = 5000000;
export const MAX_REPORT_ATTACHMENTS = 5;
export const attachmentRequestSchema = z.object({
  environmentId: z.string().uuid(), issueId: z.string().uuid(), id: z.string().uuid(),
  operation: z.enum(['upload', 'begin_upload', 'complete_upload', 'read', 'remove']),
  scope: z.enum(['reply', 'report']).optional(),
  size: z.number().int().positive().max(MAX_REPORT_ATTACHMENT_BYTES).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  mime: z.string().min(1).max(120).optional(),
  content: z.string().max(3333336).optional(),
});
export type AttachmentRequest = Omit<z.infer<typeof attachmentRequestSchema>, 'environmentId' | 'issueId'>;
export type ReplyAttachment = { id: string; name: string; mime: string; size: number };
export type AttachmentResponse = { url?: string; id?: string; completed?: boolean; upload?: { endpoint: string; token: string; bucket: string; path: string; contentType: string } };
export function isPreviewImage(mime: string) { return ['image/jpeg','image/png','image/webp','image/gif'].includes(mime); }

/** MIME comes from bytes, never from the file extension or the browser. */
export function attachmentMime(bytes: Uint8Array): string {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((byte,index) => bytes[index] === byte)) return 'image/png';
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start,start + length));
  if (['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  if (ascii(0,4) === 'RIFF' && ascii(8,4) === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}
