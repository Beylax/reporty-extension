import { createClient } from '@/lib/supabase/server';
import { ReportList } from './report-list';
import { FeedbackToast } from '@/components/feedback-toast';
import type { Report, ProjectParticipant } from '@reporty/shared';

export async function ProjectReports({ environments, participants }: { participants: ProjectParticipant[]; environments: { id: string; name: string; origin: string }[] }) {
  const supabase = await createClient();
  const results = await Promise.all(environments.map(async environment => {
    const { data, error } = await supabase.rpc('report_operation', { secret: null, target: environment.id, operation: 'list', payload: {} });
    return { data: data as Report[] | null, error };
  }));
  if (results.some(result => result.error)) return <FeedbackToast message={'Per attivare le segnalazioni, verifica lo schema inizializzato con supabase/initialize.sql. Se è già applicata, verifica connessione e permessi.'} />;
  return <ReportList reports={results.flatMap(result => result.data ?? [])} environments={environments} participants={participants} />;
}
