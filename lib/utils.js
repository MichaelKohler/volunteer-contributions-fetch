import { z } from 'zod';

// Sources loop backwards in time until they reach the stop date. An unparseable
// date (e.g. '2025-13-01') makes every comparison false, so they never stop.
export function dateSchema(field) {
  return z
    .string()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: `${field} must be a valid date`,
    });
}

export const stopDateSchema = dateSchema('stopDate');

// Compiles the value into a case-insensitive regular expression.
export function regexSchema(field) {
  return z.string().transform((value, ctx) => {
    try {
      return new RegExp(value, 'i');
    } catch {
      ctx.issues.push({
        code: 'custom',
        message: `${field} must be a valid regular expression`,
        input: value,
      });
      return z.NEVER;
    }
  });
}

export const baseUrlSchema = z.url().refine((value) => !value.endsWith('/'), {
  message: 'baseUrl must not end with a trailing slash',
});

export function sourceSchema(enabledSchema) {
  return z
    .looseObject({ enabled: z.boolean() })
    .pipe(
      z.discriminatedUnion('enabled', [
        z.looseObject({ enabled: z.literal(false) }),
        enabledSchema,
      ])
    );
}

export function getPadded(number) {
  if (number < 10) {
    return `0${number}`;
  }

  return `${number}`;
}

// Existing contributions are not guaranteed to be sorted (they can be passed
// in by the caller), so we look for the newest entry instead of the first one.
// Entries with an unparseable date are skipped: once one became "latest",
// every comparison against it would be false and no new contributions would
// ever be fetched.
export function findLatest(contributions, predicate) {
  return contributions.filter(predicate).reduce((latest, contribution) => {
    const time = new Date(contribution.createdAt).getTime();
    if (Number.isNaN(time)) {
      return latest;
    }

    if (!latest || time > new Date(latest.createdAt).getTime()) {
      return contribution;
    }

    return latest;
  }, undefined);
}
