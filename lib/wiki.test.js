import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { setTimeout as sleep } from 'timers/promises';

import { firstMonth, secondMonth } from '../fixtures/wiki.js';
import * as wiki from './wiki.js';

vi.mock('timers/promises', () => ({ setTimeout: vi.fn() }));

const config = {
  mediaWiki: {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org/api.php?action=feedcontributions',
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

test('should validate valid config', () => {
  const result = wiki.mediaWikiSchema.parse({
    ...config.mediaWiki,
    stopDate: '2021-12-01',
  });
  expect(result).toBeDefined();
});

test('should validate config - missing completely', () => {
  const emptyConfig = {};
  expect(() => wiki.mediaWikiSchema.parse(emptyConfig)).toThrow();
});

test('should validate config - missing baseUrl', () => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: '2021-12-01',
  };

  expect(() => wiki.mediaWikiSchema.parse(failConfig)).toThrow();
});

test('should validate config - baseUrl without query string', () => {
  const failConfig = {
    ...config.mediaWiki,
    baseUrl: 'https://wiki.mozilla.org/api.php',
    stopDate: '2021-12-01',
  };

  expect(() => wiki.mediaWikiSchema.parse(failConfig)).toThrow(/query string/);
});

test('should validate config - missing username', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org/api.php?action=feedcontributions',
    stopDate: '2021-12-01',
  };

  expect(() => wiki.mediaWikiSchema.parse(failConfig)).toThrow();
});

test('should validate config - missing stopDate', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org/api.php?action=feedcontributions',
    username: 'user',
  };

  expect(() => wiki.mediaWikiSchema.parse(failConfig)).toThrow();
});

test('should pass a timeout signal to every request', async () => {
  await wiki.gather(config);
  expect(fetch).toHaveBeenCalled();
  for (const [, options] of fetch.mock.calls) {
    expect(options.signal).toBeInstanceOf(AbortSignal);
  }
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

test('should keep edits near the month boundary in the wiki time zone', async () => {
  // Wiki in UTC+1: an edit on 2021-12-31 23:30 UTC belongs to January for the
  // wiki, and the January feed also contains older edits from December.
  const item = (title, pubDate) => `
    <item>
      <title>${title}</title>
      <link>Link${title}</link>
      <pubDate>${pubDate}</pubDate>
    </item>`;
  const feed = (...items) => `<rss><channel>${items.join('')}</channel></rss>`;

  fetch.mockReset();
  fetch
    .mockResolvedValueOnce({
      ok: true,
      text: vi
        .fn()
        .mockResolvedValue(
          feed(
            item('PageA', 'Sat, 01 Jan 2022 00:00:00 GMT'),
            item('PageBoundary', 'Fri, 31 Dec 2021 23:30:00 GMT'),
            item('PageC', 'Wed, 01 Dec 2021 00:00:00 GMT')
          )
        ),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: vi
        .fn()
        .mockResolvedValue(
          feed(item('PageC', 'Wed, 01 Dec 2021 00:00:00 GMT'))
        ),
    });

  const contributions = await wiki.gather(config);

  expect(contributions.map(({ description }) => description)).toStrictEqual([
    'Edited PageA',
    'Edited PageBoundary',
    'Edited PageC',
  ]);
});

test('should wait between requests', async () => {
  await wiki.gather(config);

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledWith(wiki.REQUEST_DELAY_MS);
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
