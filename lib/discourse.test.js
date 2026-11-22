import { setTimeout as sleep } from 'timers/promises';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { gather, discourseSchema } from './discourse.js';

vi.mock('timers/promises', () => ({ setTimeout: vi.fn() }));

const TOPICS = {
  topic_list: {
    topics: new Array(30).fill(0).map((_, index) => ({
      created_at: new Date('2020-04-13'),
      title: `Topic ${index}`,
      slug: `slug-${index}`,
      id: index,
    })),
  },
};

const TOPICS_SMALL = {
  topic_list: {
    topics: [
      {
        created_at: new Date('2020-04-13'),
        title: 'Topic 1',
        slug: 'slug-1',
        id: 1,
      },
    ],
  },
};

const TOPICS_EMPTY = {
  topic_list: {
    topics: [],
  },
};

const POSTS = {
  user_actions: new Array(30).fill(0).map((_, index) => ({
    created_at: new Date('2020-04-13'),
    title: `Post ${index}`,
    slug: `slug-${index}`,
    topic_id: index,
    post_id: 1,
    post_number: 1,
  })),
};

const POSTS_SMALL = {
  user_actions: [
    {
      created_at: new Date('2020-04-13'),
      title: 'Post 1',
      slug: 'slug-1',
      topic_id: 1,
      post_id: 1,
      post_number: 1,
    },
  ],
};

const config = {
  discourse: {
    enabled: true,
    baseUrl: 'https://discourse.mozilla.org',
    username: 'user',
    delayMsPerRequest: 1234,
  },
};

beforeEach(() => {
  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(TOPICS),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(TOPICS_SMALL),
    })
    .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue(POSTS) })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(POSTS_SMALL),
    });

  vi.stubGlobal('fetch', mockedFetch);
});

afterEach(() => {
  vi.resetAllMocks();
});

test('Discourse schema - valid config', () => {
  const validConfig = {
    enabled: true,
    baseUrl: 'https://discourse.test',
    username: 'testuser',
  };
  const result = discourseSchema.parse(validConfig);
  expect(result).toBeDefined();
  expect(result.delayMsPerRequest).toBe(500);
});

test('Discourse schema - disabled without other values', () => {
  expect(discourseSchema.parse({ enabled: false })).toEqual({ enabled: false });
});

test('Discourse schema - enabled without other values', () => {
  expect(() => discourseSchema.parse({ enabled: true })).toThrow();
});

test('Discourse schema - invalid config', () => {
  const invalidConfig = {
    enabled: true,
    baseUrl: '',
    username: 'testuser',
  };
  expect(() => discourseSchema.parse(invalidConfig)).toThrow();
});

test('should pass a timeout signal to every request', async () => {
  await gather(config);
  expect(fetch).toHaveBeenCalled();
  for (const [, options] of fetch.mock.calls) {
    expect(options.signal).toBeInstanceOf(AbortSignal);
  }
});

test('should wait between paginated requests', async () => {
  await gather(config);

  // Two pages each for topics and posts: one wait before each second page.
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(sleep).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(1234);
});

test('should not wait when delayMsPerRequest is 0', async () => {
  await gather({ discourse: { ...config.discourse, delayMsPerRequest: 0 } });

  expect(fetch).toHaveBeenCalledTimes(4);
  expect(sleep).not.toHaveBeenCalled();
});

test('should not wait when there is only one page', async () => {
  fetch.mockReset();
  fetch
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(TOPICS_SMALL),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(POSTS_SMALL),
    });

  await gather(config);

  expect(sleep).not.toHaveBeenCalled();
});

test('should fetch', async () => {
  const contributions = await gather(config);
  expect(contributions.length).toBe(30 + 1 + 30 + 1);
});

test('should not fetch if disabled - by enable property', async () => {
  const specificTypeConfig = {
    discourse: {
      ...config.discourse,
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

  // Topic
  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Topic 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0',
    type: 'Created Discourse Topic',
    source: 'discourse-topics',
  });
  // Post
  expect(contributions[31]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Post 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0/1',
    type: 'Posted on Discourse Topic',
    source: 'discourse-posts',
  });
});

