import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { required } from './config';

function key() {
  const value = Buffer.from(required('GITHUB_COOKIE_KEY'), 'base64');
  if (value.length !== 32) throw new Error('GITHUB_COOKIE_KEY deve contenere 32 byte in base64.');
  return value;
}
export async function setGithubCookie(name: string, value: Record<string, unknown>, seconds = 1800) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(name));
  const data = Buffer.concat([cipher.update(JSON.stringify({ ...value, expires: Date.now() + seconds * 1000 })), cipher.final()]);
  (await cookies()).set(name, Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url'), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: seconds,
  });
}
export async function getGithubCookie(name: string): Promise<Record<string, unknown> | null> {
  const value = (await cookies()).get(name)?.value;
  if (!value) return null;
  try {
    const data = Buffer.from(value, 'base64url'), cipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
    cipher.setAAD(Buffer.from(name)); cipher.setAuthTag(data.subarray(12, 28));
    const result = JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
    return result.expires > Date.now() ? result : null;
  } catch { return null; }
}
