const debug = require('debug')('contributions:github');
const fetcher = require('./github-fetcher');

const ONE_YEAR_IN_MS = 1000 * 60 * 60 * 24 * 365;
const DELAY_FETCHING_MS = 2000;
const GITHUB_COMMIT_CATEGORY = 'github-commit';
const GITHUB_ISSUES_CREATED_CATEGORY = 'github-issues-created';
const GITHUB_PR_CREATED_CATEGORY = 'github-pr-created';
const GITHUB_REVIEW_CATEGORY = 'github-reviews';

module.exports = {
  gather,
  validate,
};

function validate(config) {
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

  if (config && config.enabled && !config.types) {
    throw new Error('GitHub: types is required');
  }

  if (config && config.enabled && !config.types.commit) {
    throw new Error('GitHub: commit type is required');
  }

  if (config && config.enabled && !config.types.privateCommit) {
    throw new Error('GitHub: privateCommit type is required');
  }

  if (config && config.enabled && !config.types.createdPR) {
    throw new Error('GitHub: createdPR type is required');
  }

  if (config && config.enabled && !config.types.createdIssue) {
    throw new Error('GitHub: createdIssue type is required');
  }

  if (config && config.enabled && !config.types.commentedPR) {
    throw new Error('GitHub: commentedPR type is required');
  }

  if (config && config.enabled && !config.types.approvedPR) {
    throw new Error('GitHub: approvedPR type is required');
  }

  if (config && config.enabled && !config.types.changesRequestedPR) {
    throw new Error('GitHub: changesRequestedPR type is required');
  }

  if (config && config.enabled && !config.types.reviewedPR) {
    throw new Error('GitHub: reviewedPR type is required');
  }
}

async function gather({ github }, existingContributions = []) {
  const latestCommit = existingContributions.find((contribution) => {
    return contribution.source === GITHUB_COMMIT_CATEGORY;
  }) || { createdAt: github.stopDate };
  const latestIssue = existingContributions.find((contribution) => {
    return contribution.source === GITHUB_ISSUES_CREATED_CATEGORY
      || contribution.source === GITHUB_PR_CREATED_CATEGORY;
  }) || { createdAt: github.stopDate };
  const latestReview = existingContributions.find((contribution) => {
    return contribution.source === GITHUB_REVIEW_CATEGORY;
  }) || { createdAt: github.stopDate };

  try {
    await fetcher.throwIfTokenHasPrivateRepoScope();
  } catch (error) {
    if (error.message === 'PRIVATE_SCOPE') {
      if (!github.allowPrivate) {
        throw new Error('GITHUB_TOKEN has private repo scope, but the config does not specify allowPrivate to fetch private repos. Are you sure you want to fetch private information?');
      }
    } else {
      throw error;
    }
  }

  const commits = await processCommits(github, latestCommit.createdAt);
  const issues = await processIssues(github, latestIssue.createdAt);
  const reviews = await processReviews(github, latestReview.createdAt);
  const contributions = [
    ...commits,
    ...issues,
    ...reviews,
  ];

  debug('Finished gathering contributions');
  return contributions;
}

async function processIssues(github, latestCreationDate) {
  debug('Getting issues from Github');
  const allIssues = [];

  const lowerBoundDate = new Date(latestCreationDate);
  const generatedPeriod = periodGenerator(github.stopDate, lowerBoundDate);
  for await (const periodChunk of generatedPeriod) {
    const currentPage = pageGenerator(
      github,
      periodChunk,
      (period, page) => getIssuePage(github.username, period, page)
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

async function processCommits(github, latestCreationDate) {
  debug('Getting commits from Github');
  const allCommits = [];

  const lowerBoundDate = new Date(latestCreationDate);
  const generatedPeriod = periodGenerator(github.stopDate, lowerBoundDate);
  for await (const periodChunk of generatedPeriod) {
    const currentPage = pageGenerator(
      github,
      periodChunk,
      (period, page) => getCommitPage(github.username, period, page)
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
      (period, page) => getPRPage(github, period, page),
      { skipProcessing: true }
    );
    for await (const prs of currentPage) {
      debug(`Got ${prs.length} PRs`);
      allPRs.push(prs);
    }
  }

  // Now that we have all the PRs, we need to fetch the reviews
  const allReviews = [];

  const prReviewsList = getPRReviews(allPRs.flat());
  for await (const prReviews of prReviewsList) {
    allReviews.push(prReviews);
  }

  const processedReviews = processEntities(github, allReviews.flat());

  return processedReviews.filter((review) => {
    return new Date(review.createdAt) > new Date(latestCreationDate);
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

function getPadded(number) {
  if (number < 10) {
    return `0${number}`;
  }

  return `${number}`;
}

async function* periodGenerator(stopDate, lowerBoundDate) {
  const date = new Date();
  const firstOfThisMonth = `${date.getFullYear()}-${getPadded(date.getMonth() + 1)}-01`;
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  const lastOfThisMonth = `${date.getFullYear()}-${getPadded(date.getMonth() + 1)}-${date.getDate()}`;
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
    debug(`Got ${results.length} results to filter`);
    // If we have less results than the max result, we're at the end
    // Special case: GitHub doesn't let us fetch more than 10 pages, so we just
    // pretend we are done for that period..
    if (results.length < fetcher.RESULTS_PER_PAGE || page === 10) {
      hasMoreToFetch = false;
      yield skipProcessing ? results : processEntities(github, results);
      return;
    }

    page++;
    yield skipProcessing ? results : processEntities(github, results);
  }
}

async function getCommitPage(username, commitsPeriod, page) {
  const [before, after] = commitsPeriod;

  debug(`Getting commits page ${page} between ${after} and ${before}`);
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const items = await fetcher.searchCommits({
          q: `author:${username}+author-date:${after}..${before}`,
          sort: 'committer-date',
          page,
        });

        return resolve(items);
      } catch (error) {
        debug('Error fetching commits', error);
        return resolve([]);
      }
    }, DELAY_FETCHING_MS);
  });
}

