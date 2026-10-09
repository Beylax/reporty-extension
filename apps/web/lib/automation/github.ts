import 'server-only';
import { createSign } from 'node:crypto';
import { required } from './config';
import { getGithubCookie } from './cookies';
import type { RepositoryLink } from './types';

export class GithubError extends Error {
  constructor(public status: number) { super(`GitHub non disponibile o accesso negato (${status}).`); }
}
export async function github<T>(path: string, token: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new GithubError(response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')) ? 429 : response.status);
  return response.json();
}
function appJwt() {
  const now = Math.floor(Date.now() / 1000);
  const payload = [ { alg: 'RS256', typ: 'JWT' }, { iat: now - 60, exp: now + 540, iss: required('GITHUB_APP_ID') } ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${payload}.${createSign('RSA-SHA256').update(payload).sign(required('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'), 'base64url')}`;
}
export async function installationToken(link: Pick<RepositoryLink, 'installation_id' | 'repository_id'>, write = false) {
  const data = await github<{ token: string }>(`/app/installations/${link.installation_id}/access_tokens`, appJwt(), {
    repository_ids: [link.repository_id], permissions: { contents: write ? 'write' : 'read', ...(write ? { pull_requests: 'write' } : {}) },
  });
  return data.token;
}
export async function userGithubToken(userId: string) {
  const data = await getGithubCookie('reporty_github');
  if (data?.userId !== userId || typeof data.token !== 'string') throw new Error('Collega nuovamente GitHub per scegliere una repository.');
  return data.token;
}
export type RepositoryOption = { id: number; installationId: number; fullName: string; defaultBranch: string };
type GithubRepo = { id: number; full_name: string; default_branch: string; permissions?: { push?: boolean }; archived?: boolean };
export async function repositories(userId: string) {
  const token = await userGithubToken(userId), result: RepositoryOption[] = [];
  for (let page = 1; ; page++) {
    const { installations } = await github<{ installations: { id: number; app_id: number }[] }>(`/user/installations?per_page=100&page=${page}`, token);
    for (const install of installations.filter(item => String(item.app_id) === required('GITHUB_APP_ID'))) {
      for (let repoPage = 1; ; repoPage++) {
        const data = await github<{ repositories: GithubRepo[] }>(`/user/installations/${install.id}/repositories?per_page=100&page=${repoPage}`, token);
        result.push(...data.repositories.filter(repo => repo.permissions?.push && !repo.archived).map(repo => ({ id: repo.id, installationId: install.id, fullName: repo.full_name, defaultBranch: repo.default_branch })));
        if (data.repositories.length < 100) break;
      }
    }
    if (installations.length < 100) break;
  }
  return result;
}
export async function verifyRepository(userId: string, repositoryId: number, branch: string) {
  if (!Number.isSafeInteger(repositoryId) || !branch || branch.length > 255) throw new Error('Repository o branch non validi.');
  const repo = (await repositories(userId)).find(item => item.id === repositoryId);
  if (!repo) throw new Error('Non hai accesso in scrittura a questa repository tramite la GitHub App.');
  const link = { repository_id: repo.id, installation_id: repo.installationId, full_name: repo.fullName, base_branch: branch };
  await github(`/repos/${repo.fullName}/branches/${encodeURIComponent(branch)}`, await installationToken(link));
  return link;
}
