import Debug from 'debug';
import { setTimeout as sleep } from 'timers/promises';
import { z } from 'zod';

import { requestOk } from './http.js';
import type { Contribution, FetchedContribution } from './types.js';
import { tagRuleSchema } from './tags.js';
import { baseUrlSchema, sourceSchema } from './utils.js';

const debug = Debug('contributions:discourse');

export const TOPICS_CATEGORY = 'discourse-topics';
export const POSTS_CATEGORY = 'discourse-posts';
export const CATEGORIES = [TOPICS_CATEGORY, POSTS_CATEGORY];

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
    delayMsPerRequest: z.number().nonnegative().default(500),
    tagRules: z.array(tagRuleSchema).optional(),
  })
);

export type DiscourseConfig = z.output<typeof discourseSchema>;
export type EnabledDiscourseConfig = Extract<
  DiscourseConfig,
  { enabled: true }
>;

interface DiscourseTopic {
  id: number;
  slug: string;
  title: string;
  created_at: string;
}

interface DiscoursePost {
  topic_id: number;
  post_number: number;
  slug: string;
  title: string;
  created_at: string;
}

interface TopicListResponse {
  topic_list: { topics: DiscourseTopic[]; more_topics_url?: string };
}

interface UserActionsResponse {
  user_actions: DiscoursePost[];
}

export async function gather(
  { discourse }: { discourse?: DiscourseConfig },
  existingContributions: Contribution[] = []
): Promise<FetchedContribution[]> {
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
    const seen = new Set<string>();
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
function getContributionKey(contribution: Contribution): string {
  const link = contribution.link.replace(/\/t\/[^/]*\/(\d+)/, '/t/-/$1');
  return `${contribution.source}|${link}`;
}

async function processTopics({
  baseUrl,
  username,
  topicType,
  delayMsPerRequest,
}: EnabledDiscourseConfig) {
  debug('Getting topics from Discourse');
  let allTopics: FetchedContribution[] = [];

  const page = topicPageGenerator(baseUrl, username, delayMsPerRequest);

  for await (const topics of page) {
    debug(`Got ${topics.length} topics`);
    allTopics = allTopics.concat(
      topics.map((entity) => formatTopic(topicType, baseUrl, entity))
    );
  }

  return allTopics;
}

async function processPosts({
  baseUrl,
  username,
  postType,
  delayMsPerRequest,
}: EnabledDiscourseConfig) {
  debug('Getting posts from Discourse');
  let allPosts: FetchedContribution[] = [];

  const page = postPageGenerator(baseUrl, username, delayMsPerRequest);

  for await (const posts of page) {
    debug(`Got ${posts.length} posts`);
    allPosts = allPosts.concat(
      posts.map((entity) => formatPost(postType, baseUrl, entity))
    );
  }

  return allPosts;
}

// The page size depends on the forum's settings, so a short page does not
// mean we are done. Discourse sets more_topics_url as long as there is a next
// page.
async function* topicPageGenerator(
  baseUrl: string,
  username: string,
  delayMsPerRequest: number
): AsyncGenerator<DiscourseTopic[]> {
  let page = 0;
  while (true) {
    if (page > 0 && delayMsPerRequest !== 0) {
      await sleep(delayMsPerRequest);
    }
    debug(`Getting page ${page}`);
    const url = `${baseUrl}/topics/created-by/${encodeURIComponent(username)}.json?page=${page}`;
    const { topic_list: topicList } =
      await getDiscourseData<TopicListResponse>(url);
    yield topicList.topics;

    if (!topicList.more_topics_url || topicList.topics.length === 0) {
      debug('We are done!');
      return;
    }
    page++;
  }
}

// user_actions has no "more" marker, so we advance the offset by what we
// actually got and stop at the first empty page.
async function* postPageGenerator(
  baseUrl: string,
  username: string,
  delayMsPerRequest: number
): AsyncGenerator<DiscoursePost[]> {
  let offset = 0;
  while (true) {
    if (offset > 0 && delayMsPerRequest !== 0) {
      await sleep(delayMsPerRequest);
    }
    debug(`Getting posts from offset ${offset}`);
    const url = `${baseUrl}/user_actions.json?username=${encodeURIComponent(username)}&filter=5&offset=${offset}`;
    const { user_actions: posts } =
      await getDiscourseData<UserActionsResponse>(url);
    if (posts.length === 0) {
      debug('We are done!');
      return;
    }
    yield posts;
    offset += posts.length;
  }
}

async function getDiscourseData<T>(url: string): Promise<T> {
  const response = await requestOk(url, 'Discourse');
  return (await response.json()) as T;
}

function formatTopic(
  type: string | undefined,
  baseUrl: string,
  entity: DiscourseTopic
): FetchedContribution {
  return {
    createdAt: new Date(entity.created_at),
    description: entity.title,
    link: `${baseUrl}/t/${entity.slug}/${entity.id}`,
    type: type || TYPE_TOPIC,
    source: TOPICS_CATEGORY,
  };
}

function formatPost(
  type: string | undefined,
  baseUrl: string,
  entity: DiscoursePost
): FetchedContribution {
  return {
    createdAt: new Date(entity.created_at),
    description: entity.title,
    link: `${baseUrl}/t/${entity.slug}/${entity.topic_id}/${entity.post_number}`,
    type: type || TYPE_POST,
    source: POSTS_CATEGORY,
  };
}
