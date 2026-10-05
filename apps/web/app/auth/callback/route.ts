import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/supabase/config';
import { cookies } from 'next/headers';
import { validToken } from '@/lib/invitation-token';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const store = await cookies();
      const invitation = store.get('reporty_pending_invite')?.value;
      store.delete('reporty_pending_invite');
      const path = invitation && validToken(invitation) ? `/invite/${invitation}` : '/dashboard';
      return NextResponse.redirect(`${appOrigin()}${path}`);
    }
  }
  return NextResponse.redirect(`${appOrigin()}/login?message=callback-error`);
}
