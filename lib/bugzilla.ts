import Debug from 'debug';
import { setTimeout as sleep } from 'timers/promises';
import { z } from 'zod';

import { assertOk, request, requestOk } from './http.js';
import {
  baseUrlSchema,
  findLatest,
  getPadded,
  sourceSchema,
  stopDateSchema,
} from './utils.js';
import { tagRuleSchema } from './tags.js';
import type { Contribution, FetchedContribution } from './types.js';

const debug = Debug('contributions:bugzilla');

const BUGZILLA_CREATED_CATEGORY = 'bugzilla-created';
const BUGZILLA_COMMENTED_CATEGORY = 'bugzilla-comments';

export const CATEGORIES = [
  BUGZILLA_CREATED_CATEGORY,
  BUGZILLA_COMMENTED_CATEGORY,
];

const TYPE_CREATED = 'Created a Bug Report';
const TYPE_COMMENTED = 'Commented on a Bug Report';

const RESULTS_PER_PAGE = 500;

const BUG_DOES_NOT_EXIST = 101;
const BUG_ACCESS_DENIED = 102;

export const bugzillaSchema = sourceSchema(
  z.strictObject({
    enabled: z.literal(true),
    baseUrl: baseUrlSchema,
    username: z.string().min(1),
    stopDate: stopDateSchema,
    types: z
      .strictObject({
        createdType: z.string().optional(),
        commentedType: z.string().optional(),
      })
      .optional(),
    delayMsPerRequest: z.number().nonnegative().default(500),
    tagRules: z.array(tagRuleSchema).optional(),
  })
);

export type BugzillaConfig = z.output<typeof bugzillaSchema>;
export type EnabledBugzillaConfig = Extract<BugzillaConfig, { enabled: true }>;
type BugzillaTypes = NonNullable<EnabledBugzillaConfig['types']>;

interface Bug {
  id: number;
  summary: string;
}

interface BugComment {
  bug_id: number;
  count: number;
  creator?: string;
  creation_time: string;
}

interface BugsResponse {
  bugs: Bug[];
}

interface CommentsResponse {
  bugs: Record<string, { comments: BugComment[] }>;
}

export async function gather(
  { bugzilla }: { bugzilla?: BugzillaConfig },
  existingContributions: Contribution[] = []
): Promise<FetchedContribution[]> {
  if (!bugzilla?.enabled) {
    debug('Bugzilla source not enabled, skipping');
    return [];
  }

  const latest = findLatest(existingContributions, (contribution) => {
    return (
      contribution.source === BUGZILLA_COMMENTED_CATEGORY ||
      contribution.source === BUGZILLA_CREATED_CATEGORY
    );
  }) || { createdAt: bugzilla.stopDate };

  const commentedBugs: Bug[][] = [];
  const bugsList = bugPageGenerator(bugzilla, latest.createdAt);
  for await (const bugList of bugsList) {
    commentedBugs.push(
      bugList.map((bug) => ({
        id: bug.id,
        summary: bug.summary,
      }))
    );
  }
  const flatCommentedBugs = commentedBugs.flat();

  debug(`Got ${flatCommentedBugs.length} bugs this user has commented on.`);

  const titleMap = new Map<number, string>();
  flatCommentedBugs.forEach((bug) => titleMap.set(bug.id, bug.summary));

  // Now that we have all bugs we commented on, we can fetch the comments
  // for each bug..
  let contributions: FetchedContribution[] = [];
  const commentsList = getComments(bugzilla, flatCommentedBugs, titleMap);
  for await (const comments of commentsList) {
    contributions = contributions.concat(comments);
  }

  return contributions.filter((contribution) => {
    return contribution.createdAt > new Date(latest.createdAt);
  });
}

