import Debug from 'debug';
import { z } from 'zod';

import { assertOk, request, requestOk } from './http.js';
import {
  baseUrlSchema,
  findLatest,
  getPadded,
  sourceSchema,
  stopDateSchema,
} from './utils.js';

const debug = Debug('contributions:bugzilla');

const BUGZILLA_CREATED_CATEGORY = 'bugzilla-created';
const BUGZILLA_COMMENTED_CATEGORY = 'bugzilla-comments';

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
  })
);

export async function gather({ bugzilla }, existingContributions = []) {
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

  const commentedBugs = [];
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

  const titleMap = new Map();
  flatCommentedBugs.forEach((bug) => titleMap.set(bug.id, bug.summary));

  // Now that we have all bugs we commented on, we can fetch the comments
  // for each bug..
  let contributions = [];
  const commentsList = getComments(bugzilla, flatCommentedBugs, titleMap);
  for await (const comments of commentsList) {
    contributions = contributions.concat(comments);
  }

  return contributions.filter((contribution) => {
    return contribution.createdAt > new Date(latest.createdAt);
  });
}

async function* bugPageGenerator(bugzilla, stopDate) {
  let offset = 0;
  const date = new Date(stopDate);
  // Dates are parsed as UTC midnight, so we need to use the UTC methods,
  // otherwise time zones behind UTC end up in the previous day.
  const stop = `${date.getUTCFullYear()}-${getPadded(
    date.getUTCMonth() + 1
  )}-${getPadded(date.getUTCDate())}`;
  while (true) {
    const query = `quicksearch=ALL%20commenter:${encodeURIComponent(bugzilla.username)}&limit=${RESULTS_PER_PAGE}&offset=${offset}&order=bug_id&last_change_time=${stop}`;
    const bugsUrl = `${bugzilla.baseUrl}/rest/bug?${query}`;
    debug(`Fetching from ${bugsUrl}`);
    const response = await requestOk(bugsUrl, 'Bugzilla');
    const data = await response.json();
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

async function* getComments(bugzilla, bugs, titleMap) {
  const username = bugzilla.username.toLowerCase();
  for await (const bug of bugs) {
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
    const data = await response.json();

    const ownComments = data.bugs[bug.id].comments.filter(
      (comment) => comment.creator?.toLowerCase() === username
    );

    yield processEntities(bugzilla, ownComments, titleMap);
  }

  return [];
}

async function isGoneResponse(response) {
  if (![401, 403, 404].includes(response.status)) {
    return false;
  }

  try {
    const data = await response.json();
    return [BUG_DOES_NOT_EXIST, BUG_ACCESS_DENIED].includes(data?.code);
  } catch {
    return false;
  }
}

function processEntities({ baseUrl, types }, entities, titleMap) {
  return entities.map((entity) =>
    format(baseUrl, types || {}, entity, titleMap)
  );
}

function format(baseUrl, types, entity, titleMap) {
  const created = types.createdType || TYPE_CREATED;
  const commented = types.commentedType || TYPE_COMMENTED;

  return {
    createdAt: new Date(entity.creation_time),
    description: titleMap.get(entity.bug_id),
    link: `${baseUrl}/show_bug.cgi?id=${entity.bug_id}#c${entity.count}`,
    type: entity.count === 0 ? created : commented,
    source:
      entity.count === 0
        ? BUGZILLA_CREATED_CATEGORY
        : BUGZILLA_COMMENTED_CATEGORY,
  };
}
