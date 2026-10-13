
import { BrandLogo } from '@/components/brand-logo';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { isUuid } from '@reporty/shared';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FeedbackToast } from '@/components/feedback-toast';

export default async function GuestWorkspace({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!isUuid(projectId)) notFound();
  const token = (await cookies()).get(`reporty_guest_${projectId}`)?.value;
  const supabase = await createClient();
  const result = token ? await supabase.rpc('get_guest_session', { secret: token }) : null;
  const session = result?.data?.[0];
  if (!session || session.project_id !== projectId) return <main className="mx-auto max-w-lg px-6 py-20"><FeedbackToast message={'Accesso ospite non disponibile o revocato. Riapri un invito attivo.'} /></main>;
  return <main className="mx-auto max-w-lg space-y-6 px-6 py-20"><BrandLogo /><Card><CardHeader><CardTitle>{session.display_name ? `Benvenuto, ${session.display_name}` : 'Consultazione ospite'}</CardTitle><CardDescription>Hai accesso come revisore ospite a {session.project_name}.</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm">Apri l’estensione Reporty, premi «Collega» e seleziona l’accesso ospite a questo progetto. Conferma il collegamento, poi apri il sito dall’elenco degli ambienti nell’estensione.</p><p className="text-sm text-muted-foreground">Sul sito abilita Reporty dal popup, poi usa il pulsante + per selezionare un elemento o aggiungere un pin. Puoi leggere le segnalazioni del progetto senza nome; il nome viene richiesto alla prima azione.</p></CardContent></Card></main>;
}
