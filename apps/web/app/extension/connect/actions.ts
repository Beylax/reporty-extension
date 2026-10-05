'use server';

import { cookies } from 'next/headers';
import { isUuid } from '@reporty/shared';
import { createClient } from '@/lib/supabase/server';
import { newToken, hashToken } from '@/lib/invitation-token';

export async function createHandoff(projectId?: string): Promise<{ code?: string; error?: string }> {
  const supabase = await createClient();
  const code = newToken();
  if (projectId) {
    if (!isUuid(projectId)) return { error: 'Progetto non valido.' };
    const secret = (await cookies()).get(`reporty_guest_${projectId}`)?.value;
    if (!secret) return { error: 'Apri prima il link di invito e inserisci il tuo nome.' };
    const { error } = await supabase.rpc('create_guest_handoff', { guest_secret: secret, secret_hash: hashToken(code) });
    if (error) return { error: 'Accesso ospite non disponibile o revocato.' };
  } else {
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims || data.claims.is_anonymous) return { error: 'Accedi prima alla piattaforma, poi torna qui.' };
    const { error } = await supabase.rpc('create_member_handoff', { secret_hash: hashToken(code) });
    if (error) return { error: 'Collegamento non disponibile. Verifica la migrazione delle sessioni estensione.' };
  }
  return { code };
}
