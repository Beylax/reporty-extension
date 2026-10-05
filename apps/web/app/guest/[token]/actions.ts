'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateName } from '@reporty/shared';
import { createClient } from '@/lib/supabase/server';
import { validToken, newToken } from '@/lib/invitation-token';

export async function joinAsGuest(form: FormData) {
  const token = String(form.get('token') ?? '');
  if (!validToken(token)) redirect('/login');
  let name: string;
  try { name = validateName(String(form.get('name') ?? ''), 80); }
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
