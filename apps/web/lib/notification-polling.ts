export const NOTIFICATIONS_CHANGED = 'reporty:notifications-changed';

/** Keep the timer independent from renders and refresh when returning to the dashboard. */
export function startNotificationPolling(refresh: () => Promise<void>, page: Document = document, view: Window = window) {
  let disposed = false;
  let pending = false;
  const update = () => {
    if (disposed || pending || page.visibilityState !== 'visible') return;
    pending = true;
    void refresh().finally(() => { pending = false; });
  };
  update();
  const timer = setInterval(update, 10000);
  page.addEventListener('visibilitychange', update);
  view.addEventListener('focus', update);
  view.addEventListener(NOTIFICATIONS_CHANGED, update);
  return () => {
    disposed = true;
    clearInterval(timer);
    page.removeEventListener('visibilitychange', update);
    view.removeEventListener('focus', update);
    view.removeEventListener(NOTIFICATIONS_CHANGED, update);
  };
}
