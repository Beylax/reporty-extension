'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';

export async function manageMember(projectId: string, memberId: string, operation: 'role' | 'remove', role?: string) {
  if (!isUuid(projectId) || !isUuid(memberId) || !['role', 'remove'].includes(operation) || (operation === 'role' && !['admin', 'member'].includes(role ?? ''))) return { error: 'Dati non validi.' };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('manage_project_member', { target: projectId, member_id: memberId, operation, new_role: role ?? null });
  if (error) return { error: error.message.includes('Keep at least') ? 'Il progetto deve mantenere almeno un amministratore.' : error.code === 'PGRST202' ? 'Applica la migrazione 007 per gestire i membri.' : 'Operazione non consentita o non riuscita.' };
  revalidatePath('/dashboard', 'layout');
  return {};
}
