'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateName } from '@reporty/shared';
import { createClient } from '@/lib/supabase/server';
import { validToken, newToken, hashToken } from '@/lib/invitation-token';

export async function joinAsGuest(form: FormData) {
  const token = String(form.get('token') ?? '');
  if (!validToken(token)) redirect('/login');
  let name: string | null = null;
  try { if (form.has('name')) name = validateName(String(form.get('name') ?? ''), 80); }
  catch { redirect(`/guest/${token}?message=invalid-name`); }
  const supabase = await createClient();
  const sessionToken = newToken();
  const { error } = await supabase.rpc('start_guest_session', { secret: token, guest_name: name, session_secret: sessionToken });
  if (error) redirect(`/guest/${token}?message=invalid`);
  const { data, error: sessionError } = await supabase.rpc('get_guest_session', { secret: sessionToken });
  const session = data?.[0];
  if (sessionError || !session) redirect(`/guest/${token}?message=invalid`);
  (await cookies()).set(`reporty_guest_${session.project_id}`, sessionToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  redirect(`/guest/workspace/${session.project_id}`);
}

export async function startGuestReview(token: string, guestName: string | null = null): Promise<{ code?: string; environmentId?: string; error?: string }> {
  if (!validToken(token)) return { error: 'Invito non valido.' };
  let name: string | null = null;
  try { if (guestName !== null) name = validateName(guestName, 80); } catch { return { error: 'Inserisci un nome da 1 a 80 caratteri.' }; }
  const supabase = await createClient();
  const { data: preview, error: previewError } = await supabase.rpc('preview_guest_review', { secret: token });
  const review = preview?.[0];
  if (previewError || !review) return { error: 'Invito revocato o ambiente non disponibile.' };
  const secret = newToken();
  const { error } = await supabase.rpc('start_guest_session', { secret: token, guest_name: name, session_secret: secret });
  if (error) return { error: 'Accesso non riuscito.' };
  const code = newToken();
  const { error: handoffError } = await supabase.rpc('create_guest_handoff', { guest_secret: secret, secret_hash: hashToken(code) });
  if (handoffError) return { error: 'Collegamento non disponibile.' };
  (await cookies()).set(`reporty_guest_${review.project_id}`, secret, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return { code, environmentId: review.environment_id };
}
