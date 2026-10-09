'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { useToastManager } from '@/components/ui/toast';
import type { RepositoryLink } from '@/lib/automation/types';
import type { RepositoryOption } from '@/lib/automation/github';
import { githubInstallUrl, listGithubRepositories } from './github-actions';

export function RepositoryFields({ existing, returnTo }: { existing?: RepositoryLink | null; returnTo: string }) {
  const id = useId(), toast = useToastManager();
  const [options, setOptions] = useState<RepositoryOption[]>([]), [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(existing ? String(existing.repository_id) : ''), [branch, setBranch] = useState(existing?.base_branch ?? '');
  const [changed, setChanged] = useState(false), [loaded, setLoaded] = useState(false);
  async function load() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await listGithubRepositories();
      if (result.error) throw new Error(result.error);
      setOptions(result.repositories ?? []); setLoaded(true);
    } catch (error) { toast.add({ title: 'GitHub non disponibile', description: error instanceof Error ? error.message : 'Riprova.', type: 'error' }); }
    finally { setLoading(false); }
  }
  const choices = [{ value: '', label: 'Nessuna repository' }, ...(existing && !options.some(item => item.id === existing.repository_id) ? [{ value: String(existing.repository_id), label: existing.full_name }] : []), ...options.map(item => ({ value: String(item.id), label: item.fullName }))];
  return <fieldset className="space-y-3 rounded-lg border p-4 sm:col-span-2">
    <legend className="px-1 text-sm font-medium">Repository GitHub (facoltativa)</legend>
    <input type="hidden" name="repositoryBranch" value={branch} /><input type="hidden" name="repositoryMode" value={changed ? 'replace' : 'preserve'} /><input type="hidden" name="repositoryId" value={selected} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" nativeButton={false} render={<a href={`/api/github/connect?returnTo=${encodeURIComponent(returnTo)}`} />}>Collega GitHub</Button>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>Carica repository</Button>
      <Button type="button" variant="ghost" onClick={() => { void githubInstallUrl().then(result => { if (result.url) window.location.assign(result.url); else toast.add({ title: result.error ?? 'GitHub non disponibile', type: 'error' }); }); }}>Configura accesso repository ↗</Button>
    </div>
    {loading ? <div role="status" aria-label="Caricamento repository" className="grid gap-3 sm:grid-cols-2 motion-safe:animate-pulse"><div className="h-16 rounded bg-muted" /><div className="h-16 rounded bg-muted" /></div> : <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-2"><Label htmlFor={`${id}-repo`}>Repository</Label><SelectField id={`${id}-repo`} value={selected} options={choices} onValueChange={value => { setSelected(value); setBranch(options.find(item => String(item.id) === value)?.defaultBranch ?? existing?.base_branch ?? ''); setChanged(true); }} /></div>
      <div className="grid gap-2"><Label htmlFor={`${id}-branch`}>Branch di destinazione</Label><Input id={`${id}-branch`} value={branch} disabled={!selected} required={Boolean(selected)} maxLength={255} onChange={event => { setBranch(event.target.value); setChanged(true); }} placeholder="main" /></div>
    </div>}
    {loaded && !options.length ? <p className="text-sm text-muted-foreground">Nessuna repository disponibile. Installa la GitHub App sulle repository desiderate, poi ricollega GitHub e carica l’elenco.</p> : <p className="text-sm text-muted-foreground">Claude creerà un branch dedicato e una PR verso il branch scelto. Puoi collegare la repository anche in seguito.</p>}
  </fieldset>;
}
