'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { newToken, hashToken } from '@/lib/invitation-token';
import { appOrigin } from '@/lib/supabase/config';

export type InviteState = { error?: string; link?: string; success?: string };

export async function createInvitation(_state: InviteState, form: FormData): Promise<InviteState> {
  const { supabase } = await requireUser();
  const projectId = String(form.get('projectId') ?? '');
  const kind = String(form.get('kind') ?? '');
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!isUuid(projectId) || !['member', 'guest'].includes(kind)) return { error: 'Dati non validi.' };
  if (kind === 'member' && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: 'Inserisci un indirizzo email valido.' };
  }
  const environmentId = String(form.get('environmentId') ?? '');
  if (kind === 'guest' && !isUuid(environmentId)) return { error: 'Seleziona un ambiente da revisionare.' };
  const token = newToken();
  const origin = appOrigin();
  const { error } = kind === 'member'
    ? await supabase.rpc('create_member_invite', { target: projectId, invited_email: email, secret_hash: hashToken(token) })
    : await supabase.rpc('create_environment_guest_invite', { target: projectId, environment: environmentId, secret_hash: hashToken(token) });
  if (error) return { error: 'Invito non creato. Verifica i permessi e la migrazione inviti.' };
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath('/dashboard/users');
  return { link: `${origin}/${kind === 'member' ? 'invite' : 'guest'}/${token}` };
}

export async function revokeInvitation(_state: InviteState, form: FormData): Promise<InviteState> {
  const { supabase } = await requireUser();
  const projectId = String(form.get('projectId') ?? '');
  const id = String(form.get('invitationId') ?? '');
  const kind = String(form.get('kind') ?? '');
  if (!isUuid(projectId) || !isUuid(id) || !['member', 'guest'].includes(kind)) return { error: 'Dati non validi.' };
  const { error } = await supabase.rpc('revoke_project_invite', { target: projectId, invitation_id: id, invitation_kind: kind });
  if (error) return { error: 'Revoca non riuscita.' };
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath('/dashboard/users');
  return { success: 'Invito revocato.' };
}
