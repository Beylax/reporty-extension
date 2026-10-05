'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isUuid, normalizeOrigin, validateName } from '@reporty/shared';
import { requireUser } from '@/lib/auth';

function field(form: FormData, key: string) { return String(form.get(key) ?? ''); }

export async function createProject(form: FormData) {
  const { supabase, userId } = await requireUser();
  let name: string;
  try { name = validateName(field(form, 'name'), 120); }
  catch { redirect('/dashboard/new?message=invalid-name'); }
  const id = randomUUID();
  const { error } = await supabase.from('projects').insert({ id, name, created_by: userId });
  if (error) redirect('/dashboard/new?message=save-error');
  revalidatePath('/dashboard');
  redirect(`/dashboard/projects/${id}?message=created`);
}

export async function renameProject(form: FormData) {
  const { supabase } = await requireUser();
  const id = field(form, 'projectId');
  if (!isUuid(id)) redirect('/dashboard');
  const path = `/dashboard/projects/${id}`;
  let name: string;
  try { name = validateName(field(form, 'name'), 120); }
  catch { redirect(`${path}?message=invalid-name`); }
  const { data, error } = await supabase.from('projects').update({ name }).eq('id', id).select('id').maybeSingle();
  if (error || !data) redirect(`${path}?message=save-error`);
  revalidatePath('/dashboard');
  revalidatePath(path);
  redirect(`${path}?message=saved`);
}

export async function saveEnvironment(form: FormData) {
  const { supabase } = await requireUser();
  const projectId = field(form, 'projectId');
  const environmentId = field(form, 'environmentId');
  if (!isUuid(projectId) || (environmentId && !isUuid(environmentId))) redirect('/dashboard');
  const path = `/dashboard/projects/${projectId}`;
  let name: string;
  let origin: string;
  try { name = validateName(field(form, 'name'), 80); }
  catch { redirect(`${path}?message=invalid-name`); }
  try { origin = normalizeOrigin(field(form, 'origin')); }
  catch { redirect(`${path}?message=invalid-origin`); }
  const query = environmentId
    ? supabase.from('environments').update({ name, origin }).eq('id', environmentId).eq('project_id', projectId)
    : supabase.from('environments').insert({ project_id: projectId, name, origin });
  const { data, error } = await query.select('id').maybeSingle();
  if (error || !data) redirect(`${path}?message=${error?.code === '23505' ? 'duplicate-origin' : 'save-error'}`);
  revalidatePath('/dashboard');
  revalidatePath(path);
  redirect(`${path}?message=saved`);
}
