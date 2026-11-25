import { z } from 'zod';

import type { Contribution } from './types.js';
import { dateSchema } from './utils.js';

export const dateRangeSchema = z
  .strictObject({
    startDate: dateSchema('startDate').optional(),
    endDate: dateSchema('endDate').optional(),
  })
  .refine(
    ({ startDate, endDate }) =>
      !startDate || !endDate || new Date(startDate) <= new Date(endDate),
    { message: 'startDate must not be after endDate', path: ['endDate'] }
  );

export const tagRuleSchema = z.strictObject({
  tags: z.array(z.string().min(1)).min(1),
  dateRange: dateRangeSchema.optional(),
});

type DateRange = z.output<typeof dateRangeSchema>;

// Only the GitHub source supports a pattern, see github.ts.
export type TagRule = z.output<typeof tagRuleSchema> & { pattern?: RegExp };

function isInDateRange(createdAt: Date | string, dateRange?: DateRange) {
  if (!dateRange) {
    return true;
  }

  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) {
    return false;
  }

  if (dateRange.startDate && time < new Date(dateRange.startDate).getTime()) {
    return false;
  }

  return !dateRange.endDate || time <= new Date(dateRange.endDate).getTime();
}

// A rule with a pattern never matches a contribution without a link (e.g. one
// in a private GitHub repository), even if the pattern matches an empty string.
function matchesPattern(link: string | undefined, pattern?: RegExp) {
  if (!pattern) {
    return true;
  }

  return !!link && pattern.test(link);
}

// Returns the first rule matching the contribution, the order of the rules
// defines their priority.
export function findTagRule<R extends TagRule>(
  rules: R[] = [],
  contribution: Pick<Contribution, 'createdAt' | 'link'>
): R | undefined {
  return rules.find(
    (rule) =>
      isInDateRange(contribution.createdAt, rule.dateRange) &&
      matchesPattern(contribution.link, rule.pattern)
  );
}

function haveSameTags(tagsA: string[], tagsB: unknown) {
  return (
    Array.isArray(tagsB) &&
    tagsA.length === tagsB.length &&
    tagsA.every((tag, index) => tag === tagsB[index])
  );
}

// Sets the tags of the first matching rule and removes stale tags if no rule
// matches anymore. The contribution itself is returned if nothing changed.
export function applyTagRules<C extends Contribution>(
  rules: TagRule[] | undefined,
  contribution: C
): C {
  const tags = findTagRule(rules, contribution)?.tags;
  if (!tags) {
    if (!('tags' in contribution)) {
      return contribution;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tags: _staleTags, ...untagged } = contribution;
    return untagged as C;
  }

  if (haveSameTags(tags, contribution.tags)) {
    return contribution;
  }

  return { ...contribution, tags: [...tags] };
}
