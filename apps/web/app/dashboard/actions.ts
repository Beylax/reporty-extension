'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isUuid, normalizeOrigin, validateName } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
import { automationDb } from '@/lib/automation/config';
import { verifyRepository } from '@/lib/automation/github';

function field(form: FormData, key: string) { return String(form.get(key) ?? ''); }

export async function createProject(form: FormData) {
  const { supabase, userId } = await requireUser();
  let name: string;
  try { name = validateName(field(form, 'name'), 120); }
  catch { redirect('/dashboard/new?message=invalid-name'); }
  let origin: string;
  try { origin = normalizeOrigin(field(form, 'origin')); }
  catch { redirect('/dashboard/new?message=invalid-origin'); }
  let id: string | null = null;
  let error;
  if (field(form, 'repositoryId')) {
    let repository;
    try { repository = await verifyRepository(userId, Number(field(form, 'repositoryId')), field(form, 'repositoryBranch').trim()); }
    catch { redirect('/dashboard/new?message=github-repository-error'); }
    try { ({ data: id, error } = await automationDb().rpc('create_github_project', { actor: userId, label: name, site_origin: origin, repository })); }
    catch { redirect('/dashboard/new?message=github-config'); }
  } else {
    ({ data: id, error } = await supabase.rpc('create_project_with_production', { project_name: name, site_origin: origin }));
  }
  if (error || !id) redirect('/dashboard/new?message=save-error');
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
  const { supabase, userId } = await requireUser();
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
  if (field(form, 'repositoryMode') === 'replace') {
    let repository = null;
    try {
      if (field(form, 'repositoryId')) repository = await verifyRepository(userId, Number(field(form, 'repositoryId')), field(form, 'repositoryBranch').trim());
    } catch { redirect(`${path}?message=github-repository-error`); }
    let error;
    try {
      ({ error } = await automationDb().rpc('save_github_environment', { actor: userId, project: projectId, environment: environmentId || null, label: name, site_origin: origin, repository }));
    } catch { redirect(`${path}?message=github-config`); }
    if (error) redirect(`${path}?message=${error.code === '55000' ? 'claude-locked' : error.code === '23505' ? 'duplicate-origin' : 'save-error'}`);
  } else {
    const query = environmentId
      ? supabase.from('environments').update({ name, origin }).eq('id', environmentId).eq('project_id', projectId)
      : supabase.from('environments').insert({ project_id: projectId, name, origin });
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) redirect(`${path}?message=${error?.code === '55000' ? 'claude-locked' : error?.code === '23505' ? 'duplicate-origin' : 'save-error'}`);
  }
  revalidatePath('/dashboard');
  revalidatePath(path);
  redirect(`${path}?message=saved`);
}
