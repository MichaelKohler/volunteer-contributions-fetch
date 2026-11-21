import { expect, test } from 'vitest';

import { validateConfig } from './validator.js';

const config = {
  outputFile: 'file',
};

test('should validate config - all ok', () => {
  expect(() => validateConfig(config)).not.toThrow();
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
      baseUrl: 'https://wiki.mozilla.org',
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
