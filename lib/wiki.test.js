import axios from 'axios';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { firstMonth, secondMonth } from '../fixtures/wiki.js';
import * as wiki from './wiki.js';

const config = {
  mediaWiki: {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org',
    username: 'user',
    stopDate: new Date('2021-11-01'),
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2022-01-03'));

  vi.spyOn(axios, 'get')
    .mockResolvedValueOnce({ data: firstMonth })
    .mockResolvedValueOnce({ data: secondMonth });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('should validate config - missing completely', () => {
  const emptyConfig = {};
  expect(() => wiki.validate(emptyConfig)).not.toThrow();
});

test('should validate config - missing baseUrl', () => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: new Date(),
  };

  expect(() => wiki.validate(failConfig)).toThrow();
});

test('should validate config - missing username', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    stopDate: new Date(),
  };

  expect(() => wiki.validate(failConfig)).toThrow();
});

test('should validate config - missing stopDate', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    username: 'user',
  };

  expect(() => wiki.validate(failConfig)).toThrow();
});

test('should fetch', async () => {
  const contributions = await wiki.gather(config);
  expect(contributions.length).toBe(3);
});

test('should not fetch if disabled - by enable property', async () => {
  const specificTypeConfig = {
    mediaWiki: {
      ...config.mediaWiki,
      enabled: false,
    },
  };

  const contributions = await wiki.gather(specificTypeConfig);

  expect(contributions.length).toBe(0);
});

test('should not fetch if disabled - by leaving off config value', async () => {
  const contributions = await wiki.gather({});

  expect(contributions.length).toBe(0);
});

test('should format', async () => {
  const contributions = await wiki.gather(config);

  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2022-01-01'),
    description: 'Edited PageA',
    link: 'LinkA',
    type: 'Wiki Edit',
    source: 'wiki',
  });
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date('2022-01-02'),
    description: 'Edited PageB',
    link: 'LinkB',
    type: 'Wiki Edit',
    source: 'wiki',
  });
  expect(contributions[2]).toStrictEqual({
    createdAt: new Date('2021-12-01'),
    description: 'Edited PageC',
    link: 'LinkC',
    type: 'Wiki Edit',
    source: 'wiki',
  });
});

test('should format with custom types', async () => {
  const specificTypeConfig = {
    mediaWiki: {
      ...config.mediaWiki,
      editType: 'EDITED!',
    },
  };

  const contributions = await wiki.gather(specificTypeConfig);

  expect(contributions[0].type).toBe(specificTypeConfig.mediaWiki.editType);
});
