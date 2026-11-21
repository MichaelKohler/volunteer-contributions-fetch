import Debug from 'debug';
import { z } from 'zod';
import {
  listComments,
  listReviews,
  PRIVATE_SCOPE_ERROR,
  RESULTS_PER_PAGE,
  searchCommits,
  searchIssues,
  throwIfTokenHasPrivateRepoScope,
} from './github-fetcher.js';
import { findLatest, getPadded, stopDateSchema } from './utils.js';

const debug = Debug('contributions:github');

const ONE_YEAR_IN_MS = 1000 * 60 * 60 * 24 * 365;
const GITHUB_COMMIT_CATEGORY = 'github-commit';
const GITHUB_ISSUES_CREATED_CATEGORY = 'github-issues-created';
const GITHUB_PR_CREATED_CATEGORY = 'github-pr-created';
const GITHUB_REVIEW_CATEGORY = 'github-reviews';
const GITHUB_COMMENT_CATEGORY = 'github-comments';

const TYPE_COMMIT = 'GitHub Commit';
const TYPE_PRIVATE_COMMIT = 'Commit in private repository';
const TYPE_CREATED_PR = 'Created PR';
const TYPE_CREATED_ISSUE = 'Created Issue Report';
const TYPE_COMMENTED_PR = 'Commented on a Pull Request';
const TYPE_APPROVED_PR = 'Approved a Pull Request';
const TYPE_CHANGES_REQUESTED_PR = 'Requested changes on a Pull Request';
const TYPE_REVIEWED_PR = 'Reviewed a Pull Request';
const TYPE_COMMENTED = 'Commented on an Issue';

export const githubSchema = z.object({
  enabled: z.boolean(),
  allowPrivate: z.boolean().default(false),
  commentsEnabled: z.boolean().default(true),
  commitsEnabled: z.boolean().default(true),
  issuesEnabled: z.boolean().default(true),
  reviewsEnabled: z.boolean().default(true),
  username: z.string().min(1),
  stopDate: stopDateSchema,
  filter: z.string().transform((value, ctx) => {
    try {
      return new RegExp(value, 'i');
    } catch {
      ctx.issues.push({
        code: 'custom',
        message: 'filter must be a valid regular expression',
        input: value,
      });
      return z.NEVER;
    }
  }),
  types: z
    .object({
      commit: z.string().optional(),
      privateCommit: z.string().optional(),
      createdPR: z.string().optional(),
      createdIssue: z.string().optional(),
      commented: z.string().optional(),
      commentedPR: z.string().optional(),
      approvedPR: z.string().optional(),
      changesRequestedPR: z.string().optional(),
      reviewedPR: z.string().optional(),
    })
    .optional(),
  delayMsPerRequest: z.number().default(2000),
});

export async function gather({ github }, existingContributions = []) {
  if (!github || (github && !github.enabled)) {
    debug('GitHub source not enabled, skipping');
    return [];
  }

  const latestCommit = findLatest(existingContributions, (contribution) => {
    return contribution.source === GITHUB_COMMIT_CATEGORY;
  }) || { createdAt: github.stopDate };
  const latestIssue = findLatest(
    existingContributions,
    (contribution) => contribution.source === GITHUB_ISSUES_CREATED_CATEGORY
  ) || { createdAt: github.stopDate };
  const latestPR = findLatest(
    existingContributions,
    (contribution) => contribution.source === GITHUB_PR_CREATED_CATEGORY
  ) || { createdAt: github.stopDate };
  const latestReview = findLatest(existingContributions, (contribution) => {
    return contribution.source === GITHUB_REVIEW_CATEGORY;
  }) || { createdAt: github.stopDate };
  const latestComment = findLatest(existingContributions, (contribution) => {
    return contribution.source === GITHUB_COMMENT_CATEGORY;
  }) || { createdAt: github.stopDate };

  try {
    await throwIfTokenHasPrivateRepoScope();
  } catch (error) {
    if (error.message === PRIVATE_SCOPE_ERROR) {
      if (!github.allowPrivate) {
        throw new Error(
          'GITHUB_TOKEN might have private repo scope, but the config does not specify `allowPrivate` to fetch private repos. Are you sure you want to fetch private information? This might also be because you passed a fine-grained token. In that case we can not check the permissions it has and we assume it is private. You can double check the permissions and if you are sure it is correct, you may set `allowPrivate` to true.',
          { cause: error }
        );
      }
    } else {
      throw error;
    }
  }

  const commits = await processCommits(github, latestCommit.createdAt);
  const issues = await processIssues(github, latestIssue.createdAt);
  const prs = await processPRs(github, latestPR.createdAt);
  const reviews = await processReviews(github, latestReview.createdAt);
  const comments = await processComments(github, latestComment.createdAt);
  const contributions = [
    ...commits,
    ...issues,
    ...prs,
    ...reviews,
    ...comments,
  ];

  debug('Finished gathering contributions');
  return contributions;
}

