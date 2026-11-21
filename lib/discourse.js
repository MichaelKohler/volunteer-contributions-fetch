import Debug from 'debug';
import { z } from 'zod';

import { baseUrlSchema, FETCH_TIMEOUT, sourceSchema } from './utils.js';

const debug = Debug('contributions:discourse');

const RESULTS_PER_PAGE = 30;
export const TOPICS_CATEGORY = 'discourse-topics';
export const POSTS_CATEGORY = 'discourse-posts';

const TYPE_TOPIC = 'Created Discourse Topic';
const TYPE_POST = 'Posted on Discourse Topic';

export const discourseSchema = sourceSchema(
  z.strictObject({
    enabled: z.literal(true),
    baseUrl: baseUrlSchema,
    username: z.string().min(1),
    topicType: z.string().optional(),
    postType: z.string().optional(),
    keepDeletedPost: z.boolean().default(false),
  })
);

export async function gather({ discourse }, existingContributions = []) {
  if (!discourse?.enabled) {
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
    // Freshly fetched entries come first so that they win over saved ones,
    // which keeps renamed titles and changed types up to date.
    const allContributions = [
      ...topics,
      ...posts,
      ...existingDiscourseContributions.map((contribution) => ({
        ...contribution,
        createdAt: new Date(contribution.createdAt),
      })),
    ];
    const seen = new Set();
    contributions = allContributions.filter((contribution) => {
      const key = getContributionKey(contribution);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  debug('Finished gathering contributions');
  return contributions;
}

// Discourse changes the slug when a topic is renamed, and the type depends on
// the config, so neither can be part of the key. Otherwise the saved entry and
// the refetched one would both be kept with keepDeletedPost.
function getContributionKey(contribution) {
  const link = contribution.link.replace(/\/t\/[^/]*\/(\d+)/, '/t/-/$1');
  return `${contribution.source}|${link}`;
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
      break;
    }
  }

  return allTopics;
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
      break;
    }
  }

  return allPosts;
}

async function* topicPageGenerator(baseUrl, username) {
  let page = 0;
  while (true) {
    debug(`Getting page ${page}`);
    const url = `${baseUrl}/topics/created-by/${encodeURIComponent(username)}.json?page=${page}`;
    const results = await getDiscourseData(url);
    page++;
    yield results;
  }
}

async function* postPageGenerator(baseUrl, username) {
  let page = 0;
  while (true) {
    debug(`Getting page ${page}`);
    const offset = page * RESULTS_PER_PAGE;
    const url = `${baseUrl}/user_actions.json?username=${encodeURIComponent(username)}&filter=5&offset=${offset}`;
    const results = await getDiscourseData(url);
    page++;
    yield results;
  }
}

async function getDiscourseData(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(
      `Discourse request to ${url} failed with status ${response.status}`
    );
  }
  return response.json();
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
