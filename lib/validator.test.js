import { expect, test } from 'vitest';

import { validateConfig } from './validator.js';

const config = {
  outputFile: 'file',
};

test('should validate config - all ok', () => {
  expect(() => validateConfig(config)).not.toThrow();
});

test('should accept tag rules for every source', () => {
  const tagRules = [
    { tags: ['employed'], dateRange: { startDate: '2020-03-01' } },
    { tags: ['volunteer'] },
  ];
  const tagConfig = {
    bugzilla: {
      enabled: true,
      baseUrl: 'https://bugzilla.example.com',
      username: 'user',
      stopDate: '2020-01-01',
      tagRules,
    },
    communityPortal: {
      enabled: true,
      baseUrl: 'https://community.example.com',
      username: 'user',
      tagRules,
    },
    discourse: {
      enabled: true,
      baseUrl: 'https://discourse.example.com',
      username: 'user',
      tagRules,
    },
    github: {
      enabled: true,
      username: 'user',
      stopDate: '2020-01-01',
      filter: 'mozilla',
      tagRules: [{ pattern: 'mozilla/', tags: ['employed'] }],
    },
    mediaWiki: {
      enabled: true,
      baseUrl: 'https://wiki.example.com/api.php',
      username: 'user',
      stopDate: '2020-01-01',
      tagRules,
    },
    osm: {
      enabled: true,
      displayName: 'user',
      stopDate: '2020-01-01',
      tagRules,
    },
  };

  const result = validateConfig(tagConfig);
  for (const key of Object.keys(tagConfig)) {
    expect(result[key].tagRules).toHaveLength(key === 'github' ? 1 : 2);
  }
});

test('should throw when a non-GitHub tag rule has a pattern', () => {
  const failConfig = {
    osm: {
      enabled: true,
      displayName: 'user',
      stopDate: '2020-01-01',
      tagRules: [{ pattern: 'foo', tags: ['a'] }],
    },
  };
  expect(() => validateConfig(failConfig)).toThrow(/pattern/);
});

test('should throw when missing config', () => {
  expect(() => validateConfig()).toThrow();
});

test('should throw when community portal validation fails', () => {
  const failConfig = {
    communityPortal: {},
  };
  expect(() => validateConfig(failConfig)).toThrow();
});

test('should throw when discourse validation fails', () => {
  const failConfig = {
    discourse: {},
  };
  expect(() => validateConfig(failConfig)).toThrow();
});

test('should throw when github validation fails', () => {
  const failConfig = {
    github: {},
  };
  expect(() => validateConfig(failConfig)).toThrow();
});

test('should throw when osm validation fails', () => {
  const failConfig = {
    osm: {},
  };
  expect(() => validateConfig(failConfig)).toThrow();
});

test('should throw when wiki validation fails', () => {
  const failConfig = {
    mediaWiki: {},
  };
  expect(() => validateConfig(failConfig)).toThrow();
});

test('should throw when config contains unknown keys', () => {
  const failConfig = {
    mediawiki: {},
  };
  expect(() => validateConfig(failConfig)).toThrow(/mediawiki/);
});

test('should throw when a source config contains unknown keys', () => {
  const failConfig = {
    discourse: {
      enabled: true,
      baseUrl: 'https://discourse.mozilla.org',
      username: 'user',
      keepDeletedPosts: true,
    },
  };
  expect(() => validateConfig(failConfig)).toThrow(/keepDeletedPosts/);
});

test('should throw when source types contain unknown keys', () => {
  const failConfig = {
    github: {
      enabled: true,
      username: 'user',
      stopDate: '2022-01-01',
      filter: '',
      types: { comment: 'COMMENTED!' },
    },
  };
  expect(() => validateConfig(failConfig)).toThrow(/"comment"/);
});

test('should throw when stopDate is not a valid date', () => {
  const failConfig = {
    mediaWiki: {
      enabled: true,
      baseUrl: 'https://wiki.mozilla.org/api.php?action=feedcontributions',
      username: 'user',
      stopDate: '2025-13-01',
    },
  };
  expect(() => validateConfig(failConfig)).toThrow(/stopDate/);
});

test('should return the parsed config with defaults applied', () => {
  const result = validateConfig({
    github: {
      enabled: true,
      username: 'user',
      stopDate: '2022-01-01',
      filter: '',
      types: { commented: 'COMMENTED!' },
    },
  });
  expect(result.github).toMatchObject({
    allowPrivate: false,
    commentsEnabled: true,
    commitsEnabled: true,
    issuesEnabled: true,
    reviewsEnabled: true,
    delayMsPerRequest: 2000,
    types: { commented: 'COMMENTED!' },
  });
});
