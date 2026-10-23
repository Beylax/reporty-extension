'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { oauthReturnPath } from '@/lib/mcp/return-path';
import { appOrigin } from '@/lib/supabase/config';

export async function signInWithGoogle(formData: FormData) {
  const next = oauthReturnPath(formData.get('next'));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: `${appOrigin()}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}` },
  });
  if (error || !data.url) redirect(`/login?message=google-error${next ? `&next=${encodeURIComponent(next)}` : ''}`);
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) redirect('/dashboard?message=signout-error');
  redirect('/login');
}
