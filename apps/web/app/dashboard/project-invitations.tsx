import { ProjectMembers } from './project-members';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InvitationForm, RevokeInvitation } from './invitation-form';
import { Alert, AlertDescription } from '@/components/ui/alert';

export async function ProjectInvitations({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const [members, memberInvites, guestInvites, environments] = await Promise.all([
    supabase.rpc('list_project_members', { target: projectId }),
    supabase.from('member_invites').select('id, email, created_at, revoked_at, accepted_at').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('guest_invites').select('id, created_at, revoked_at').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('environments').select('id,name').eq('project_id', projectId).order('created_at'),
  ]);
  if (members.error || memberInvites.error || guestInvites.error || environments.error) return <Alert><AlertDescription>Per attivare gli inviti, applica la migrazione 202610050003_invitations.sql. Se è già applicata, verifica la connessione e i permessi.</AlertDescription></Alert>;
  const formatDate = (value: string) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeZone: 'Europe/Rome' }).format(new Date(value));
  return <section className="space-y-5" aria-labelledby="access-title">
    <h2 id="access-title" className="text-xl font-semibold">Sviluppatori e inviti</h2>
    <Card><CardHeader><CardTitle>Sviluppatori del progetto</CardTitle></CardHeader><CardContent><ProjectMembers projectId={projectId} members={members.data ?? []} /></CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Invita uno sviluppatore</CardTitle><CardDescription>Il link può essere accettato solo dopo l’accesso con l’email invitata. Lo sviluppatore potrà usare la dashboard.</CardDescription></CardHeader><CardContent className="space-y-6"><InvitationForm projectId={projectId} kind="member" />
        <ul className="divide-y">{memberInvites.data.map(invite => <li key={invite.id} className="space-y-3 py-4"><div className="flex flex-wrap gap-2"><span className="break-all text-sm">{invite.email}</span><Badge variant="secondary">{invite.accepted_at ? 'Accettato' : invite.revoked_at ? 'Revocato' : 'In attesa'}</Badge></div>{!invite.accepted_at && !invite.revoked_at ? <RevokeInvitation projectId={projectId} invitationId={invite.id} kind="member" /> : null}</li>)}</ul>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Revisori ospiti</CardTitle><CardDescription>Un link per Designer e clienti, riutilizzabile fino a revoca. Gli ospiti inseriscono solo il nome e usano l’estensione, senza dashboard.</CardDescription></CardHeader><CardContent className="space-y-6"><InvitationForm projectId={projectId} kind="guest" environments={environments.data ?? []} />
        <ul className="divide-y">{guestInvites.data.map(invite => <li key={invite.id} className="space-y-3 py-4"><div className="flex flex-wrap gap-2"><span className="text-sm">Creato il {formatDate(invite.created_at)}</span><Badge variant="secondary">{invite.revoked_at ? 'Revocato' : 'Attivo'}</Badge></div>{!invite.revoked_at ? <RevokeInvitation projectId={projectId} invitationId={invite.id} kind="guest" /> : null}</li>)}</ul>
      </CardContent></Card>
    </div>
  </section>;
}
