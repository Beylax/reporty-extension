import { ReportList } from './report-list';
import type { ProjectParticipant } from '@reporty/shared';
import { cookies } from 'next/headers';

export async function ProjectReports({ projectId, environments, participants, initialReportId }: { projectId: string; initialReportId?: string; participants: ProjectParticipant[]; environments: { id: string; name: string; origin: string }[] }) {
  const savedView = (await cookies()).get('reporty-report-view')?.value;
  const initialView = savedView === 'list' ? 'list' : 'kanban';
  return <ReportList key={projectId} projectId={projectId} initialView={initialView} initialReportId={initialReportId} environments={environments} participants={participants} />;
}
