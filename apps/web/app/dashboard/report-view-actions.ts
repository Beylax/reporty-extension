'use server';

import { cookies } from 'next/headers';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';

export async function saveReportView(projectId: string, view: 'list' | 'kanban') {
  await requireUser();
  if (!isUuid(projectId) || (view !== 'list' && view !== 'kanban')) throw new Error('Vista non valida.');
  (await cookies()).set('reporty-report-view', view, {
    path: `/dashboard/projects/${projectId}`,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}
