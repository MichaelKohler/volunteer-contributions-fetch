import { expect, test } from 'vitest';
import { z } from 'zod';

import {
  baseUrlSchema,
  findLatest,
  getPadded,
  sourceSchema,
  stopDateSchema,
} from './utils.js';

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

test('should accept a parseable stopDate', () => {
  expect(stopDateSchema.safeParse('2021-11-01').success).toBe(true);
});

test('should reject an unparseable stopDate', () => {
  expect(stopDateSchema.safeParse('2025-13-01').success).toBe(false);
  expect(stopDateSchema.safeParse('not a date').success).toBe(false);
});

test('should accept a baseUrl without trailing slash', () => {
  expect(baseUrlSchema.safeParse('https://bugzilla.mozilla.org').success).toBe(
    true
  );
});

test('should reject a baseUrl with trailing slash', () => {
  expect(baseUrlSchema.safeParse('https://bugzilla.mozilla.org/').success).toBe(
    false
  );
});

test('should reject an empty baseUrl', () => {
  expect(baseUrlSchema.safeParse('').success).toBe(false);
});

const testSourceSchema = sourceSchema(
  z.strictObject({ enabled: z.literal(true), username: z.string() })
);

test('should accept a disabled source without other values', () => {
  expect(testSourceSchema.parse({ enabled: false })).toEqual({
    enabled: false,
  });
});

test('should accept a disabled source with incomplete values', () => {
  expect(testSourceSchema.parse({ enabled: false, foo: 1 })).toEqual({
    enabled: false,
    foo: 1,
  });
});

test('should validate an enabled source', () => {
  expect(testSourceSchema.parse({ enabled: true, username: 'user' })).toEqual({
    enabled: true,
    username: 'user',
  });
  expect(testSourceSchema.safeParse({ enabled: true }).success).toBe(false);
});

test('should reject a source without enabled', () => {
  expect(testSourceSchema.safeParse({ username: 'user' }).success).toBe(false);
});
