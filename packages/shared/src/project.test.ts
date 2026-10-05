import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeOrigin, validateName } from './project.ts';

test('origins normalize case, default ports and trailing slashes', () => {
  assert.equal(normalizeOrigin(' HTTPS://Example.com:443/ '), 'https://example.com');
  assert.equal(normalizeOrigin('http://localhost:3000'), 'http://localhost:3000');
});
test('origins reject credentials, page paths and unsupported protocols', () => {
  for (const value of ['example.com', 'https://user:pass@example.com', 'https://example.com/page', 'https://example.com/?a=1', 'https://example.com/#/page', 'file:///tmp']) {
    assert.throws(() => normalizeOrigin(value));
  }
});
test('names are trimmed and bounded', () => {
  assert.equal(validateName(' Progetto ', 120), 'Progetto');
  assert.throws(() => validateName('  ', 120));
  assert.throws(() => validateName('a'.repeat(121), 120));
});
