import { ReportList } from './report-list';
import type { ProjectParticipant } from '@reporty/shared';

export async function ProjectReports({ environments, participants, initialReportId }: { initialReportId?: string; participants: ProjectParticipant[]; environments: { id: string; name: string; origin: string }[] }) {
  return <ReportList initialReportId={initialReportId} environments={environments} participants={participants} />;
}
