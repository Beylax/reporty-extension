import assert from 'node:assert/strict';
import test from 'node:test';
import { reportScreenshotPaths, MAX_REPORT_SCREENSHOTS } from './screenshots.ts';

test('legacy screenshots stay first and cleanup paths include every unique screenshot', () => {
  assert.deepEqual(reportScreenshotPaths({ screenshot_path: 'legacy.jpg' }), ['legacy.jpg']);
  assert.deepEqual(reportScreenshotPaths({ screenshot_path: 'first.jpg', screenshot_paths: ['first.jpg', 'second.jpg', 'third.jpg'] }), ['first.jpg', 'second.jpg', 'third.jpg']);
  assert.deepEqual(reportScreenshotPaths({ screenshot_path: null, screenshot_paths: [] }), []);
  assert.equal(MAX_REPORT_SCREENSHOTS, 5);
});
