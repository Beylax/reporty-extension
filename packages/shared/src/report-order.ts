import type { Report } from './reports';
const statusOrder = { open: 0, in_progress: 1, validation: 2, resolved: 3 };
const priorityOrder = { high: 0, medium: 1, low: 2 };
export function compareReports(a: Pick<Report, 'status' | 'priority' | 'created_at' | 'id'>, b: Pick<Report, 'status' | 'priority' | 'created_at' | 'id'>) {
  return statusOrder[a.status] - statusOrder[b.status]
    || priorityOrder[a.priority ?? 'medium'] - priorityOrder[b.priority ?? 'medium']
    || Date.parse(a.created_at) - Date.parse(b.created_at)
    || a.id.localeCompare(b.id);
}
