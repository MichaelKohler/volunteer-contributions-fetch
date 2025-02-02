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