async function processIssues(github, latestCreationDate) {
  if (!github.issuesEnabled) {
    debug('Fetching issues is disabled, skipping!');
    return [];
  }

  debug('Getting issues from Github');
  const allIssues = [];

  const lowerBoundDate = new Date(latestCreationDate);
  const generatedPeriod = periodGenerator(github.stopDate, lowerBoundDate);
  for await (const periodChunk of generatedPeriod) {
    const currentPage = pageGenerator(github, periodChunk, (period, page) =>
      getIssuePage(github, 'author', period, page)
    );
    for await (const issues of currentPage) {
      debug(`Got ${issues.length} issues`);
      allIssues.push(issues);
    }
  }

  return allIssues.flat().filter((issue) => {
    return new Date(issue.createdAt) > new Date(latestCreationDate);
  });
}

async function processPRs(github, latestCreationDate) {
  if (!github.issuesEnabled) {
    debug('Fetching PRs is disabled through `issuesEnabled`, skipping!');
    return [];
  }

  debug('Getting PRs from Github');
  const allPRs = [];

  const lowerBoundDate = new Date(latestCreationDate);
  const generatedPeriod = periodGenerator(github.stopDate, lowerBoundDate);
  for await (const periodChunk of generatedPeriod) {
    const currentPage = pageGenerator(github, periodChunk, (period, page) =>
      getPRPage(github, 'author', period, page)
    );
    for await (const prs of currentPage) {
      debug(`Got ${prs.length} PRs`);
      allPRs.push(prs);
    }
  }

  return allPRs.flat().filter((issue) => {
    return new Date(issue.createdAt) > new Date(latestCreationDate);
  });
}

async function processCommits(github, latestCreationDate) {
  if (!github.commitsEnabled) {
    debug('Fetching commits is disabled, skipping!');
    return [];
  }

  debug('Getting commits from Github');
  const allCommits = [];

  const lowerBoundDate = new Date(latestCreationDate);
  const generatedPeriod = periodGenerator(github.stopDate, lowerBoundDate);
  for await (const periodChunk of generatedPeriod) {
    const currentPage = pageGenerator(github, periodChunk, (period, page) =>
      getCommitPage(github, period, page)
    );
    for await (const commits of currentPage) {
      debug(`Got ${commits.length} commits`);
      allCommits.push(commits);
    }
  }

  return allCommits.flat().filter((commit) => {
    return new Date(commit.createdAt) > new Date(latestCreationDate);
  });
}

