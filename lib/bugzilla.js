import Debug from 'debug';
import { z } from 'zod';

import { getPadded } from './utils.js';

const debug = Debug('contributions:bugzilla');

const BUGZILLA_CREATED_CATEGORY = 'bugzilla-created';
const BUGZILLA_COMMENTED_CATEGORY = 'bugzilla-comments';

const TYPE_CREATED = 'Created a Bug Report';
const TYPE_COMMENTED = 'Commented on a Bug Report';

const RESULTS_PER_PAGE = 500;
const FETCH_TIMEOUT = 120000;

export const bugzillaSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().min(1),
  username: z.string().min(1),
  stopDate: z.string(),
  types: z
    .object({
      createdType: z.string().optional(),
      commentedType: z.string().optional(),
    })
    .optional(),
});

export async function gather({ bugzilla }, existingContributions = []) {
  if (!bugzilla || (bugzilla && !bugzilla.enabled)) {
    debug('Bugzilla source not enabled, skipping');
    return [];
  }

  const latest = existingContributions.find((contribution) => {
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
  let hasMoreToFetch = true;
  let offset = 0;
  const date = new Date(stopDate);
  const stop = `${date.getFullYear()}-${getPadded(
    date.getMonth() + 1
  )}-${getPadded(date.getDate())}`;
  while (hasMoreToFetch) {
    const query = `quicksearch=ALL%20commenter:${bugzilla.username}&limit=${RESULTS_PER_PAGE}&offset=${offset}&last_change_time=${stop}`;
    const bugsUrl = `${bugzilla.baseUrl}/rest/bug?${query}`;
    debug(`Fetching from ${bugsUrl}`);
    const response = await fetch(bugsUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const data = await response.json();
    debug(`Got ${data.bugs.length} bugs results`);
    // If we have less results than the max result, we're at the end
    if (data.bugs.length < RESULTS_PER_PAGE) {
      hasMoreToFetch = false;
      yield data.bugs;
      return;
    }

    offset += RESULTS_PER_PAGE;
    yield data.bugs;
  }
}

async function* getComments(bugzilla, bugs, titleMap) {
  for await (const bug of bugs) {
    const commentsUrl = `${bugzilla.baseUrl}/rest/bug/${bug.id}/comment`;
    debug(`Fetching from ${commentsUrl}`);
    const response = await fetch(commentsUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const data = await response.json();

    const ownComments = data.bugs[bug.id].comments.filter(
      (comment) => comment.creator === bugzilla.username
    );

    yield processEntities(bugzilla, ownComments, titleMap);
  }

  return [];
}

function processEntities({ types }, entities, titleMap) {
  return entities.map((entity) => format(types || {}, entity, titleMap));
}

function format(types, entity, titleMap) {
  const created = types.createdType || TYPE_CREATED;
  const commented = types.commentedType || TYPE_COMMENTED;

  return {
    createdAt: new Date(entity.creation_time),
    description: titleMap.get(entity.bug_id),
    link: `https://bugzilla.mozilla.org/show_bug.cgi?id=${entity.bug_id}#c${entity.count}`,
    type: entity.count === 0 ? created : commented,
    source:
      entity.count === 0
        ? BUGZILLA_CREATED_CATEGORY
        : BUGZILLA_COMMENTED_CATEGORY,
  };
}
