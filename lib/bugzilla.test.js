import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { gather, bugzillaSchema } from './bugzilla.js';

const config = {
  bugzilla: {
    enabled: true,
    baseUrl: 'https://bugzilla.mozilla.org',
    username: 'user',
    stopDate: new Date('2021-11-01'),
  },
};

beforeEach(() => {
  const firstBugsPage = {
    bugs: new Array(500).fill(0).map(() => ({
      created_at: new Date('2022-04-13'),
      summary: 'Summary',
      // This would be the bug ID which would be different, but enough for testing purposes
      id: 1,
    })),
  };

  const secondBugsPage = {
    bugs: [
      {
        created_at: new Date('2022-04-13'),
        summary: 'SecondSummary',
        id: 1,
      },
    ],
  };

  const comments = {
    bugs: {
      // This would be the bug ID which would be different, but enough for testing purposes
      1: {
        comments: [
          {
            creation_time: new Date('2022-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 0,
          },
          {
            creation_time: new Date('2022-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 1,
          },
          {
            creation_time: new Date('2022-04-13'),
            creator: 'WILL_BE_FILTERED_OUT',
            bug_id: 1,
            count: 2,
          },
        ],
      },
    },
  };

  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(firstBugsPage),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(secondBugsPage),
    })
    .mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(comments) });

  vi.stubGlobal('fetch', mockedFetch);
});

afterEach(() => {
  vi.resetAllMocks();
});

test('Bugzilla schema - valid config', () => {
  const validConfig = {
    enabled: true,
    baseUrl: 'https://bugzilla.test',
    username: 'testuser',
    stopDate: '2023-01-01',
    types: {
      createdType: 'Created a Test Bug',
      commentedType: 'Commented on a Test Bug',
    },
  };
  const result = bugzillaSchema.parse(validConfig);
  expect(result).toBeDefined();
});

test('Bugzilla schema - invalid config', () => {
  const invalidConfig = {
    enabled: true,
    baseUrl: 'https://example.com',
    username: '',
    stopDate: '2024-01-01',
  };
  expect(() => bugzillaSchema.parse(invalidConfig)).toThrow();
});

test('should fetch', async () => {
  const contributions = await gather(config);
  expect(contributions.length).toBe((500 + 1) * 2);
});

test('should not fetch if disabled - by enable property', async () => {
  const specificTypeConfig = {
    bugzilla: {
      ...config.bugzilla,
      enabled: false,
    },
  };

  const contributions = await gather(specificTypeConfig);

  expect(contributions.length).toBe(0);
});

test('should not fetch if disabled - by leaving off config value', async () => {
  const contributions = await gather({});

  expect(contributions.length).toBe(0);
});

test('should format', async () => {
  const contributions = await gather(config);

  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2022-04-13'),
    description: 'SecondSummary',
    link: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1#c0',
    type: 'Created a Bug Report',
    source: 'bugzilla-created',
  });
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date('2022-04-13'),
    description: 'SecondSummary',
    link: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1#c1',
    type: 'Commented on a Bug Report',
    source: 'bugzilla-comments',
  });
});

test('should use configured baseUrl for links', async () => {
  const customConfig = {
    bugzilla: {
      ...config.bugzilla,
      baseUrl: 'https://bugzilla.example.com',
    },
  };

  const contributions = await gather(customConfig);

  expect(contributions[0].link).toBe(
    'https://bugzilla.example.com/show_bug.cgi?id=1#c0'
  );
});

test('should encode username in search query', async () => {
  const plusConfig = {
    bugzilla: {
      ...config.bugzilla,
      username: 'me+bmo@x.org',
    },
  };

  await gather(plusConfig);

  expect(fetch.mock.calls[0][0]).toContain('commenter:me%2Bbmo%40x.org&');
});

test('should use the same stop date in time zones behind UTC', async () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';

  try {
    await gather(config);

    expect(fetch.mock.calls[0][0]).toContain('last_change_time=2021-11-01');
  } finally {
    process.env.TZ = originalTZ;
  }
});

test('should format with custom types', async () => {
  const specificTypeConfig = {
    bugzilla: {
      ...config.bugzilla,
      types: {
        createdType: 'CREATED!',
        commentedType: 'COMMENTED!',
      },
    },
  };

  const contributions = await gather(specificTypeConfig);

  expect(contributions[0].type).toBe(
    specificTypeConfig.bugzilla.types.createdType
  );
  expect(contributions[1].type).toBe(
    specificTypeConfig.bugzilla.types.commentedType
  );
});

test('should ignore comments older than stopDate', async () => {
  const bugsPage = {
    bugs: [
      {
        created_at: new Date('2022-04-13'),
        summary: 'Summary',
        id: 1,
      },
    ],
  };

  const oldComments = {
    bugs: {
      1: {
        comments: [
          {
            creation_time: new Date('1999-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 0,
          },
          {
            creation_time: new Date('1999-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 1,
          },
        ],
      },
    },
  };

  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(bugsPage),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(oldComments),
    });
  vi.stubGlobal('fetch', mockedFetch);

  const contributions = await gather(config);
  expect(contributions.length).toBe(0);
});

test('should throw if fetching bugs fails', async () => {
  fetch.mockReset();
  fetch.mockResolvedValueOnce({ ok: false, status: 500 });

  await expect(gather(config)).rejects.toThrow(
    /Bugzilla request to https:\/\/bugzilla\.mozilla\.org\/rest\/bug\?.* failed with status 500/
  );
});

test('should throw if fetching comments fails', async () => {
  const bugsPage = {
    bugs: [{ created_at: new Date('2022-04-13'), summary: 'Summary', id: 1 }],
  };
  fetch.mockReset();
  fetch
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(bugsPage),
    })
    .mockResolvedValueOnce({ ok: false, status: 502 });

  await expect(gather(config)).rejects.toThrow(
    'Bugzilla request to https://bugzilla.mozilla.org/rest/bug/1/comment failed with status 502'
  );
});
