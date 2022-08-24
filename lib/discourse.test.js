/* eslint camelcase: 0 */

const test = require('ava');
const axios = require('axios');
const sinon = require('sinon');

const discourse = require('./discourse');

const TOPICS = {
  topic_list: {
    // eslint-disable-next-line newline-per-chained-call
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
    topics: [{
      created_at: new Date('2020-04-13'),
      title: 'Topic 1',
      slug: 'slug-1',
      id: 1,
    }],
  },
};

const POSTS = {
  // eslint-disable-next-line newline-per-chained-call
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
  user_actions: [{
    created_at: new Date('2020-04-13'),
    title: 'Post 1',
    slug: 'slug-1',
    topic_id: 1,
    post_id: 1,
    post_number: 1,
  }],
};

const config = {
  discourse: {
    enabled: true,
    baseUrl: 'https://discourse.mozilla.org',
    topicType: 'Created Discourse Topic',
    postType: 'Posted on Discourse Topic',
  },
};

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();

  t.context.sandbox.stub(axios, 'get').onCall(0)
    .resolves({ data: TOPICS });
  axios.get.onCall(1)
    .resolves({ data: TOPICS_SMALL });
  axios.get.onCall(2)
    .resolves({ data: POSTS });
  axios.get.onCall(3)
    .resolves({ data: POSTS_SMALL });
});

test.afterEach.always((t) => {
  t.context.sandbox.restore();
});

test.serial('should fetch', async (t) => {
  const contributions = await discourse.gather(config);
  t.is(contributions.length, 30 + 1 + 30 + 1);
});

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