async function processReviews(github, latestCreationDate) {
  if (!github.reviewsEnabled) {
    debug('Fetching reviews is disabled, skipping!');
    return [];
  }

  debug('Getting reviews from Github');
  const allPRs = [];

  // We can only search for PRs and then get the reviews from there. As we
  // can't sort by review date, we need to fetch a certain number of PRs.
  // There is a possibility that a PR was created before `latestCreationDate`
  // but has not been reviewed yet. Once it gets reviewed it might be already
  // to old to show up here. Therefore we fetch the reviewed PRs for one year
  // and then later on filter out already-committed reviews.
  const lowerBoundDate = new Date(latestCreationDate) - ONE_YEAR_IN_MS;
  const generatedPeriod = periodGenerator(github.stopDate, lowerBoundDate);
  for await (const periodChunk of generatedPeriod) {
    const currentPage = pageGenerator(
      github,
      periodChunk,
      (period, page) => getPRPage(github, 'reviewed-by', period, page),
      { skipProcessing: true }
    );
    for await (const prs of currentPage) {
      debug(`Got ${prs.length} PRs`);
      allPRs.push(prs);
    }
  }

  const prTitleMap = new Map();
  allPRs.flat().forEach((pr) => prTitleMap.set(pr.pull_request.url, pr.title));

  // Now that we have all the PRs, we need to fetch the reviews
  const allReviews = [];

  const prReviewsList = getPRReviews(
    allPRs.flat(),
    github.username,
    github.delayMsPerRequest
  );
  for await (const prReviews of prReviewsList) {
    allReviews.push(prReviews);
  }

  const processedReviews = processEntities(
    github,
    allReviews.flat(),
    prTitleMap
  );
  return processedReviews.filter((review) => {
    return new Date(review.createdAt) > new Date(latestCreationDate);
  });
}

async function processComments(github, latestCreationDate) {
  if (!github.commentsEnabled) {
    debug('Fetching comments is disabled, skipping!');
    return [];
  }

  debug('Getting comments from Github');
  const allCommentedIssues = [];

  // We can only search for commented issues and PRs and then get the comments from there. As we
  // can't sort by comment date, we need to fetch a certain number of issues.
  // There is a possibility that an issue was created before `latestCreationDate`
  // but has later been commented on. Therefore we fetch the commented issues for one year
  // and then later on filter out already stored comments.
  const lowerBoundDate = new Date(latestCreationDate) - ONE_YEAR_IN_MS;
  const generatedPeriod = periodGenerator(github.stopDate, lowerBoundDate);
  for await (const periodChunk of generatedPeriod) {
    const currentPage = pageGenerator(
      github,
      periodChunk,
      (period, page) => getCommentedPage(github, period, page),
      { skipProcessing: true }
    );
    for await (const commentIssues of currentPage) {
      debug(`Got ${commentIssues.length} commented issues`);
      allCommentedIssues.push(commentIssues);
    }
  }

  const commentTitleMap = new Map();
  allCommentedIssues
    .flat()
    .forEach((commentIssue) =>
      commentTitleMap.set(commentIssue.url, commentIssue.title)
    );

  // Now that we have all the commented issues, we need to fetch the actual comments
  const allComments = [];

  const commentsList = getComments(
    allCommentedIssues.flat(),
    github.username,
    github.delayMsPerRequest
  );
  for await (const comments of commentsList) {
    allComments.push(comments);
  }

  const processedComments = processEntities(
    github,
    allComments.flat(),
    commentTitleMap
  );
  return processedComments.filter((comment) => {
    return new Date(comment.createdAt) > new Date(latestCreationDate);
  });
}

function getNextPeriod(stopDate, period, lowerBoundDate) {
  const [before, after] = period;

  // First of the previous month
  // Dates are parsed as UTC midnight, so we need to use the UTC methods
  // throughout, otherwise time zones behind UTC end up in the previous day.
  const afterDate = new Date(after);
  afterDate.setUTCMonth(afterDate.getUTCMonth() - 1);
  const newAfterDay = '01';
  const newAfterMonth = getPadded(afterDate.getUTCMonth() + 1);
  const newAfterYear = afterDate.getUTCFullYear();
  const newAfterDate = `${newAfterYear}-${newAfterMonth}-${newAfterDay}`;

  // Last of the previous month
  const beforeDate = new Date(before);
  beforeDate.setUTCDate(0);
  const newBeforeDay = beforeDate.getUTCDate();
  const newBeforeMonth = getPadded(beforeDate.getUTCMonth() + 1);
  const newBeforeYear = beforeDate.getUTCFullYear();
  const newBeforeDate = `${newBeforeYear}-${newBeforeMonth}-${newBeforeDay}`;

  // `beforeDate` is midnight at the start of the month's last day, so compare
  // against the end of that day. Otherwise a bound later on the last day (e.g.
  // the newest stored contribution) would skip the rest of that day.
  const endOfBeforeDay = new Date(beforeDate);
  endOfBeforeDay.setUTCDate(endOfBeforeDay.getUTCDate() + 1);
  if (
    endOfBeforeDay <= new Date(stopDate) ||
    endOfBeforeDay <= lowerBoundDate
  ) {
    return [];
  }

  return [newBeforeDate, newAfterDate];
}

