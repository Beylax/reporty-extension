import assert from 'node:assert/strict';
import test from 'node:test';
import { pinPreviewLayout } from '../apps/extension/lib/pin-preview.ts';

test('collapsed and expanded previews stay inside every edge and corner', () => {
  for (const viewport of [
    { left: 0, top: 0, width: 1009, height: 768 }, // visible width excludes the scrollbar
    { left: 0, top: 0, width: 280, height: 160 },
    { left: 120, top: 80, width: 360, height: 240 }, // zoomed visual viewport
  ]) {
    for (const x of [viewport.left - 20, viewport.left, viewport.left + viewport.width / 2, viewport.left + viewport.width]) {
      for (const y of [viewport.top, viewport.top + 20, viewport.top + viewport.height]) {
        for (const expanded of [false, true]) {
          const layout = pinPreviewLayout(x, y, 400, expanded, viewport);
          const left = x + layout.shiftX, top = y - layout.height + layout.shiftY;
          assert.ok(left >= viewport.left + 8);
          assert.ok(left + layout.width <= viewport.left + viewport.width - 8);
          assert.ok(top >= viewport.top + 8);
          assert.ok(top + layout.height <= viewport.top + viewport.height - 8);
          assert.ok(layout.previewWidth <= viewport.width - 20);
        }
      }
    }
  }
});

test('fully offscreen anchors are not moved into view', () => {
  const viewport = { left: 0, top: 0, width: 1024, height: 768 };
  for (const x of [-100, 1100]) assert.equal(pinPreviewLayout(x, 300, 200, true, viewport).shiftX, 0);
  for (const y of [-100, 900]) assert.equal(pinPreviewLayout(300, y, 200, true, viewport).shiftY, 0);
});
