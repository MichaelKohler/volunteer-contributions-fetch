import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { setTimeout as sleep } from 'timers/promises';

import { firstPage, secondPage } from '../fixtures/wiki.js';
import * as wiki from './wiki.js';

vi.mock('timers/promises', () => ({ setTimeout: vi.fn() }));

const config = {
  mediaWiki: {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org/api.php',
    username: 'user',
    stopDate: '2021-12-01',
  },
};

function mockResponse(data) {
  return { ok: true, json: vi.fn().mockResolvedValue(data) };
}

function requestedParams(callIndex) {
  return new URL(fetch.mock.calls[callIndex][0]).searchParams;
}

beforeEach(() => {
  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce(mockResponse(firstPage))
    .mockResolvedValueOnce(mockResponse(secondPage));
  vi.stubGlobal('fetch', mockedFetch);
});

afterEach(() => {
  vi.resetAllMocks();
});

test('should validate valid config', () => {
  const result = wiki.mediaWikiSchema.parse(config.mediaWiki);
  expect(result).toBeDefined();
});

test('should validate config - legacy feedcontributions baseUrl', () => {
  const result = wiki.mediaWikiSchema.parse({
    ...config.mediaWiki,
    baseUrl: 'https://wiki.mozilla.org/api.php?action=feedcontributions',
  });
  expect(result).toBeDefined();
});

test('should validate config - missing completely', () => {
  const emptyConfig = {};
  expect(() => wiki.mediaWikiSchema.parse(emptyConfig)).toThrow();
});

test('should validate config - disabled without other values', () => {
  expect(wiki.mediaWikiSchema.parse({ enabled: false })).toEqual({
    enabled: false,
  });
});

test('should validate config - enabled without other values', () => {
  expect(() => wiki.mediaWikiSchema.parse({ enabled: true })).toThrow();
});

test('should validate config - missing baseUrl', () => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: '2021-12-01',
  };

  expect(() => wiki.mediaWikiSchema.parse(failConfig)).toThrow();
});

test('should validate config - invalid baseUrl', () => {
  const failConfig = {
    ...config.mediaWiki,
    baseUrl: 'wiki.mozilla.org/api.php',
  };

  expect(() => wiki.mediaWikiSchema.parse(failConfig)).toThrow();
});

test('should validate config - missing username', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org/api.php',
    stopDate: '2021-12-01',
  };

  expect(() => wiki.mediaWikiSchema.parse(failConfig)).toThrow();
});

test('should validate config - missing stopDate', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org/api.php',
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

test('should fetch all pages', async () => {
  const contributions = await wiki.gather(config);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(contributions.length).toBe(3);
});

test('should request usercontribs up to the stop date', async () => {
  await wiki.gather(config);

  const params = requestedParams(0);
  expect(params.get('action')).toBe('query');
  expect(params.get('list')).toBe('usercontribs');
  expect(params.get('ucuser')).toBe('user');
  expect(params.get('uclimit')).toBe('max');
  expect(params.get('ucend')).toBe('2021-12-01T00:00:00.000Z');
  expect(params.get('meta')).toBe('siteinfo');
});

test('should pass on continuation parameters', async () => {
  await wiki.gather(config);

  const params = requestedParams(1);
  expect(params.get('uccontinue')).toBe(firstPage.continue.uccontinue);
  expect(params.get('continue')).toBe(firstPage.continue.continue);
  expect(params.get('ucuser')).toBe('user');
  expect(params.has('meta')).toBe(false);
});

test('should ignore the query string of a legacy baseUrl', async () => {
  await wiki.gather({
    mediaWiki: {
      ...config.mediaWiki,
      baseUrl: 'https://wiki.mozilla.org/api.php?action=feedcontributions',
    },
  });

  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.pathname).toBe('/api.php');
  expect(url.searchParams.get('action')).toBe('query');
});

test('should keep fetching until there is no continuation', async () => {
  // More edits than fit in one page, all within the same month.
  const page = (revid, more) => ({
    ...(more
      ? { continue: { uccontinue: `x|${revid}`, continue: '-||' } }
      : {}),
    query: {
      ...(revid === 3 ? { general: firstPage.query.general } : {}),
      usercontribs: [
        { revid, title: 'Page', timestamp: '2022-01-15T00:00:00Z' },
      ],
    },
  });

  fetch.mockReset();
  fetch
    .mockResolvedValueOnce(mockResponse(page(3, true)))
    .mockResolvedValueOnce(mockResponse(page(2, true)))
    .mockResolvedValueOnce(mockResponse(page(1, false)));

  const contributions = await wiki.gather(config);

  expect(fetch).toHaveBeenCalledTimes(3);
  expect(contributions.map(({ link }) => link)).toStrictEqual([
    'https://wiki.mozilla.org/index.php?title=Page&diff=3',
    'https://wiki.mozilla.org/index.php?title=Page&diff=2',
    'https://wiki.mozilla.org/index.php?title=Page&diff=1',
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
  expect(fetch).not.toHaveBeenCalled();
});

test('should not fetch if disabled - by leaving off config value', async () => {
  const contributions = await wiki.gather({});

  expect(contributions.length).toBe(0);
});

test('should format', async () => {
  const contributions = await wiki.gather(config);

  expect(contributions).toStrictEqual([
    {
      createdAt: new Date('2022-01-02'),
      description: 'Edited Page B',
      link: 'https://wiki.mozilla.org/index.php?title=Page_B&diff=1002',
      type: 'Wiki Edit',
      source: 'wiki',
    },
    {
      createdAt: new Date('2022-01-01'),
      description: 'Edited PageA',
      link: 'https://wiki.mozilla.org/index.php?title=PageA&diff=1001',
      type: 'Wiki Edit',
      source: 'wiki',
    },
    {
      createdAt: new Date('2021-12-01'),
      description: 'Edited Reps/Peers & Mentors?',
      link: 'https://wiki.mozilla.org/index.php?title=Reps/Peers_%26_Mentors%3F&diff=900',
      type: 'Wiki Edit',
      source: 'wiki',
    },
  ]);
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

test('should throw if the API returns an error', async () => {
  fetch.mockReset();
  fetch.mockResolvedValueOnce(
    mockResponse({
      error: { code: 'baduser_ucuser', info: 'Invalid value for ucuser.' },
    })
  );

  await expect(wiki.gather(config)).rejects.toThrow(
    'baduser_ucuser - Invalid value for ucuser.'
  );
});

test('should encode username in URL', async () => {
  const specialConfig = {
    mediaWiki: {
      ...config.mediaWiki,
      username: 'Jane Doe&co',
    },
  };

  await wiki.gather(specialConfig);

  expect(requestedParams(0).get('ucuser')).toBe('Jane Doe&co');
  expect(fetch.mock.calls[0][0].toString()).toContain('ucuser=Jane+Doe%26co');
});