async function* bugPageGenerator(
  bugzilla: EnabledBugzillaConfig,
  stopDate: Date | string
): AsyncGenerator<Bug[]> {
  let offset = 0;
  const date = new Date(stopDate);
  // Dates are parsed as UTC midnight, so we need to use the UTC methods,
  // otherwise time zones behind UTC end up in the previous day.
  const stop = `${date.getUTCFullYear()}-${getPadded(
    date.getUTCMonth() + 1
  )}-${getPadded(date.getUTCDate())}`;
  while (true) {
    if (offset > 0 && bugzilla.delayMsPerRequest !== 0) {
      await sleep(bugzilla.delayMsPerRequest);
    }
    const query = `quicksearch=ALL%20commenter:${encodeURIComponent(bugzilla.username)}&limit=${RESULTS_PER_PAGE}&offset=${offset}&order=bug_id&last_change_time=${stop}`;
    const bugsUrl = `${bugzilla.baseUrl}/rest/bug?${query}`;
    debug(`Fetching from ${bugsUrl}`);
    const response = await requestOk(bugsUrl, 'Bugzilla');
    const data = (await response.json()) as BugsResponse;
    debug(`Got ${data.bugs.length} bugs results`);
    // If we have less results than the max result, we're at the end
    if (data.bugs.length < RESULTS_PER_PAGE) {
      yield data.bugs;
      return;
    }

    offset += RESULTS_PER_PAGE;
    yield data.bugs;
  }
}

async function* getComments(
  bugzilla: EnabledBugzillaConfig,
  bugs: Bug[],
  titleMap: Map<number, string>
): AsyncGenerator<FetchedContribution[]> {
  const username = bugzilla.username.toLowerCase();
  for await (const bug of bugs) {
    if (bugzilla.delayMsPerRequest !== 0) {
      await sleep(bugzilla.delayMsPerRequest);
    }
    const commentsUrl = `${bugzilla.baseUrl}/rest/bug/${bug.id}/comment`;
    debug(`Fetching from ${commentsUrl}`);
    const response = await request(commentsUrl);
    // A deleted or restricted bug has nothing left to fetch, so we skip it.
    // Any other error must abort the run, as otherwise the remaining bugs
    // would be skipped and the next run would start past them.
    if (await isGoneResponse(response)) {
      debug(`Skipping unavailable bug ${bug.id}`);
      continue;
    }
    assertOk(response, 'Bugzilla', commentsUrl);
    const data = (await response.json()) as CommentsResponse;

    const bugComments = data.bugs[bug.id];
    if (!bugComments) {
      throw new Error(
        `Bugzilla response from ${commentsUrl} did not contain bug ${bug.id}`
      );
    }

    const ownComments = bugComments.comments.filter(
      (comment) => comment.creator?.toLowerCase() === username
    );

    yield processEntities(bugzilla, ownComments, titleMap);
  }
}

async function isGoneResponse(response: Response): Promise<boolean> {
  if (![401, 403, 404].includes(response.status)) {
    return false;
  }

  try {
    const data = (await response.json()) as { code?: number } | null;
    return [BUG_DOES_NOT_EXIST, BUG_ACCESS_DENIED].includes(data?.code ?? -1);
  } catch {
    return false;
  }
}

function processEntities(
  { baseUrl, types }: EnabledBugzillaConfig,
  entities: BugComment[],
  titleMap: Map<number, string>
): FetchedContribution[] {
  return entities.map((entity) =>
    format(baseUrl, types || {}, entity, titleMap)
  );
}

function format(
  baseUrl: string,
  types: BugzillaTypes,
  entity: BugComment,
  titleMap: Map<number, string>
): FetchedContribution {
  const created = types.createdType || TYPE_CREATED;
  const commented = types.commentedType || TYPE_COMMENTED;

  return {
    createdAt: new Date(entity.creation_time),
    description: titleMap.get(entity.bug_id) ?? '',
    link: `${baseUrl}/show_bug.cgi?id=${entity.bug_id}#c${entity.count}`,
    type: entity.count === 0 ? created : commented,
    source:
      entity.count === 0
        ? BUGZILLA_CREATED_CATEGORY
        : BUGZILLA_COMMENTED_CATEGORY,
  };
}
