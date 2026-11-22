import { z } from 'zod';

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

function isInDateRange(createdAt, dateRange) {
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
function matchesPattern(link, pattern) {
  if (!pattern) {
    return true;
  }

  return Boolean(link) && pattern.test(link);
}

// Returns the first rule matching the contribution, the order of the rules
// defines their priority.
export function findTagRule(rules = [], contribution) {
  return rules.find(
    (rule) =>
      isInDateRange(contribution.createdAt, rule.dateRange) &&
      matchesPattern(contribution.link, rule.pattern)
  );
}

function haveSameTags(tagsA, tagsB) {
  return (
    Array.isArray(tagsB) &&
    tagsA.length === tagsB.length &&
    tagsA.every((tag, index) => tag === tagsB[index])
  );
}

// Sets the tags of the first matching rule and removes stale tags if no rule
// matches anymore. The contribution itself is returned if nothing changed.
export function applyTagRules(rules, contribution) {
  const tags = findTagRule(rules, contribution)?.tags;
  if (!tags) {
    if (!('tags' in contribution)) {
      return contribution;
    }

    // eslint-disable-next-line no-unused-vars
    const { tags: _staleTags, ...untagged } = contribution;
    return untagged;
  }

  if (haveSameTags(tags, contribution.tags)) {
    return contribution;
  }

  return { ...contribution, tags: [...tags] };
}
