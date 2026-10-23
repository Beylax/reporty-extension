import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPageActive, setEmbeddedPageActive, subscribePageActivity, whenPageActive } from './page-activity.ts';

function surfaces() {
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible', focused: true, hasFocus() { return this.focused; } });
  return { page, view: new EventTarget() };
}

test('activity requires visibility and focus and ignores focus moves inside the page', () => {
  const { page, view } = surfaces();
  const changes: boolean[] = [];
  const stop = subscribePageActivity(() => changes.push(isPageActive(page as unknown as Document)), page as unknown as Document, view as unknown as Window);
  view.dispatchEvent(new Event('focus'));
  view.dispatchEvent(new Event('blur'));
  assert.deepEqual(changes, []);
  page.focused = false; view.dispatchEvent(new Event('blur'));
  page.visibilityState = 'hidden'; page.dispatchEvent(new Event('visibilitychange'));
  page.focused = true; view.dispatchEvent(new Event('focus'));
  assert.deepEqual(changes, [false]);
  page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(changes, [false, true]);
  stop();
  page.focused = false; view.dispatchEvent(new Event('blur'));
  assert.deepEqual(changes, [false, true]);
});

test('playground frames inherit activity without focus, but hidden tabs and inactive frames stay paused', () => {
  const { page, view } = surfaces();
  const document = page as unknown as Document;
  page.focused = false;
  let reads = 0;
  const changes: boolean[] = [];
  const stop = subscribePageActivity(() => changes.push(isPageActive(document)), document, view as unknown as Window);
  const cancel = whenPageActive(() => reads++, document, view as unknown as Window);
  assert.equal(reads, 0);
  setEmbeddedPageActive(true, document);
  assert.equal(reads, 1);
  assert.equal(page.hasFocus(), false);
  assert.equal(isPageActive(document), true);
  setEmbeddedPageActive(true, document);
  assert.deepEqual(changes, [true]);
  setEmbeddedPageActive(false, document);
  page.focused = true;
  assert.equal(isPageActive(document), false);
  setEmbeddedPageActive(true, document);
  page.visibilityState = 'hidden'; page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(isPageActive(document), false);
  setEmbeddedPageActive(null, document);
  page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(isPageActive(document), true);
  cancel(); stop();
});

test('deferred reads resume once and can be cancelled before focus returns', () => {
  const { page, view } = surfaces();
  page.focused = false;
  let reads = 0;
  const stop = whenPageActive(() => reads++, page as unknown as Document, view as unknown as Window);
  const cancel = whenPageActive(() => reads++, page as unknown as Document, view as unknown as Window);
  cancel();
  assert.equal(reads, 0);
  page.focused = true; view.dispatchEvent(new Event('focus'));
  view.dispatchEvent(new Event('focus'));
  assert.equal(reads, 1);
  stop();
});
