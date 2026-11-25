import { expect, test } from 'vitest';

import {
  compareContributions,
  ensureUniqueContributions,
  haveSameContributions,
} from './contributions.js';
import type { Contribution, FetchedContribution } from './types.js';

const contributions: [
  FetchedContribution,
  FetchedContribution,
  FetchedContribution,
] = [
  {
    createdAt: new Date('2022-12-08T22:43:17.000Z'),
    description: 'fix: remove unapproved sv-SE Gutenberg sentences',
    link: 'https://github.com/common-voice/sentence-collector/pull/656',
    type: 'Created PR',
    source: 'github-pr-created',
  },
  {
    createdAt: new Date('2022-12-05T18:55:04.129Z'),
    description:
      'High amount of low quality submissions in Sentence Collector makes reviewing boring',
    link: 'https://discourse.mozilla.org/t/high-amount-of-low-quality-submissions-in-sentence-collector-makes-reviewing-boring/108368/4',
    type: 'Posted on Discourse Topic',
    source: 'discourse-posts',
  },
  {
    createdAt: new Date('2022-12-05T18:55:04.129Z'),
    description:
      'High amount of low quality submissions in Sentence Collector makes reviewing boring',
    link: 'https://discourse.mozilla.org/t/high-amount-of-low-quality-submissions-in-sentence-collector-makes-reviewing-boring/108368/4',
    type: 'Posted on Discourse Topic',
    source: 'discourse-posts',
  },
];

const alreadyUniqueContributions: FetchedContribution[] = [
  contributions[0],
  contributions[1],
];

test('should not remove anything if there was nothing to do', async () => {
  const result = ensureUniqueContributions(alreadyUniqueContributions);
  expect(result).toStrictEqual(alreadyUniqueContributions);
});

test('should ensure uniqueness', async () => {
  const result = ensureUniqueContributions(contributions);
  expect(result).toStrictEqual(alreadyUniqueContributions);
  expect(result.length).toBe(2);
});

test('should keep contributions that only differ by link', async () => {
  const otherPost = {
    ...contributions[1],
    link: 'https://discourse.mozilla.org/t/high-amount-of-low-quality-submissions-in-sentence-collector-makes-reviewing-boring/108368/5',
  };
  const input = [contributions[1], otherPost];
  const result = ensureUniqueContributions(input);
  expect(result).toStrictEqual(input);
});

test('should keep contributions that only differ by description', async () => {
  const first = {
    createdAt: new Date('2022-12-05T00:00:00.000Z'),
    description: 'Event A',
    link: 'https://community.mozilla.org/en/events/',
    type: 'Participated in an event',
    source: 'community-portal-events',
  };
  const second = { ...first, description: 'Event B' };
  const result = ensureUniqueContributions([first, second]);
  expect(result).toStrictEqual([first, second]);
});

test('should not confuse separators inside fields', async () => {
  const first = { ...contributions[1], type: 'a|b', link: 'c' };
  const second = { ...contributions[1], type: 'a', link: 'b|c' };
  const result = ensureUniqueContributions([first, second]);
  expect(result).toStrictEqual([first, second]);
});

test('should treat string and Date createdAt as equal', async () => {
  const serialized = {
    ...contributions[1],
    createdAt: contributions[1].createdAt.toISOString(),
  };
  const result = ensureUniqueContributions([serialized, contributions[1]]);
  expect(result).toStrictEqual([serialized]);
});

test('should consider identical contributions the same', async () => {
  expect(
    haveSameContributions(alreadyUniqueContributions, [
      ...alreadyUniqueContributions,
    ])
  ).toBe(true);
});

test('should ignore entry order and key order when comparing', async () => {
  const reordered = [
    { ...contributions[1] },
    Object.fromEntries(
      Object.entries(contributions[0]).reverse()
    ) as Contribution,
  ];
  expect(haveSameContributions(alreadyUniqueContributions, reordered)).toBe(
    true
  );
});

test('should treat a Date and its ISO string as the same', async () => {
  const stored = JSON.parse(JSON.stringify(alreadyUniqueContributions));
  expect(haveSameContributions(alreadyUniqueContributions, stored)).toBe(true);
});

test('should detect changed contributions', async () => {
  const changed: Contribution[] = [
    contributions[0],
    { ...contributions[1], description: 'changed' },
  ];
  expect(haveSameContributions(alreadyUniqueContributions, changed)).toBe(
    false
  );
});

test('should detect different lengths', async () => {
  expect(
    haveSameContributions(alreadyUniqueContributions, [contributions[0]])
  ).toBe(false);
});

test('should respect duplicate counts', async () => {
  const [a, b] = contributions;
  expect(haveSameContributions([a, a, b], [a, b, b])).toBe(false);
});

test('should sort newest first', async () => {
  const sorted = [
    { link: '1', createdAt: '2024-01-01T00:00:00.000Z' },
    { link: '2', createdAt: new Date('2024-01-03T00:00:00.000Z') },
    { link: '3', createdAt: '2024-01-02T00:00:00.000Z' },
  ].sort(compareContributions);
  expect(sorted.map(({ link }) => link)).toEqual(['2', '3', '1']);
});

test('should sort invalid dates last and consistently', async () => {
  const contributions = [
    { link: 'invalid-1', createdAt: 'not a date' },
    { link: 'new', createdAt: '2024-01-03T00:00:00.000Z' },
    { link: 'missing' },
    { link: 'old', createdAt: '2024-01-01T00:00:00.000Z' },
    { link: 'invalid-2', createdAt: 'also not a date' },
    { link: 'middle', createdAt: '2024-01-02T00:00:00.000Z' },
  ] as Pick<Contribution, 'link' | 'createdAt'>[];
  const expected = [
    'new',
    'middle',
    'old',
    'invalid-1',
    'missing',
    'invalid-2',
  ];
  expect(
    contributions.sort(compareContributions).map(({ link }) => link)
  ).toEqual(expected);
});
