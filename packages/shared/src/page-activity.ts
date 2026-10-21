/** A visible tab can still belong to an unfocused browser window. */
export function isPageActive(page: Document = document) {
  return page.visibilityState === 'visible' && page.hasFocus();
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
  view.addEventListener('focus', changed, { capture: true });
  view.addEventListener('blur', changed, { capture: true });
  return () => {
    page.removeEventListener('visibilitychange', changed);
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
