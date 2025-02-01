import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { gather, discourseSchema } from './discourse.js';

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
  },
};

beforeEach(() => {
  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(TOPICS) })
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(TOPICS_SMALL) })
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(POSTS) })
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(POSTS_SMALL) });

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
});

test('Discourse schema - invalid config', () => {
  const invalidConfig = {
    enabled: true,
    baseUrl: '',
    username: 'testuser',
  };
  expect(() => discourseSchema.parse(invalidConfig)).toThrow();
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
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(TOPICS_EMPTY) })
    .mockResolvedValueOnce({ json: vi.fn().mockResolvedValue(POSTS_SMALL) });
  vi.stubGlobal('fetch', mockedFetch);

  const contributions = await gather(specificTypeConfig, existingContributions);

  expect(contributions.length).toBe(2);
  // Topic
  // This topic was not returned from the response, but is an
  // already existing contribution passed in.
  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Topic 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0',
    type: specificTypeConfig.discourse.topicType,
    source: 'discourse-topics',
  });
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date('2020-04-13'),
    description: 'Post 1',
    link: 'https://discourse.mozilla.org/t/slug-1/1/1',
    type: specificTypeConfig.discourse.postType,
    source: 'discourse-posts',
  });
});
