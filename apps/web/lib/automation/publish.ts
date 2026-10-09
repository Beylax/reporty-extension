import 'server-only';
import { github, GithubError, installationToken } from './github';
import type { ClaudeTask } from './types';
import type { AgentResult } from './result';

export async function publishResult(task: ClaudeTask, result: AgentResult) {
  const token = await installationToken(task.repository, true), repo = `/repos/${task.repository.full_name}`;
  const existing = await github<{ html_url: string; base: { ref: string }; head: { ref: string; repo: { id: number } }; draft: boolean }[]>(`${repo}/pulls?state=all&head=${encodeURIComponent(`${task.repository.full_name.split('/')[0]}:${task.branch}`)}`, token);
  const pr = existing.find(pr => pr.base.ref === task.repository.base_branch && pr.head.ref === task.branch && pr.head.repo?.id === task.repository.repository_id && !pr.draft);
  if (pr) return pr.html_url;
  // Never update an existing branch: a prior attempt may already have pushed this task.
  try { await github(`${repo}/git/ref/heads/${task.branch}`, token); }
  catch (error) {
    if (!(error instanceof GithubError) || error.status !== 404) throw error;
    const base = await github<{ tree: { sha: string } }>(`${repo}/git/commits/${task.base_sha}`, token);
    const tree = await github<{ sha: string }>(`${repo}/git/trees`, token, { base_tree: base.tree.sha, tree: result.files.map(file => ({ path: file.path, mode: file.executable ? '100755' : '100644', type: 'blob', ...(file.content === null ? { sha: null } : { content: file.content }) })) });
    if (tree.sha === base.tree.sha) throw new GithubError(422);
    const commit = await github<{ sha: string }>(`${repo}/git/commits`, token, { message: `Reporty: ${task.snapshot.body.replace(/\s+/g, ' ').slice(0, 100)}\n\nTask: ${task.id}`, tree: tree.sha, parents: [task.base_sha] });
    try { await github(`${repo}/git/refs`, token, { ref: `refs/heads/${task.branch}`, sha: commit.sha }); }
    catch (error) { if (!(error instanceof GithubError) || error.status !== 422) throw error; await github(`${repo}/git/ref/heads/${task.branch}`, token); }
  }
  const created = await github<{ html_url: string }>(`${repo}/pulls`, token, {
    title: `Reporty: ${task.snapshot.body.replace(/\s+/g, ' ').slice(0, 110)}`,
    head: task.branch, base: task.repository.base_branch, draft: false,
    body: `## Segnalazione\n\n${task.snapshot.body}\n\n## Modifiche\n\n${result.summary}\n\n## Verifiche dichiarate da Claude\n\n${result.tests}\n\nTask Reporty: ${task.id}`,
  });
  return created.html_url;
}
