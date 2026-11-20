import { expect, test } from 'vitest';

import { findLatest, getPadded } from './utils.js';

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

test('should find latest matching contribution regardless of order', () => {
  const contributions = [
    { source: 'a', createdAt: '2022-01-01T00:00:00Z' },
    { source: 'a', createdAt: '2023-01-01T00:00:00Z' },
    { source: 'b', createdAt: '2024-01-01T00:00:00Z' },
    { source: 'a', createdAt: new Date('2022-06-01T00:00:00Z') },
  ];
  const latest = findLatest(contributions, (c) => c.source === 'a');
  expect(latest).toBe(contributions[1]);
});

test('should return undefined if no contribution matches', () => {
  const latest = findLatest([{ source: 'a' }], (c) => c.source === 'b');
  expect(latest).toBeUndefined();
});