test('should format with custom types', async () => {
  const specificTypeConfig = {
    discourse: {
      ...config.discourse,
      topicType: 'Topic created!',
      postType: 'Posted!',
    },
  };

  const contributions = await gather(specificTypeConfig);

  // Topic
  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Topic 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0',
    type: specificTypeConfig.discourse.topicType,
    source: 'discourse-topics',
  });
  // Post
  expect(contributions[31]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Post 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0/1',
    type: specificTypeConfig.discourse.postType,
    source: 'discourse-posts',
  });
});

test('should keep deleted post', async () => {
  const specificTypeConfig = {
    discourse: {
      ...config.discourse,
      topicType: 'Topic created!',
      postType: 'Posted!',
      keepDeletedPost: true,
    },
  };

  const existingContributions = [
    {
      createdAt: new Date('2020-04-13'),
      description: 'Topic 0',
      link: 'https://discourse.mozilla.org/t/slug-0/0',
      type: 'Topic created!',
      source: 'discourse-topics',
    },
  ];

  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(TOPICS_EMPTY),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(POSTS_SMALL),
    });
  vi.stubGlobal('fetch', mockedFetch);

  const contributions = await gather(specificTypeConfig, existingContributions);

  expect(contributions.length).toBe(2);
  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Post 1',
    link: 'https://discourse.mozilla.org/t/slug-1/1/1',
    type: specificTypeConfig.discourse.postType,
    source: 'discourse-posts',
  });
  // Topic
  // This topic was not returned from the response, but is an
  // already existing contribution passed in.
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Topic 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0',
    type: specificTypeConfig.discourse.topicType,
    source: 'discourse-topics',
  });
});

test('should not duplicate kept entries when slug or type changed', async () => {
  const keepConfig = {
    discourse: {
      ...config.discourse,
      keepDeletedPost: true,
    },
  };

  const existingContributions = [
    {
      createdAt: '2020-04-13T00:00:00.000Z',
      description: 'Old title',
      link: 'https://discourse.mozilla.org/t/old-slug/1',
      type: 'Old topic type',
      source: 'discourse-topics',
    },
    {
      createdAt: '2020-04-13T00:00:00.000Z',
      description: 'Old title',
      link: 'https://discourse.mozilla.org/t/old-slug/1/1',
      type: 'Old post type',
      source: 'discourse-posts',
    },
  ];

  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(TOPICS_SMALL),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(POSTS_SMALL),
    });
  vi.stubGlobal('fetch', mockedFetch);

  const contributions = await gather(keepConfig, existingContributions);

  expect(contributions).toStrictEqual([
    {
      createdAt: new Date('2020-04-13'),
      description: 'Topic 1',
      link: 'https://discourse.mozilla.org/t/slug-1/1',
      type: 'Created Discourse Topic',
      source: 'discourse-topics',
    },
    {
      createdAt: new Date('2020-04-13'),
      description: 'Post 1',
      link: 'https://discourse.mozilla.org/t/slug-1/1/1',
      type: 'Posted on Discourse Topic',
      source: 'discourse-posts',
    },
  ]);
});

test('should throw if a request fails', async () => {
  fetch.mockReset();
  fetch.mockResolvedValueOnce({ ok: false, status: 500 });

  await expect(gather(config)).rejects.toThrow(
    'Discourse request to https://discourse.mozilla.org/topics/created-by/user.json?page=0 failed with status 500'
  );
});

test('should encode username in URLs', async () => {
  const specialConfig = {
    discourse: {
      ...config.discourse,
      username: 'a b&c',
    },
  };

  await gather(specialConfig);

  expect(fetch.mock.calls[0][0]).toBe(
    'https://discourse.mozilla.org/topics/created-by/a%20b%26c.json?page=0'
  );
  expect(fetch.mock.calls[2][0]).toContain('username=a%20b%26c&filter=5');
});
