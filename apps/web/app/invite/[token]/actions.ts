'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { validToken } from '@/lib/invitation-token';

export async function switchInviteAccount(form: FormData) {
  const token = String(form.get('token') ?? '');
  if (!validToken(token)) redirect('/login');
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect(`/invite/${token}?message=signout-error`);
  (await cookies()).set('reporty_pending_invite', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 3600 });
  redirect('/login');
}

export async function acceptInvitation(form: FormData) {
  const token = String(form.get('token') ?? '');
  if (!validToken(token)) redirect('/login');
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims || data.claims.is_anonymous) {
    const store = await cookies();
    store.set('reporty_pending_invite', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 3600 });
    redirect('/login');
  }
  const { data: projectId, error } = await supabase.rpc('accept_member_invite', { secret: token });
  if (error || !projectId) redirect(`/invite/${token}?message=invalid`);
  (await cookies()).delete('reporty_pending_invite');
  revalidatePath('/dashboard');
  redirect(`/dashboard/projects/${projectId}`);
}
