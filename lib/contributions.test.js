import { expect, test } from 'vitest';

import { ensureUniqueContributions } from './contributions.js';

const contributions = [
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

const alreadyUniqueContributions = [contributions[0], contributions[1]];

test('should not remove anything if there was nothing to do', async () => {
  const result = ensureUniqueContributions(alreadyUniqueContributions);
  expect(result).toStrictEqual(alreadyUniqueContributions);
});

test('should ensure uniqueness', async () => {
  const result = ensureUniqueContributions(contributions);
  expect(result).toStrictEqual(alreadyUniqueContributions);
  expect(result.length).toBe(2);
});