async function getIssuePage(username, issuesPeriod, page) {
  const [before, after] = issuesPeriod;

  debug(`Getting issues page ${page} between ${after} and ${before}`);
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const items = await fetcher.searchIssues({
          q: `author:${username}+created:${after}..${before}`,
          sort: 'created',
          page,
        });

        return resolve(items);
      } catch (error) {
        debug('Error fetching issues', error);
        return resolve([]);
      }
    }, DELAY_FETCHING_MS);
  });
}

async function getPRPage(github, reviewPeriod, page) {
  const [before, after] = reviewPeriod;

  debug(`Getting reviews page ${page} between ${after} and ${before}`);
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const items = await fetcher.searchIssues({
          q: `reviewed-by:${github.username}+created:${after}..${before}`,
          sort: 'created',
          page,
        });

        // We want to filter the issues here, as we do not care about
        // PR reviews that will eventually not match the filter.
        // If we do not do this, the PR reviews will be filtered after
        // getting each review for all the issues. We can save quite some
        // requests if we filter before.
        const filteredItems = items.filter((item) => filter(github.filter, item));

        return resolve(filteredItems);
      } catch (error) {
        debug('Error fetching PRs', error);
        return resolve([]);
      }
    }, DELAY_FETCHING_MS);
  });
}

async function* getPRReviews(prList) {
  debug('Getting PR reviews');
  for await (const pr of prList) {
    try {
      const [, owner, repo] = /github\.com\/repos\/(.+)\/(.*)/.exec(pr.repository_url);
      // We're waiting for a bit here, as we've previously hit a secondary GitHub rate limit...
      await waitFor(1000);
      debug(`Fetching reviews for ${owner}/${repo} PR ${pr.number}`);
      const items = await fetcher.listReviews({
        owner,
        repo,
        pull_number: pr.number,
      });

      yield items;
    } catch (error) {
      debug('Error fetching reviews', error);
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

function processEntities(github, entities) {
  return entities
    .filter((entity) => filter(github.filter, entity))
    .map((entity) => format(github.types, entity));
}

function filter(githubFilter, entity) {
  const regex = new RegExp(githubFilter, 'i');
  const matchesRegex = regex.test(entity.html_url);
  const isFork = entity.repository && entity.repository.fork;
  return matchesRegex && !isFork;
}

function format(types, entity) {
  if (entity.commit) {
    return formatCommit(types, entity);
  }

  if (entity.pull_request_url) {
    return formatPRReview(types, entity);
  }

  return formatIssue(types, entity);
}

function formatCommit(types, entity) {
  const createdAt = new Date(entity.commit.author.date);
  let description = '';
  let link = '';

  if (entity.repository.private) {
    description = types.privateCommit;
  } else {
    description = `${entity.repository.owner.login}/${entity.repository.name}: ${entity.commit.message}`;
    link = entity.html_url;
  }

  return {
    createdAt,
    description,
    link,
    type: types.commit,
    source: GITHUB_COMMIT_CATEGORY,
  };
}

function formatIssue(types, entity) {
  return {
    createdAt: new Date(entity.created_at),
    description: entity.title,
    link: entity.html_url,
    type: entity.pull_request ? types.createdPR : types.createdIssue,
    source: entity.pull_request ? GITHUB_PR_CREATED_CATEGORY : GITHUB_ISSUES_CREATED_CATEGORY,
  };
}

function formatPRReview(types, entity) {
  const type = (() => {
    switch (entity.state) {
      case 'COMMENTED':
        return types.commentedPR;
      case 'APPROVED':
        return types.approvedPR;
      case 'CHANGES_REQUESTED':
        return types.changesRequestedPR;
      default:
        return types.reviewedPR;
    }
  })();

  return {
    createdAt: new Date(entity.submitted_at),
    description: '',
    link: entity.html_url,
    type,
    source: GITHUB_REVIEW_CATEGORY,
  };
}