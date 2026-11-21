import { z } from 'zod';

// Sources loop backwards in time until they reach the stop date. An unparseable
// date (e.g. '2025-13-01') makes every comparison false, so they never stop.
export const stopDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'stopDate must be a valid date',
  });

export function getPadded(number) {
  if (number < 10) {
    return `0${number}`;
  }

  return `${number}`;
}

// Existing contributions are not guaranteed to be sorted (they can be passed
// in by the caller), so we look for the newest entry instead of the first one.
export function findLatest(contributions, predicate) {
  return contributions.filter(predicate).reduce((latest, contribution) => {
    if (
      !latest ||
      new Date(contribution.createdAt) > new Date(latest.createdAt)
    ) {
      return contribution;
    }

    return latest;
  }, undefined);
}
