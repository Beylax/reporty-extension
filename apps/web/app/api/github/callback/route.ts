import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { appOrigin } from '@/lib/supabase/config';
import { required } from '@/lib/automation/config';
import { getGithubCookie, setGithubCookie } from '@/lib/automation/cookies';

export async function GET(request: Request) {
  const { userId } = await requireUser();
  const data = await getGithubCookie('reporty_github_oauth');
  (await cookies()).delete('reporty_github_oauth');
  const url = new URL(request.url), code = url.searchParams.get('code');
  if (!data || data.userId !== userId || data.state !== url.searchParams.get('state') || !code) {
    return NextResponse.redirect(new URL('/dashboard?message=github-error', appOrigin()));
  }
  const returnTo = String(data.returnTo);
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: required('GITHUB_APP_CLIENT_ID'), client_secret: required('GITHUB_APP_CLIENT_SECRET'), code, redirect_uri: `${appOrigin()}/api/github/callback` }),
      signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
    const token = await response.json();
    if (!response.ok || typeof token.access_token !== 'string') throw new Error();
    await setGithubCookie('reporty_github', { userId, token: token.access_token });
    return NextResponse.redirect(new URL(`${returnTo}?message=github-connected`, appOrigin()));
  } catch { return NextResponse.redirect(new URL(`${returnTo}?message=github-error`, appOrigin())); }
}
