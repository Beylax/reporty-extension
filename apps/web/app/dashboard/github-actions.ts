'use server';
import { requireUser } from '@/lib/auth';
import { repositories } from '@/lib/automation/github';
import { required } from '@/lib/automation/config';

export async function listGithubRepositories() {
  const { userId } = await requireUser();
  try { return { repositories: await repositories(userId) }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'GitHub non disponibile.' }; }
}
export async function githubInstallUrl() {
  await requireUser();
  try { return { url: `https://github.com/apps/${encodeURIComponent(required('GITHUB_APP_SLUG'))}/installations/new` }; }
  catch { return { error: 'GitHub App non configurata.' }; }
}
