const embeddedActivity = new WeakMap<Document, boolean>();
const activityChanged = 'reporty:page-activity';

/** Set only from the widget's validated playground bridge. No credentials cross the frame. */
export function setEmbeddedPageActive(active: boolean | null, page: Document = document) {
  const previous = embeddedActivity.get(page);
  if (active === null) embeddedActivity.delete(page);
  else embeddedActivity.set(page, active);
  if (previous !== embeddedActivity.get(page)) page.dispatchEvent(new Event(activityChanged));
}

/** Embedded playgrounds inherit the dashboard's activity instead of requiring a click. */
export function isPageActive(page: Document = document) {
  return page.visibilityState === 'visible' && (embeddedActivity.get(page) ?? page.hasFocus());
}

export function subscribePageActivity(update: () => void, page: Document = document, view: Window = window) {
  let active = isPageActive(page);
  const changed = () => {
    const next = isPageActive(page);
    if (active === next) return;
    active = next;
    update();
  };
  page.addEventListener('visibilitychange', changed);
  page.addEventListener(activityChanged, changed);
  view.addEventListener('focus', changed, { capture: true });
  view.addEventListener('blur', changed, { capture: true });
  return () => {
    page.removeEventListener('visibilitychange', changed);
    page.removeEventListener(activityChanged, changed);
    view.removeEventListener('focus', changed, { capture: true });
    view.removeEventListener('blur', changed, { capture: true });
  };
}

/** Defer a queued read until the user returns, without reloading on every focus. */
export function whenPageActive(read: () => void, page: Document = document, view: Window = window) {
  let started = false;
  const update = () => {
    if (started || !isPageActive(page)) return;
    started = true;
    stop();
    read();
  };
  const stop = subscribePageActivity(update, page, view);
  update();
  return stop;
}
