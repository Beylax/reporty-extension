export const activeTaskStates = ['queued', 'starting', 'running', 'publishing'] as const;
export type TaskState = typeof activeTaskStates[number] | 'succeeded' | 'failed';
export type RepositoryLink = { environment_id: string; installation_id: number; repository_id: number; full_name: string; base_branch: string };
export type ClaudeTask = {
  id: string; issue_id: string; environment_id: string; project_id: string; status: TaskState;
  session_id: string | null; repository: RepositoryLink; snapshot: { body: string; context: unknown; comments: { body: string }[]; screenshot_path: string | null };
  base_sha: string | null; branch: string; pr_url: string | null; message: string;
  created_at: string; updated_at: string; started_at: string | null; lease_id: string | null;
};
export type TaskView = Pick<ClaudeTask, 'id' | 'status' | 'message' | 'pr_url' | 'created_at' | 'updated_at'>;
export const taskLabels: Record<TaskState, string> = { queued: 'In coda', starting: 'Avvio di Claude', running: 'Claude al lavoro', publishing: 'Creazione pull request', succeeded: 'PR pronta per revisione', failed: 'Task non riuscito' };
export function isActiveTask(status: string) { return (activeTaskStates as readonly string[]).includes(status); }
