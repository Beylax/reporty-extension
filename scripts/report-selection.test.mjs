import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageSelectionState, selectReportPage } from '../apps/web/lib/report-selection.ts';

const report = id => ({ id, environment_id: 'environment', canEdit: true, canChangeStatus: true });
const page = [report('one'), report('two')];

test('selecting a page preserves other pages and does not duplicate selected rows', () => {
  const selection = selectReportPage([page[0], report('other-page')], page, true);
  assert.deepEqual(selection.map(item => item.id), ['other-page', 'one', 'two']);
  assert.deepEqual(pageSelectionState(selection, page), { all: true, partial: false });
});

test('deselecting a page preserves selections on other pages', () => {
  const selection = selectReportPage([...page, report('other-page')], page, false);
  assert.deepEqual(selection.map(item => item.id), ['other-page']);
  assert.deepEqual(pageSelectionState(selection, page), { all: false, partial: false });
});

test('unchecking a globally selected result clears all pages from any current page', () => {
  const selection = [...page, report('other-page')];
  assert.deepEqual(selectReportPage(selection, page, false, true), []);
  assert.deepEqual(selectReportPage(selection, [selection[2]], false, true), []);
});

test('selecting a page still preserves the global selection', () => {
  const selection = [...page, report('other-page')];
  assert.deepEqual(new Set(selectReportPage(selection, page, true, true).map(item => item.id)), new Set(selection.map(item => item.id)));
});

test('the header reflects only the visible page, including partial and empty selections', () => {
  assert.deepEqual(pageSelectionState([report('other-page')], page), { all: false, partial: false });
  assert.deepEqual(pageSelectionState([page[1], report('other-page')], page), { all: false, partial: true });
  assert.deepEqual(pageSelectionState(page, []), { all: false, partial: false });
});
