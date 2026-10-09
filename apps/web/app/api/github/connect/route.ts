import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { appOrigin } from '@/lib/supabase/config';
import { required } from '@/lib/automation/config';
import { setGithubCookie } from '@/lib/automation/cookies';

export async function GET(request: Request) {
  const { userId } = await requireUser();
  const requested = new URL(request.url).searchParams.get('returnTo') ?? '/dashboard';
  const returnTo = /^\/dashboard(?:\/projects\/[0-9a-f-]{36}|\/new)?$/.test(requested) ? requested : '/dashboard';
  try {
    const state = randomBytes(32).toString('hex');
    await setGithubCookie('reporty_github_oauth', { state, userId, returnTo }, 600);
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', required('GITHUB_APP_CLIENT_ID'));
    url.searchParams.set('redirect_uri', `${appOrigin()}/api/github/callback`);
    url.searchParams.set('state', state);
    return NextResponse.redirect(url);
  } catch { return NextResponse.redirect(new URL(`${returnTo}?message=github-config`, appOrigin())); }
}
