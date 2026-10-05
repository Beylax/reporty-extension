'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/supabase/config';

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: `${appOrigin()}/auth/callback` },
  });
  if (error || !data.url) redirect('/login?message=google-error');
  redirect(data.url);
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect('/login?message=invalid-email');
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email, options: { emailRedirectTo: `${appOrigin()}/auth/callback` },
  });
  redirect(error ? '/login?message=email-error' : '/login?message=email-sent');
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect('/dashboard?message=signout-error');
  redirect('/login');
}
