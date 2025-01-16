import Debug from 'debug';
import {
  listComments,
  listReviews,
  PRIVATE_SCOPE_ERROR,
  RESULTS_PER_PAGE,
  searchCommits,
  searchIssues,
  throwIfTokenHasPrivateRepoScope,
} from './github-fetcher.js';
import { getPadded } from './utils.js';

const debug = Debug('contributions:github');

const ONE_YEAR_IN_MS = 1000 * 60 * 60 * 24 * 365;
const DELAY_FETCHING_MS = 2000;
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

export function validate(config) {
  debug('Validating GitHub config');

  if (!config) {
    return;
  }

  if (config && config.enabled && !config.username) {
    throw new Error('GitHub: username is required');
  }

  if (config && config.enabled && !config.stopDate) {
    throw new Error('GitHub: stopDate is required');
  }

  if (config && config.enabled && !config.filter) {
    throw new Error('GitHub: filter is required');
  }
}

export async function gather({ github }, existingContributions = []) {
  if (!github || (github && !github.enabled)) {
    debug('GitHub source not enabled, skipping');
    return [];
  }

  const latestCommit = existingContributions.find((contribution) => {
    return contribution.source === GITHUB_COMMIT_CATEGORY;
  }) || { createdAt: github.stopDate };
  const latestIssue = existingContributions.find(
    (contribution) => contribution.source === GITHUB_ISSUES_CREATED_CATEGORY
  ) || { createdAt: github.stopDate };
  const latestPR = existingContributions.find(
    (contribution) => contribution.source === GITHUB_PR_CREATED_CATEGORY
  ) || { createdAt: github.stopDate };
  const latestReview = existingContributions.find((contribution) => {
    return contribution.source === GITHUB_REVIEW_CATEGORY;
  }) || { createdAt: github.stopDate };
  const latestComment = existingContributions.find((contribution) => {
    return contribution.source === GITHUB_COMMENT_CATEGORY;
  }) || { createdAt: github.stopDate };

  try {
    await throwIfTokenHasPrivateRepoScope();
  } catch (error) {
    if (error.message === PRIVATE_SCOPE_ERROR) {
      if (!github.allowPrivate) {
        throw new Error(
          'GITHUB_TOKEN might have private repo scope, but the config does not specify `allowPrivate` to fetch private repos. Are you sure you want to fetch private information? This might also be because you passed a fine-grained token. In that case we can not check the permissions it has and we assume it is private. You can double check the permissions and if you are sure it is correct, you may set `allowPrivate` to true.'
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
  if (
    typeof github.issuesEnabled !== 'undefined' &&
    github.issuesEnabled === false
  ) {
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
  if (
    typeof github.issuesEnabled !== 'undefined' &&
    github.issuesEnabled === false
  ) {
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
  if (
    typeof github.commitsEnabled !== 'undefined' &&
    github.commitsEnabled === false
  ) {
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
  if (
    typeof github.reviewsEnabled !== 'undefined' &&
    github.reviewsEnabled === false
  ) {
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
  if (
    typeof github.commentsEnabled !== 'undefined' &&
    github.commentsEnabled === false
  ) {
    debug('Fetching comments is disabled, skipping!');
    return [];
  }

  debug('Getting comments from Github');
  const allCommentedIssues = [];

  // We can only search for commented issues and then get the comments from there. As we
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
      (period, page) => getIssuePage(github, 'commenter', period, page),
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
  const afterDate = new Date(after);
  afterDate.setMonth(afterDate.getMonth() - 1);
  const newAfterDay = '01';
  const newAfterMonth = getPadded(afterDate.getMonth() + 1);
  const newAfterYear = afterDate.getFullYear();
  const newAfterDate = `${newAfterYear}-${newAfterMonth}-${newAfterDay}`;

  // Last of the previous month
  const beforeDate = new Date(before);
  beforeDate.setDate(0);
  const newBeforeDay = beforeDate.getDate();
  const newBeforeMonth = getPadded(beforeDate.getMonth() + 1);
  const newBeforeYear = beforeDate.getFullYear();
  const newBeforeDate = `${newBeforeYear}-${newBeforeMonth}-${newBeforeDay}`;

  if (beforeDate < stopDate || beforeDate < lowerBoundDate) {
    return [];
  }

  return [newBeforeDate, newAfterDate];
}

async function* periodGenerator(stopDate, lowerBoundDate) {
  const date = new Date();
  const firstOfThisMonth = `${date.getFullYear()}-${getPadded(
    date.getMonth() + 1
  )}-01`;
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  const lastOfThisMonth = `${date.getFullYear()}-${getPadded(
    date.getMonth() + 1
  )}-${date.getDate()}`;
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

async function* pageGenerator(github, period, cb, { skipProcessing } = {}) {
  let hasMoreToFetch = true;
  let page = 1;
  while (hasMoreToFetch) {
    debug(`Getting data for period between ${period[1]} and ${period[0]}`);
    const results = await cb(period, page); // eslint-disable-line no-await-in-loop

    if (!Array.isArray(results)) {
      return;
    }

    debug(`Got ${results.length} results to filter`);
    // If we have less results than the max result, we're at the end
    // Special case: GitHub doesn't let us fetch more than 10 pages, so we just
    // pretend we are done for that period..
    if (
      (Array.isArray(results) && results.length < RESULTS_PER_PAGE) ||
      page === 10
    ) {
      hasMoreToFetch = false;
      yield skipProcessing ? results : processEntities(github, results);
      return;
    }

    page++;
    yield skipProcessing ? results : processEntities(github, results);
  }
}

async function getCommitPage(
  { username, delayMsPerRequest },
  commitsPeriod,
  page
) {
  const [before, after] = commitsPeriod;

  debug(`Getting commits page ${page} between ${after} and ${before}`);
  if (delayMsPerRequest !== 0) {
    await waitFor(delayMsPerRequest ?? DELAY_FETCHING_MS);
  }
  try {
    const items = await searchCommits({
      q: `author:${username}+author-date:${after}..${before}`,
      sort: 'committer-date',
      page,
    });

    return items;
  } catch (error) {
    debug('Error fetching commits', error);
    return [];
  }
}

async function getIssuePage(github, relationship, issuesPeriod, page) {
  const [before, after] = issuesPeriod;

  debug(`Getting issues page ${page} between ${after} and ${before}`);
  if (github.delayMsPerRequest !== 0) {
    await waitFor(github.delayMsPerRequest ?? DELAY_FETCHING_MS);
  }
  try {
    const items = await searchIssues({
      q: `${relationship}:${github.username}+created:${after}..${before}+is:issue`,
      sort: 'created',
      page,
    });

    // We already want to filter here, as otherwise we will fetch many comments
    // that will later be discarded anyway.
    const filteredItems = items.filter((item) => filter(github.filter, item));

    return filteredItems;
  } catch (error) {
    debug('Error fetching issues', error);
    return [];
  }
}

async function getPRPage(github, relationship, reviewPeriod, page) {
  const [before, after] = reviewPeriod;

  debug(`Getting PR page ${page} between ${after} and ${before}`);
  if (github.delayMsPerRequest !== 0) {
    await waitFor(github.delayMsPerRequest ?? DELAY_FETCHING_MS);
  }
  try {
    const items = await searchIssues({
      q: `${relationship}:${github.username}+created:${after}..${before}+is:pull-request`,
      sort: 'created',
      page,
    });

    // We want to filter the issues here, as we do not care about
    // PR reviews that will eventually not match the filter.
    // If we do not do this, the PR reviews will be filtered after
    // getting each review for all the issues. We can save quite some
    // requests if we filter before.
    const filteredItems = items.filter((item) => filter(github.filter, item));

    return filteredItems;
  } catch (error) {
    debug('Error fetching PRs', error);
    return [];
  }
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
        await waitFor(delay ?? DELAY_FETCHING_MS);
      }
      debug(`Fetching reviews for ${owner}/${repo} PR ${pr.number}`);
      const items = await listReviews({
        owner,
        repo,
        pull_number: pr.number,
      });

      const onlyMyReviews = items.filter(
        (review) => review.user.login === reviewerUsername
      );

      yield onlyMyReviews;
    } catch (error) {
      debug('Error fetching reviews', error);
      return [];
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
        await waitFor(delay ?? DELAY_FETCHING_MS);
      }
      debug(`Fetching comments for ${owner}/${repo} issue ${issue.number}`);
      const items = await listComments({
        owner,
        repo,
        issue_number: issue.number,
      });

      const onlyMyComments = items.filter(
        (comment) => comment.user.login === commenterUsername
      );

      yield onlyMyComments;
    } catch (error) {
      debug('Error fetching comments', error);
      return [];
    }
  }

  return [];
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

function filter(githubFilter, entity) {
  const regex = new RegExp(githubFilter, 'i');
  const matchesRegex = regex.test(entity.html_url);
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
  let description = '';
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
    type: types?.commented || TYPE_COMMENTED,
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