async function* periodGenerator(stopDate, lowerBoundDate) {
  const date = new Date();
  date.setUTCDate(1);
  const firstOfThisMonth = `${date.getUTCFullYear()}-${getPadded(
    date.getUTCMonth() + 1
  )}-01`;
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  const lastOfThisMonth = `${date.getUTCFullYear()}-${getPadded(
    date.getUTCMonth() + 1
  )}-${date.getUTCDate()}`;
  let currentPeriod = [lastOfThisMonth, firstOfThisMonth];
  while (true) {
    yield currentPeriod;
    currentPeriod = getNextPeriod(stopDate, currentPeriod, lowerBoundDate);
    if (!currentPeriod.length) {
      debug('We reached the stop date, we are done!');
      return;
    }
  }
}

// GitHub search returns at most 1,000 results (10 pages) per query.
const MAX_SEARCH_PAGES = 10;

async function* pageGenerator(github, period, cb, { skipProcessing } = {}) {
  // Pages are only yielded once the period is complete, so a truncated period
  // can be discarded and fetched again in smaller chunks without duplicates.
  const pages = [];
  for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
    debug(`Getting data for period between ${period[1]} and ${period[0]}`);
    const results = await cb(period, page);

    debug(`Got ${results.length} results to filter`);
    pages.push(results);

    // If we have less results than the max result, we're at the end
    if (results.length < RESULTS_PER_PAGE) {
      break;
    }

    if (page === MAX_SEARCH_PAGES) {
      const halves = splitPeriod(period);
      if (!halves.length) {
        throw new Error(
          `GitHub search returned more than ${RESULTS_PER_PAGE * MAX_SEARCH_PAGES} results for ${period[1]}, they cannot all be fetched`
        );
      }

      debug(
        `Search limit reached between ${period[1]} and ${period[0]}, splitting period`
      );
      for (const half of halves) {
        yield* pageGenerator(github, half, cb, { skipProcessing });
      }
      return;
    }
  }

  for (const results of pages) {
    yield skipProcessing
      ? results.filter((item) => filter(github.filter, item))
      : processEntities(github, results);
  }
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${getPadded(
    date.getUTCMonth() + 1
  )}-${getPadded(date.getUTCDate())}`;
}

// Splits an inclusive [before, after] period into two non-overlapping halves,
// newest first. Returns an empty array for a single day.
function splitPeriod([before, after]) {
  const beforeDate = new Date(before);
  const afterDate = new Date(after);
  const days = Math.round((beforeDate - afterDate) / (1000 * 60 * 60 * 24));
  if (days < 1) {
    return [];
  }

  const middle = new Date(afterDate);
  middle.setUTCDate(middle.getUTCDate() + Math.floor((days - 1) / 2));
  const afterMiddle = new Date(middle);
  afterMiddle.setUTCDate(afterMiddle.getUTCDate() + 1);

  return [
    [before, formatDate(afterMiddle)],
    [formatDate(middle), after],
  ];
}

async function getCommitPage(
  { username, delayMsPerRequest },
  commitsPeriod,
  page
) {
  const [before, after] = commitsPeriod;

  debug(`Getting commits page ${page} between ${after} and ${before}`);
  if (delayMsPerRequest !== 0) {
    await waitFor(delayMsPerRequest);
  }
  // Errors are not caught here: an empty result would leave a gap for this
  // period that later runs never go back and fill, so the run must abort.
  return searchCommits({
    q: `author:${username}+author-date:${after}..${before}`,
    sort: 'committer-date',
    page,
  });
}

async function getIssuePage(github, relationship, issuesPeriod, page) {
  const [before, after] = issuesPeriod;

  debug(`Getting issues page ${page} between ${after} and ${before}`);
  if (github.delayMsPerRequest !== 0) {
    await waitFor(github.delayMsPerRequest);
  }
  // Errors are not caught here, see getCommitPage.
  // Items are filtered in pageGenerator, as filtering here would make a full
  // page look like the last one.
  return searchIssues({
    q: `${relationship}:${github.username}+created:${after}..${before}+is:issue`,
    sort: 'created',
    page,
  });
}

async function getCommentedPage(github, commentedPeriod, page) {
  const [before, after] = commentedPeriod;

  debug(`Getting commented page ${page} between ${after} and ${before}`);
  if (github.delayMsPerRequest !== 0) {
    await waitFor(github.delayMsPerRequest);
  }
  // Errors are not caught here, see getCommitPage. Items are filtered in
  // pageGenerator, see getIssuePage.
  // No `is:` qualifier, as the issue comments endpoint also returns the
  // conversation comments of PRs.
  return searchIssues({
    q: `commenter:${github.username}+created:${after}..${before}`,
    sort: 'created',
    page,
  });
}

async function getPRPage(github, relationship, reviewPeriod, page) {
  const [before, after] = reviewPeriod;

  debug(`Getting PR page ${page} between ${after} and ${before}`);
  if (github.delayMsPerRequest !== 0) {
    await waitFor(github.delayMsPerRequest);
  }
  // Errors are not caught here, see getCommitPage. Items are filtered in
  // pageGenerator, see getIssuePage.
  return searchIssues({
    q: `${relationship}:${github.username}+created:${after}..${before}+is:pull-request`,
    sort: 'created',
    page,
  });
}

async function* getPRReviews(prList, reviewerUsername, delay) {
  debug('Getting PR reviews');
  for await (const pr of prList) {
    try {
      const [, owner, repo] = /github\.com\/repos\/(.+)\/(.*)/.exec(
        pr.repository_url
      );
      // We're waiting for a bit here, as we've previously hit a secondary GitHub rate limit...
      if (delay !== 0) {
        await waitFor(delay);
      }
      debug(`Fetching reviews for ${owner}/${repo} PR ${pr.number}`);
      const items = await listReviews({
        owner,
        repo,
        pull_number: pr.number,
      });

      const onlyMyReviews = items.filter(
        (review) => review.user?.login === reviewerUsername
      );

      yield onlyMyReviews;
    } catch (error) {
      // A deleted or otherwise unavailable item has nothing left to fetch, so
      // we skip it. Any other error (rate limit, permissions, network) must
      // abort the run, as otherwise the remaining items would be skipped and
      // the next run would start past them, losing them for good.
      if (isGoneError(error)) {
        debug('Skipping unavailable item while fetching reviews', error);
        continue;
      }

      throw error;
    }
  }

  return [];
}

async function* getComments(issueList, commenterUsername, delay) {
  debug('Getting comments');
  for await (const issue of issueList) {
    try {
      const [, owner, repo] = /github\.com\/repos\/(.+)\/(.*)/.exec(
        issue.repository_url
      );
      // We're waiting for a bit here, as we've previously hit a secondary GitHub rate limit...
      if (delay !== 0) {
        await waitFor(delay);
      }
      debug(`Fetching comments for ${owner}/${repo} issue ${issue.number}`);
      const items = await listComments({
        owner,
        repo,
        issue_number: issue.number,
      });

      const onlyMyComments = items.filter(
        (comment) => comment.user?.login === commenterUsername
      );

      yield onlyMyComments;
    } catch (error) {
      // A deleted or otherwise unavailable item has nothing left to fetch, so
      // we skip it. Any other error (rate limit, permissions, network) must
      // abort the run, as otherwise the remaining items would be skipped and
      // the next run would start past them, losing them for good.
      if (isGoneError(error)) {
        debug('Skipping unavailable item while fetching comments', error);
        continue;
      }

      throw error;
    }
  }

  return [];
}

// GitHub also answers rate limits and missing token permissions with a 403, so
// we only treat a 403 as gone when GitHub states that the repository itself is
// blocked (e.g. for ToS violations). Those, like 451 (DMCA takedowns), will not
// recover and would otherwise abort every run.
const BLOCKED_REPOSITORY_MESSAGE = /repository access blocked/i;

function isGoneError(error) {
  if ([404, 410, 451].includes(error?.status)) {
    return true;
  }

  return (
    error?.status === 403 &&
    BLOCKED_REPOSITORY_MESSAGE.test(error?.response?.data?.message ?? '')
  );
}

async function waitFor(time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

function processEntities(github, entities, titleMap) {
  return entities
    .filter((entity) => filter(github.filter, entity))
    .map((entity) => format(github.types, entity, titleMap));
}

function filter(filterRegex, entity) {
  const matchesRegex = filterRegex.test(entity.html_url);
  const isFork = entity.repository && entity.repository.fork;
  return matchesRegex && !isFork;
}

function format(types, entity, titleMap) {
  if (entity.commit) {
    return formatCommit(types, entity);
  }

  if (entity.pull_request_url) {
    return formatPRReview(types, entity, titleMap);
  }

  if (entity.issue_url) {
    return formatComment(types, entity, titleMap);
  }

  return formatIssue(types, entity);
}

function formatCommit(types, entity) {
  const createdAt = new Date(entity.commit.author.date);
  let description;
  let link = '';

  if (entity.repository.private) {
    description = types?.privateCommit || TYPE_PRIVATE_COMMIT;
  } else {
    description = `${entity.repository.owner.login}/${entity.repository.name}: ${entity.commit.message}`;
    link = entity.html_url;
  }

  return {
    createdAt,
    description,
    link,
    type: types?.commit || TYPE_COMMIT,
    source: GITHUB_COMMIT_CATEGORY,
  };
}

function formatIssue(types, entity) {
  return {
    createdAt: new Date(entity.created_at),
    description: entity.title,
    link: entity.html_url,
    type: entity.pull_request
      ? types?.createdPR || TYPE_CREATED_PR
      : types?.createdIssue || TYPE_CREATED_ISSUE,
    source: entity.pull_request
      ? GITHUB_PR_CREATED_CATEGORY
      : GITHUB_ISSUES_CREATED_CATEGORY,
  };
}

function formatComment(types, entity, titleMap) {
  let description = '';
  if (titleMap) {
    description = titleMap.get(entity.issue_url);
  }

  return {
    createdAt: new Date(entity.created_at),
    description,
    link: entity.html_url,
    type: /\/pull\/\d+/.test(entity.html_url)
      ? types?.commentedPR || TYPE_COMMENTED_PR
      : types?.commented || TYPE_COMMENTED,
    source: GITHUB_COMMENT_CATEGORY,
  };
}

function formatPRReview(types, entity, titleMap) {
  const type = (() => {
    switch (entity.state) {
      case 'COMMENTED':
        return types?.commentedPR || TYPE_COMMENTED_PR;
      case 'APPROVED':
        return types?.approvedPR || TYPE_APPROVED_PR;
      case 'CHANGES_REQUESTED':
        return types?.changesRequestedPR || TYPE_CHANGES_REQUESTED_PR;
      default:
        return types?.reviewedPR || TYPE_REVIEWED_PR;
    }
  })();

  let description = '';
  if (titleMap) {
    description = titleMap.get(entity.pull_request_url);
  }

  return {
    createdAt: new Date(entity.submitted_at),
    description,
    link: entity.html_url,
    type,
    source: GITHUB_REVIEW_CATEGORY,
  };
}
