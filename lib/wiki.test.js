import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { firstMonth, secondMonth } from '../fixtures/wiki.js';
import * as wiki from './wiki.js';

const config = {
  mediaWiki: {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org',
    username: 'user',
    stopDate: new Date('2021-12-01'),
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2022-01-03'));

  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(firstMonth),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(secondMonth),
    });
  vi.stubGlobal('fetch', mockedFetch);
});

afterEach(() => {
  vi.resetAllMocks();
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

test('should fetch the same months in time zones behind UTC', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';

  try {
    const contributions = await wiki.gather(config);

    expect(contributions.length).toBe(3);
    expect(fetch.mock.calls.map(([url]) => url)).toStrictEqual([
      `${config.mediaWiki.baseUrl}&user=user&year=2022&month=1`,
      `${config.mediaWiki.baseUrl}&user=user&year=2021&month=12`,
    ]);
  } finally {
    process.env.TZ = originalTZ;
  }
});

test('should fetch the month containing the stop date', async () => {
  const midMonthConfig = {
    mediaWiki: {
      ...config.mediaWiki,
      stopDate: new Date('2021-12-15'),
    },
  };

  const contributions = await wiki.gather(midMonthConfig);

  expect(fetch.mock.calls.map(([url]) => url)).toStrictEqual([
    `${config.mediaWiki.baseUrl}&user=user&year=2022&month=1`,
    `${config.mediaWiki.baseUrl}&user=user&year=2021&month=12`,
  ]);
  // PageC was edited on 2021-12-01, before the stop date
  expect(contributions.map(({ description }) => description)).toStrictEqual([
    'Edited PageA',
    'Edited PageB',
  ]);
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

test('should throw if a request fails', async () => {
  fetch.mockReset();
  fetch.mockResolvedValueOnce({ ok: false, status: 503 });

  await expect(wiki.gather(config)).rejects.toThrow('failed with status 503');
});

test('should encode username in URL', async () => {
  const specialConfig = {
    mediaWiki: {
      ...config.mediaWiki,
      username: 'Jane Doe&co',
    },
  };

  await wiki.gather(specialConfig);

  expect(fetch.mock.calls[0][0]).toContain('&user=Jane%20Doe%26co&');
});
