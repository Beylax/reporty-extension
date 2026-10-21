import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPageActive, subscribePageActivity, whenPageActive } from './page-activity.ts';

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
