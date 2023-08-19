const debug = require('debug')('contributions:discourse');
const axios = require('axios');
const { ensureUniqueContributions } = require('./contributions');

const RESULTS_PER_PAGE = 30;
const TOPICS_CATEGORY = 'discourse-topics';
const POSTS_CATEGORY = 'discourse-posts';

const TYPE_TOPIC = 'Created Discourse Topic';
const TYPE_POST = 'Posted on Discourse Topic';

module.exports = {
  TOPICS_CATEGORY,
  POSTS_CATEGORY,
  gather,
  validate,
};

function validate(config) {
  debug('Validating Discourse config');

  if (!config) {
    return;
  }

  if (config && config.enabled && !config.baseUrl) {
    throw new Error('Discourse: baseUrl is required');
  }

  if (config && config.enabled && !config.username) {
    throw new Error('Discourse: username is required');
  }
}

async function gather({ discourse }, existingContributions = []) {
  if (!discourse || (discourse && !discourse.enabled)) {
    debug('Discourse source not enabled, skipping');
    return [];
  }

  const topics = await processTopics(discourse);
  const posts = await processPosts(discourse);

  let contributions = [...topics, ...posts];
  if (discourse.keepDeletedPost) {
    debug('Keeping deleted posts and filtering by uniqueness');
    const existingDiscourseContributions = existingContributions.filter(
      (contribution) =>
        contribution.source === TOPICS_CATEGORY ||
        contribution.source === POSTS_CATEGORY
    );
    const allContributions = [
      ...existingDiscourseContributions.map((contribution) => ({
        ...contribution,
        createdAt: new Date(contribution.createdAt),
      })),
      ...topics,
      ...posts,
    ];
    contributions = ensureUniqueContributions(allContributions);
  }

  debug('Finished gathering contributions');
  return contributions;
}

async function processTopics({ baseUrl, username, topicType }) {
  debug('Getting topics from Discourse');
  let allTopics = [];

  const page = topicPageGenerator(baseUrl, username);

  for await (const topicsResponse of page) {
    const { topics } = topicsResponse.topic_list;
    debug(`Got ${topics.length} topics`);
    allTopics = allTopics.concat(
      topics.map((entity) => formatTopic(topicType, baseUrl, entity))
    );

    const hasMore = topics.length === RESULTS_PER_PAGE;
    if (!hasMore) {
      debug('We are done!');
      return allTopics;
    }
  }

  return undefined;
}

async function processPosts({ baseUrl, username, postType }) {
  debug('Getting posts from Discourse');
  let allPosts = [];

  const page = postPageGenerator(baseUrl, username);

  for await (const postsResponse of page) {
    const posts = postsResponse.user_actions;
    debug(`Got ${posts.length} posts`);
    allPosts = allPosts.concat(
      posts.map((entity) => formatPost(postType, baseUrl, entity))
    );

    const hasMore = posts.length === RESULTS_PER_PAGE;
    if (!hasMore) {
      debug('We are done!');
      return allPosts;
    }
  }

  return undefined;
}

async function* topicPageGenerator(baseUrl, username) {
  let page = 0;
  while (true) {
    debug(`Getting page ${page}`);
    const url = `${baseUrl}/topics/created-by/${username}.json?page=${page}`;
    const results = await getDiscourseData(url); // eslint-disable-line no-await-in-loop
    page++;
    yield results;
  }
}

async function* postPageGenerator(baseUrl, username) {
  let page = 0;
  while (true) {
    debug(`Getting page ${page}`);
    const offset = page * RESULTS_PER_PAGE;
    const url = `${baseUrl}/user_actions.json?username=${username}&filter=5&offset=${offset}`;
    const results = await getDiscourseData(url); // eslint-disable-line no-await-in-loop
    page++;
    yield results;
  }
}

async function getDiscourseData(url) {
  const response = await axios.get(url);
  return response.data;
}

function formatTopic(type, baseUrl, entity) {
  return {
    createdAt: new Date(entity.created_at),
    description: entity.title,
    link: `${baseUrl}/t/${entity.slug}/${entity.id}`,
    type: type || TYPE_TOPIC,
    source: TOPICS_CATEGORY,
  };
}

function formatPost(type, baseUrl, entity) {
  return {
    createdAt: new Date(entity.created_at),
    description: entity.title,
    link: `${baseUrl}/t/${entity.slug}/${entity.topic_id}/${entity.post_number}`,
    type: type || TYPE_POST,
    source: POSTS_CATEGORY,
  };
}
