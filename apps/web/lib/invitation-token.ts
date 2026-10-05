import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

export function newToken() { return randomBytes(32).toString('hex'); }
export function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function validToken(value: string) { return /^[0-9a-f]{64}$/.test(value); }
