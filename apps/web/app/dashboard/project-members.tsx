'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { manageMember } from './member-actions';

export function ProjectMembers({ projectId, members }: { projectId: string; members: { user_id: string; email: string; role: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const router = useRouter();
  function change(memberId: string, operation: 'role' | 'remove', role?: string) {
    setError('');
    startTransition(async () => { const result = await manageMember(projectId, memberId, operation, role); if (result.error) setError(result.error); else router.refresh(); });
  }
  return <div><p role="status" className="text-sm text-destructive">{error}</p><ul className="divide-y">{members.map(member => <li key={member.user_id} className="flex flex-wrap items-center gap-3 py-3"><span className="min-w-0 flex-1 break-all text-sm">{member.email}</span><select aria-label={`Ruolo di ${member.email}`} className="rounded-lg border bg-background p-2 text-sm" value={member.role} disabled={pending || member.role === 'admin'} onChange={event => change(member.user_id, 'role', event.target.value)}><option value="member">Membro</option><option value="admin">Amministratore</option></select>{member.role === 'admin' ? <span className="text-xs text-muted-foreground">Amministratore protetto</span> : <Button variant="destructive" size="sm" disabled={pending} onClick={() => { if (confirm(`Rimuovere ${member.email} dal progetto? Perderà l’accesso anche dall’estensione.`)) change(member.user_id, 'remove'); }}>Rimuovi</Button>}</li>)}</ul></div>;
}
