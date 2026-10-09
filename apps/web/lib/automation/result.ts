import { z } from 'zod';

// Artifacts are untrusted model output. Only regular UTF-8 source files are published.
export const resultSchema = z.object({
  summary: z.string().trim().min(1).max(12000),
  tests: z.string().trim().min(1).max(12000),
  files: z.array(z.object({
    path: z.string().min(1).max(500).refine(path => !path.startsWith('/') && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..') && !path.split('/').some(part => part.toLowerCase() === '.git' || /^\.env(?:\.|$)/i.test(part)) && !path.toLowerCase().startsWith('.github/workflows/'), 'Percorso non consentito'),
    content: z.string().max(500000).refine(content => !content.includes('\u0000'), 'File binario non consentito').nullable(),
    executable: z.boolean().default(false),
  })).min(1).max(60),
}).superRefine((result, context) => {
  if (new Set(result.files.map(file => file.path)).size !== result.files.length) context.addIssue({ code: 'custom', message: 'Percorsi duplicati' });
  if (result.files.reduce((size, file) => size + (file.content?.length ?? 0), 0) > 2000000) context.addIssue({ code: 'custom', message: 'Modifiche troppo grandi' });
});
export type AgentResult = z.infer<typeof resultSchema>;
