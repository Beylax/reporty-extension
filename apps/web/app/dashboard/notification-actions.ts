'use server';

import { isUuid, type NotificationPage } from '@reporty/shared';
import { requireUser } from '@/lib/auth';

export async function notificationAction(operation: 'notifications' | 'notification_read' | 'notifications_read', id?: string) {
  const { supabase } = await requireUser();
  if (!['notifications', 'notification_read', 'notifications_read'].includes(operation) || (operation === 'notification_read' && (!id || !isUuid(id)))) return { error: 'Dati non validi.' };
  const { data, error } = await supabase.rpc('notification_operation', { secret: null, target: null, operation, payload: { ...(id ? { id } : {}), paginated: true, mode: 'summary' } });
  return error ? { error: 'Impossibile caricare o aggiornare le notifiche.' } : { data: data as NotificationPage };
}
