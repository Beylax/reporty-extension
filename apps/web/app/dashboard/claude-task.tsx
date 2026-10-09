'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';
import { isActiveTask, taskLabels, type TaskView } from '@/lib/automation/types';
import { assignClaude } from './claude-actions';

export function ClaudeTaskPanel({ issueId, locked, repositoryLinked, onLockChange }: { issueId: string; locked: boolean; repositoryLinked: boolean; onLockChange: (value: boolean) => void }) {
  const [task, setTask] = useState<TaskView | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const submitting = useRef(false), lastStatus = useRef<string | null>(null);
  const router = useRouter();
  const { add: addToast } = useToastManager();
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`/api/claude/tasks/${issueId}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = await response.json() as { task: TaskView | null };
        if (stopped || submitting.current) return;
        setTask(result.task); setUnavailable(false); onLockChange(Boolean(result.task && isActiveTask(result.task.status)));
        const status = result.task?.status ?? '';
        if (lastStatus.current !== null && lastStatus.current !== status) {
          router.refresh();
          if (result.task && !isActiveTask(status)) addToast({ title: taskLabels[result.task.status], description: result.task.message, type: status === 'succeeded' ? 'success' : 'error' });
        }
        if (lastStatus.current === null) router.refresh();
        lastStatus.current = status;
      } catch { if (!stopped) setUnavailable(true); }
      finally { if (!stopped) { setLoading(false); timer = setTimeout(() => void poll(), 5000); } }
    }
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [issueId, onLockChange, router, addToast]);
  async function assign() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); onLockChange(true);
    try {
      const result = await assignClaude(issueId);
      if (result.error) throw new Error(result.error);
      setTask({ id: result.id!, status: 'queued', message: 'In attesa di avvio.', pr_url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      lastStatus.current = 'queued';
      addToast({ title: 'Task assegnato a Claude', type: 'success' }); router.refresh();
    } catch (error) { onLockChange(locked); addToast({ title: 'Assegnazione non riuscita', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); }
    finally { setBusy(false); submitting.current = false; }
  }
  const active = busy || locked || Boolean(task && isActiveTask(task.status));
  return <section className="space-y-3 rounded-xl border bg-muted/50 p-4" aria-labelledby="claude-task-title">
    <h3 id="claude-task-title" className="font-medium">Task Claude</h3>
    {loading || busy ? <div role="status" aria-label="Caricamento task Claude" className="space-y-3 motion-safe:animate-pulse"><div className="h-5 w-40 rounded bg-muted" /><div className="h-4 w-full rounded bg-muted" /><div className="h-10 w-48 rounded bg-muted" /></div> : <>
      {task ? <div aria-live="polite" className="space-y-1"><p className="text-sm font-medium">{taskLabels[task.status]}</p><p className="text-sm text-muted-foreground">{task.message}</p></div> : <p className="text-sm text-muted-foreground">Assegna questa segnalazione a Claude per proporre una correzione nella repository collegata all’ambiente.</p>}
      {unavailable ? <p role="status" className="text-sm text-muted-foreground">Monitoraggio temporaneamente non disponibile. Nuovo tentativo automatico in corso.</p> : null}
      {active ? <p className="text-sm text-muted-foreground">Segnalazione bloccata durante il task. Puoi continuare a commentare; i nuovi commenti non vengono inviati al task già avviato.</p> : null}
      {task?.pr_url ? <Button variant="outline" nativeButton={false} render={<a href={task.pr_url} target="_blank" rel="noopener noreferrer" />}>Apri pull request ↗</Button> : null}
      {!repositoryLinked ? <p className="text-sm text-muted-foreground">Collega una repository GitHub dalla card dell’ambiente per assegnare il task.</p> : null}
      <Button disabled={active || unavailable || !repositoryLinked} onClick={() => void assign()}>Assegna task a Claude</Button>
    </>}
  </section>;
}
