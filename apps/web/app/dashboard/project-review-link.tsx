import { createClient } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/supabase/config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ReviewLinkForm } from './review-link-form';

export async function ProjectReviewLink({ projectId, environments }: { projectId: string; environments: { id: string; name: string }[] }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('project_review_links').select('token,invite_id').eq('project_id', projectId).maybeSingle();
  const invitation = data ? await supabase.from('guest_invites').select('environment_id').eq('id', data.invite_id).maybeSingle() : null;
  return <Card><CardHeader><CardTitle>Link per la revisione ospite</CardTitle><CardDescription>Condividi questo unico link con i clienti. Con l’estensione installata, inseriscono il nome e iniziano la revisione senza accedere alla dashboard.</CardDescription></CardHeader><CardContent>{error || invitation?.error ? <p className="text-sm text-destructive">Applica la migrazione 202610050011_shared_dashboard.sql per attivare il link del progetto.</p> : <ReviewLinkForm projectId={projectId} environments={environments} link={data ? `${appOrigin()}/guest/${data.token}` : undefined} environmentId={invitation?.data?.environment_id ?? undefined} />}</CardContent></Card>;
}
