import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as communityPortal from './community-portal.js';
import * as discourse from './discourse.js';
import * as github from './github.js';
import * as wiki from './wiki.js';

import { validateConfig } from './validator.js';

const config = {
  outputFile: 'file',
};

beforeEach(() => {
  vi.spyOn(communityPortal, 'validate');
  vi.spyOn(discourse, 'validate');
  vi.spyOn(github, 'validate');
  vi.spyOn(wiki, 'validate');
});

afterEach(() => {
  vi.resetAllMocks();
});

test('should validate config - all ok', () => {
  expect(() => validateConfig(config)).not.toThrow();
});

test('should throw when missing config', () => {
  expect(() => validateConfig()).toThrow();
});

test('should throw when community portal validation fails', () => {
  communityPortal.validate.mockImplementation(() => {
    throw new Error('oh no');
  });
  expect(() => validateConfig(config)).toThrow();
});

test('should throw when discourse validation fails', () => {
  discourse.validate.mockImplementation(() => {
    throw new Error('oh no');
  });
  expect(() => validateConfig(config)).toThrow();
});

test('should throw when github validation fails', () => {
  github.validate.mockImplementation(() => {
    throw new Error('oh no');
  });
  expect(() => validateConfig(config)).toThrow();
});

test('should throw when wiki validation fails', () => {
  wiki.validate.mockImplementation(() => {
    throw new Error('oh no');
  });
  expect(() => validateConfig(config)).toThrow();
});
