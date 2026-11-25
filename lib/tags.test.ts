import { expect, test } from 'vitest';

import type { Contribution } from './types.js';

import {
  applyTagRules,
  dateRangeSchema,
  findTagRule,
  tagRuleSchema,
} from './tags.js';

const contribution: Contribution = {
  createdAt: '2022-06-15T12:00:00.000Z',
  description: 'Foo',
  link: 'https://github.com/mozilla/foo/pull/1',
  type: 'Created PR',
  source: 'github-pr-created',
};

test('should accept a rule with tags only', () => {
  expect(tagRuleSchema.parse({ tags: ['a'] })).toEqual({ tags: ['a'] });
});

test('should reject a rule without tags', () => {
  expect(tagRuleSchema.safeParse({}).success).toBe(false);
  expect(tagRuleSchema.safeParse({ tags: [] }).success).toBe(false);
  expect(tagRuleSchema.safeParse({ tags: [''] }).success).toBe(false);
});

test('should reject a rule with unknown keys', () => {
  expect(tagRuleSchema.safeParse({ tags: ['a'], pattern: 'a' }).success).toBe(
    false
  );
});

test('should accept partial and empty date ranges', () => {
  expect(dateRangeSchema.safeParse({}).success).toBe(true);
  expect(dateRangeSchema.safeParse({ startDate: '2022-01-01' }).success).toBe(
    true
  );
  expect(dateRangeSchema.safeParse({ endDate: '2022-01-01' }).success).toBe(
    true
  );
  expect(
    dateRangeSchema.safeParse({
      startDate: '2022-01-01',
      endDate: '2022-01-01',
    }).success
  ).toBe(true);
});

test('should reject invalid dates in a date range', () => {
  expect(() => dateRangeSchema.parse({ startDate: '2022-13-01' })).toThrow(
    'startDate must be a valid date'
  );
  expect(() => dateRangeSchema.parse({ endDate: 'not a date' })).toThrow(
    'endDate must be a valid date'
  );
});

test('should reject a date range with start after end', () => {
  expect(() =>
    dateRangeSchema.parse({ startDate: '2022-02-01', endDate: '2022-01-01' })
  ).toThrow('startDate must not be after endDate');
});

test('should return the first matching rule', () => {
  const rules = [
    { tags: ['first'], pattern: /mozilla/i },
    { tags: ['second'], pattern: /mozilla/i },
  ];
  expect(findTagRule(rules, contribution)).toBe(rules[0]);
});

test('should skip rules not matching the pattern', () => {
  const rules = [
    { tags: ['first'], pattern: /other/i },
    { tags: ['second'], pattern: /mozilla/i },
  ];
  expect(findTagRule(rules, contribution)).toBe(rules[1]);
});

test('should skip rules not matching the date range', () => {
  const rules = [
    {
      tags: ['first'],
      pattern: /mozilla/i,
      dateRange: { startDate: '2023-01-01' },
    },
    { tags: ['second'] },
  ];
  expect(findTagRule(rules, contribution)).toBe(rules[1]);
});

test('should match rules with an open ended date range', () => {
  expect(
    findTagRule(
      [{ tags: ['a'], dateRange: { startDate: '2022-01-01' } }],
      contribution
    )
  ).toBeDefined();
  expect(
    findTagRule(
      [{ tags: ['a'], dateRange: { endDate: '2023-01-01' } }],
      contribution
    )
  ).toBeDefined();
  expect(
    findTagRule(
      [{ tags: ['a'], dateRange: { endDate: '2022-01-01' } }],
      contribution
    )
  ).toBeUndefined();
});

test('should include both ends of the date range', () => {
  const rules = [
    {
      tags: ['a'],
      dateRange: {
        startDate: contribution.createdAt as string,
        endDate: contribution.createdAt as string,
      },
    },
  ];
  expect(findTagRule(rules, contribution)).toBe(rules[0]);
  expect(
    findTagRule(rules, {
      ...contribution,
      createdAt: new Date(contribution.createdAt),
    })
  ).toBe(rules[0]);
});

test('should not match a date range for an invalid date', () => {
  const rules = [{ tags: ['a'], dateRange: {} }];
  expect(
    findTagRule(rules, { ...contribution, createdAt: 'nope' })
  ).toBeUndefined();
});

test('should not match a pattern for a contribution without link', () => {
  const rules = [{ tags: ['a'], pattern: /.*/i }];
  expect(findTagRule(rules, { ...contribution, link: '' })).toBeUndefined();
});

test('should return undefined without rules', () => {
  expect(findTagRule(undefined, contribution)).toBeUndefined();
  expect(findTagRule([], contribution)).toBeUndefined();
});

test('should add tags of the matching rule', () => {
  expect(applyTagRules([{ tags: ['a', 'b'] }], contribution)).toEqual({
    ...contribution,
    tags: ['a', 'b'],
  });
});

test('should replace changed tags', () => {
  expect(
    applyTagRules([{ tags: ['b'] }], { ...contribution, tags: ['a'] })
  ).toEqual({ ...contribution, tags: ['b'] });
});

test('should remove tags if no rule matches', () => {
  const result = applyTagRules([{ tags: ['a'], pattern: /other/i }], {
    ...contribution,
    tags: ['a'],
  });
  expect(result).toEqual(contribution);
  expect('tags' in result).toBe(false);
});

test('should return the same contribution if nothing changed', () => {
  const tagged = { ...contribution, tags: ['a'] };
  expect(applyTagRules([{ tags: ['a'] }], tagged)).toBe(tagged);
  expect(applyTagRules(undefined, contribution)).toBe(contribution);
});

test('should not share the tags array with the rule', () => {
  const rule = { tags: ['a'] };
  expect(applyTagRules([rule], contribution).tags).not.toBe(rule.tags);
});
