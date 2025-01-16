import { expect, test } from 'vitest';

import { getPadded } from './utils.js';

test('should pad number below 10', () => {
  const padded = getPadded(8);
  expect(padded).toBe('08');
});

test('should not pad 10', () => {
  const padded = getPadded(10);
  expect(padded).toBe('10');
});

test('should not pad 11', () => {
  const padded = getPadded(11);
  expect(padded).toBe('11');
});
