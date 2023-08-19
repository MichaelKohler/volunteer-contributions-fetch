const test = require('ava');
const axios = require('axios');
const sinon = require('sinon');

const discourse = require('./discourse');

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

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();

  t.context.sandbox.stub(axios, 'get').onCall(0).resolves({ data: TOPICS });
  axios.get.onCall(1).resolves({ data: TOPICS_SMALL });
  axios.get.onCall(2).resolves({ data: POSTS });
  axios.get.onCall(3).resolves({ data: POSTS_SMALL });
});

test.afterEach.always((t) => {
  t.context.sandbox.restore();
});

test.serial('should validate config - missing completely', (t) => {
  const emptyConfig = {};
  t.notThrows(() => discourse.validate(emptyConfig));
});

test.serial('should validate config - missing baseUrl', (t) => {
  const failConfig = {
    enabled: true,
    username: 'A',
  };

  t.throws(() => discourse.validate(failConfig));
});

test.serial('should validate config - missing username', (t) => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
  };

  t.throws(() => discourse.validate(failConfig));
});

test.serial('should fetch', async (t) => {
  const contributions = await discourse.gather(config);
  t.is(contributions.length, 30 + 1 + 30 + 1);
});

test.serial('should not fetch if disabled - by enable property', async (t) => {
  const specificTypeConfig = {
    discourse: {
      ...config.discourse,
      enabled: false,
    },
  };

  const contributions = await discourse.gather(specificTypeConfig);

  t.is(contributions.length, 0);
});

test.serial(
  'should not fetch if disabled - by leaving off config value',
  async (t) => {
    const contributions = await discourse.gather({});

    t.is(contributions.length, 0);
  }
);

test.serial('should format', async (t) => {
  const contributions = await discourse.gather(config);

  // Topic
  t.deepEqual(contributions[0], {
    createdAt: new Date('2020-04-13'),
    description: 'Topic 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0',
    type: 'Created Discourse Topic',
    source: 'discourse-topics',
  });
  // Post
  t.deepEqual(contributions[31], {
    createdAt: new Date('2020-04-13'),
    description: 'Post 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0/1',
    type: 'Posted on Discourse Topic',
    source: 'discourse-posts',
  });
});

test.serial('should format with custom types', async (t) => {
  const specificTypeConfig = {
    discourse: {
      ...config.discourse,
      topicType: 'Topic created!',
      postType: 'Posted!',
    },
  };

  const contributions = await discourse.gather(specificTypeConfig);

  // Topic
  t.deepEqual(contributions[0], {
    createdAt: new Date('2020-04-13'),
    description: 'Topic 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0',
    type: specificTypeConfig.discourse.topicType,
    source: 'discourse-topics',
  });
  // Post
  t.deepEqual(contributions[31], {
    createdAt: new Date('2020-04-13'),
    description: 'Post 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0/1',
    type: specificTypeConfig.discourse.postType,
    source: 'discourse-posts',
  });
});

test.serial('should keep deleted post', async (t) => {
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

  axios.get.onCall(0).resolves({ data: TOPICS_EMPTY });
  axios.get.onCall(1).resolves({ data: POSTS_SMALL });

  const contributions = await discourse.gather(
    specificTypeConfig,
    existingContributions
  );

  t.is(contributions.length, 2);
  // Topic
  // This topic was not returned from the response, but is an
  // already existing contribution passed in.
  t.deepEqual(contributions[0], {
    createdAt: new Date('2020-04-13'),
    description: 'Topic 0',
    link: 'https://discourse.mozilla.org/t/slug-0/0',
    type: specificTypeConfig.discourse.topicType,
    source: 'discourse-topics',
  });
  t.deepEqual(contributions[1], {
    createdAt: new Date('2020-04-13'),
    description: 'Post 1',
    link: 'https://discourse.mozilla.org/t/slug-1/1/1',
    type: specificTypeConfig.discourse.postType,
    source: 'discourse-posts',
  });
});
