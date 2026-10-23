import { handleReportRequest } from '@/lib/report-request';

export async function POST(request: Request) {
  return handleReportRequest(request, null, ['create', 'screenshot']);
}
