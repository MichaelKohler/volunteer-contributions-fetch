import Debug from 'debug';
import { setTimeout as sleep } from 'timers/promises';
import { z } from 'zod';
import {
  type CommitSearchItem,
  type IssueComment,
  type IssueSearchItem,
  type Review,
  getRepository,
  listComments,
  listReviews,
  PRIVATE_SCOPE_ERROR,
  RESULTS_PER_PAGE,
  searchCommits,
  searchIssues,
  throwIfTokenHasPrivateRepoScope,
} from './github-fetcher.js';
import {
  dateSchema,
  findLatest,
  getPadded,
  regexSchema,
  sourceSchema,
  stopDateSchema,
} from './utils.js';
import { tagRuleSchema } from './tags.js';
import type { Contribution, FetchedContribution } from './types.js';

const debug = Debug('contributions:github');

const ONE_YEAR_IN_MS = 1000 * 60 * 60 * 24 * 365;
const GITHUB_COMMIT_CATEGORY = 'github-commit';
const GITHUB_ISSUES_CREATED_CATEGORY = 'github-issues-created';
const GITHUB_PR_CREATED_CATEGORY = 'github-pr-created';
const GITHUB_REVIEW_CATEGORY = 'github-reviews';
const GITHUB_COMMENT_CATEGORY = 'github-comments';

export const CATEGORIES = [
  GITHUB_COMMIT_CATEGORY,
  GITHUB_ISSUES_CREATED_CATEGORY,
  GITHUB_PR_CREATED_CATEGORY,
  GITHUB_REVIEW_CATEGORY,
  GITHUB_COMMENT_CATEGORY,
];

// Rules only add tags to contributions accepted by `filter`, the pattern is
// matched against the link of the contribution.
const githubTagRuleSchema = tagRuleSchema.extend({
  pattern: regexSchema('pattern'),
});

const TYPE_COMMIT = 'GitHub Commit';
const TYPE_PRIVATE_COMMIT = 'Commit in private repository';
const TYPE_PRIVATE_CONTRIBUTION = 'Contribution in private repository';
const TYPE_CREATED_PR = 'Created PR';
const TYPE_CREATED_ISSUE = 'Created Issue Report';
const TYPE_COMMENTED_PR = 'Commented on a Pull Request';
const TYPE_APPROVED_PR = 'Approved a Pull Request';
const TYPE_CHANGES_REQUESTED_PR = 'Requested changes on a Pull Request';
const TYPE_REVIEWED_PR = 'Reviewed a Pull Request';
const TYPE_COMMENTED = 'Commented on an Issue';

export const githubSchema = sourceSchema(
  z
    .strictObject({
      enabled: z.literal(true),
      allowPrivate: z.boolean().default(false),
      commentsEnabled: z.boolean().default(true),
      commitsEnabled: z.boolean().default(true),
      issuesEnabled: z.boolean().default(true),
      reviewsEnabled: z.boolean().default(true),
      username: z.string().min(1),
      stopDate: stopDateSchema,
      filter: regexSchema('filter'),
      tagRules: z.array(githubTagRuleSchema).optional(),
      types: z
        .strictObject({
          commit: z.string().optional(),
          privateCommit: z.string().optional(),
          privateContribution: z.string().optional(),
          createdPR: z.string().optional(),
          createdIssue: z.string().optional(),
          commented: z.string().optional(),
          commentedPR: z.string().optional(),
          approvedPR: z.string().optional(),
          changesRequestedPR: z.string().optional(),
          reviewedPR: z.string().optional(),
        })
        .optional(),
      delayMsPerRequest: z.number().nonnegative().default(2000),
    })
    .refine(
      (github) =>
        github.commitsEnabled ||
        github.issuesEnabled ||
        github.reviewsEnabled ||
        github.commentsEnabled,
      {
        message:
          'At least one of commitsEnabled, issuesEnabled, reviewsEnabled or commentsEnabled must be true. Set enabled to false to disable the GitHub source.',
      }
    )
);

export type GitHubConfig = z.output<typeof githubSchema>;
export type EnabledGitHubConfig = Extract<GitHubConfig, { enabled: true }>;
type GitHubTypes = EnabledGitHubConfig['types'];

// The config of the GitHub source, extended with what is needed during a run.
interface Context extends EnabledGitHubConfig {
  // Limits the search to some organizations or repositories, see backfill.
  searchQualifier: string;
  isPrivateRepo: (fullName: string) => Promise<boolean>;
}

// An inclusive period of [before, after] dates in the form YYYY-MM-DD.
type Period = [before: string, after: string];

interface SearchOptions {
  getPeriods: () => AsyncIterable<Period> | Iterable<Period>;
  isWanted: (contribution: FetchedContribution) => boolean;
}

type IssueOrComment = IssueSearchItem | Review | IssueComment;
type GitHubEntity = CommitSearchItem | IssueOrComment;

export async function gather(
  { github }: { github?: GitHubConfig },
  existingContributions: Contribution[] = []
): Promise<FetchedContribution[]> {
  if (!github?.enabled) {
    debug('GitHub source not enabled, skipping');
    return [];
  }

  const existingCommits = existingContributions.filter(
    (contribution) => contribution.source === GITHUB_COMMIT_CATEGORY
  );
  const latestCreationDate = (category: string) =>
    getLatestCreationDate(existingContributions, category, github.stopDate);
  const newerThan = (date: Date) => (contribution: FetchedContribution) =>
    new Date(contribution.createdAt) > date;
  const searchSince = (date: Date) => () =>
    periodGenerator(github.stopDate, date);

  const context = await createContext(github);

  // Commits are dated by their author date, which is set when the commit is
  // written and not when it lands on the default branch, the only branch the
  // search covers. A commit merged after a newer one was stored would therefore
  // be older than the latest stored commit. Therefore we fetch the commits for
  // one year and then later on filter out already stored commits.
  const latestCommit = latestCreationDate(GITHUB_COMMIT_CATEGORY);
  const storedCommitKeys = new Set(existingCommits.map(getCommitKey));
  const commits = await processCommits(context, {
    getPeriods: searchSince(new Date(latestCommit.getTime() - ONE_YEAR_IN_MS)),
    isWanted: (commit) =>
      new Date(commit.createdAt) > new Date(github.stopDate) &&
      !storedCommitKeys.has(getCommitKey(commit)),
  });

  const latestIssue = latestCreationDate(GITHUB_ISSUES_CREATED_CATEGORY);
  const issues = await processIssues(context, {
    getPeriods: searchSince(latestIssue),
    isWanted: newerThan(latestIssue),
  });

  const latestPR = latestCreationDate(GITHUB_PR_CREATED_CATEGORY);
  const prs = await processPRs(context, {
    getPeriods: searchSince(latestPR),
    isWanted: newerThan(latestPR),
  });

  const latestReview = latestCreationDate(GITHUB_REVIEW_CATEGORY);
  const reviews = await processReviews(context, {
    getPeriods: searchSince(latestReview),
    isWanted: newerThan(latestReview),
  });

  const latestComment = latestCreationDate(GITHUB_COMMENT_CATEGORY);
  const comments = await processComments(context, {
    getPeriods: searchSince(latestComment),
    isWanted: newerThan(latestComment),
  });

  debug('Finished gathering contributions');
  return [...commits, ...issues, ...prs, ...reviews, ...comments];
}

// Returns the creation date of the newest stored contribution of `category`,
// or the stop date if there is none. Regular runs only fetch contributions
// newer than this.
function getLatestCreationDate(
  existingContributions: Contribution[],
  category: string,
  stopDate: string
): Date {
  const latest = findLatest(
    existingContributions,
    (contribution) => contribution.source === category
  );
  return new Date(latest ? latest.createdAt : stopDate);
}

// GitHub logins, organization and repository names only consist of these
// characters. Validating them keeps the values from changing the search query.
const OWNER_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const REPO_NAME = /^[A-Za-z0-9_.-]+$/;

const ownerSchema = z
  .string()
  .regex(OWNER_NAME, { message: 'must be a GitHub user or organization name' });
const repoSchema = z.string().refine(
  (value) => {
    const [owner, name, ...rest] = value.split('/');
    return (
      rest.length === 0 &&
      owner !== undefined &&
      OWNER_NAME.test(owner) &&
      name !== undefined &&
      REPO_NAME.test(name)
    );
  },
  { message: 'must be in the form owner/repo' }
);

export const backfillOptionsSchema = z
  .strictObject({
    orgs: z.array(ownerSchema).default([]),
    users: z.array(ownerSchema).default([]),
    repos: z.array(repoSchema).default([]),
    startDate: dateSchema('startDate').optional(),
    endDate: dateSchema('endDate').optional(),
  })
  .refine(
    (options) =>
      options.orgs.length + options.users.length + options.repos.length > 0,
    {
      message:
        'At least one of orgs, users or repos is required, so that only the needed contributions are searched for.',
    }
  )
  .refine(
    (options) =>
      !options.startDate ||
      !options.endDate ||
      new Date(options.startDate) <= new Date(options.endDate),
    { message: 'startDate must not be after endDate' }
  );

export type BackfillOptions = z.input<typeof backfillOptionsSchema>;

// Fetches the contributions of the given organizations, users or repositories
// between `startDate` (defaults to the stop date) and `endDate` (defaults to
// now). This is meant to be run once after adding a new pattern to `filter`,
// as regular runs only fetch contributions newer than the stored ones.
// Results still have to match `filter`, and stored contributions are skipped.
export async function backfill(
  { github }: { github?: GitHubConfig },
  rawOptions: BackfillOptions,
  existingContributions: Contribution[]
): Promise<FetchedContribution[]> {
  if (!github?.enabled) {
    throw new Error('The GitHub source must be enabled to backfill it.');
  }

  const options = backfillOptionsSchema.parse(rawOptions);
  const startDate = new Date(options.startDate ?? github.stopDate);
  const endDate = options.endDate ? new Date(options.endDate) : new Date();
  // The end date is inclusive, so everything before the next day is wanted.
  const endOfEndDate = startOfNextUTCDay(endDate);
  const qualifiers = [
    ...options.orgs.map((org) => `org:${org}`),
    ...options.users.map((user) => `user:${user}`),
    ...options.repos.map((repo) => `repo:${repo}`),
  ];

  // Regular runs continue after the newest stored contribution of each
  // category. A backfilled contribution newer than that would move this point
  // forward and the next regular run would skip everything in between outside
  // of the backfilled qualifiers. Those newer contributions are fetched by the
  // next regular run anyway.
  const latestStored = new Map(
    CATEGORIES.map((category) => [
      category,
      getLatestCreationDate(existingContributions, category, github.stopDate),
    ])
  );
  const storedKeys = new Set(existingContributions.map(getBackfillKey));
  const isWanted = (contribution: FetchedContribution) => {
    const createdAt = new Date(contribution.createdAt);
    const key = getBackfillKey(contribution);
    if (createdAt < startDate || createdAt >= endOfEndDate) {
      return false;
    }

    const latest = latestStored.get(contribution.source);
    if (latest && createdAt > latest) {
      return false;
    }

    // Also skips duplicates between overlapping qualifiers, e.g. an
    // organization and one of its repositories.
    if (storedKeys.has(key)) {
      return false;
    }

    storedKeys.add(key);
    return true;
  };

  const context = await createContext(github);
  // Comments and reviews are found through the update date of their issue or
  // PR, which can be any time after the comment was written.
  const createdPeriods = () => backfillPeriodGenerator(startDate, endDate);
  const updatedPeriods = () => backfillPeriodGenerator(startDate, new Date());

  const contributions: FetchedContribution[] = [];
  for (const qualifier of qualifiers) {
    debug(`Backfilling ${qualifier}`);
    const qualifiedContext = { ...context, searchQualifier: qualifier };
    contributions.push(
      ...(await processCommits(qualifiedContext, {
        getPeriods: createdPeriods,
        isWanted,
      })),
      ...(await processIssues(qualifiedContext, {
        getPeriods: createdPeriods,
        isWanted,
      })),
      ...(await processPRs(qualifiedContext, {
        getPeriods: createdPeriods,
        isWanted,
      })),
      ...(await processReviews(qualifiedContext, {
        getPeriods: updatedPeriods,
        isWanted,
      })),
      ...(await processComments(qualifiedContext, {
        getPeriods: updatedPeriods,
        isWanted,
      }))
    );
  }

  debug(`Finished backfilling ${contributions.length} contributions`);
  return contributions;
}

// Titles of issues and PRs can change, so they are not part of the key. The
// link identifies a contribution, apart from commits (see getCommitKey) and
// private contributions, which have no link.
function getBackfillKey(contribution: Contribution): string {
  if (contribution.source === GITHUB_COMMIT_CATEGORY) {
    return `${contribution.source}|${getCommitKey(contribution)}`;
  }

  if (contribution.link) {
    return `${contribution.source}|${contribution.link}`;
  }

  return `${contribution.source}|${new Date(contribution.createdAt).getTime()}`;
}

function startOfNextUTCDay(date: Date): Date {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function createContext(github: EnabledGitHubConfig): Promise<Context> {
  try {
    await throwIfTokenHasPrivateRepoScope();
  } catch (error) {
    if (error instanceof Error && error.message === PRIVATE_SCOPE_ERROR) {
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

  return {
    ...github,
    searchQualifier: '',
    isPrivateRepo: createPrivateRepoLookup(github.delayMsPerRequest),
  };
}

// Each process function searches the periods returned by `getPeriods` and
// returns the contributions for which `isWanted` returns true.
async function processIssues(
  github: Context,
  { getPeriods, isWanted }: SearchOptions
): Promise<FetchedContribution[]> {
  if (!github.issuesEnabled) {
    debug('Fetching issues is disabled, skipping!');
    return [];
  }

  debug('Getting issues from Github');
  const allIssues = await searchAllPeriods(
    getPeriods(),
    (period, page) => getIssuePage(github, 'author', period, page),
    'issues',
    (results) => processEntities(github, results)
  );

  return allIssues.filter(isWanted);
}

async function processPRs(
  github: Context,
  { getPeriods, isWanted }: SearchOptions
): Promise<FetchedContribution[]> {
  if (!github.issuesEnabled) {
    debug('Fetching PRs is disabled through `issuesEnabled`, skipping!');
    return [];
  }

  debug('Getting PRs from Github');
  const allPRs = await searchAllPeriods(
    getPeriods(),
    (period, page) => getPRPage(github, 'author', period, page),
    'PRs',
    (results) => processEntities(github, results)
  );

  return allPRs.filter(isWanted);
}

async function processCommits(
  github: Context,
  { getPeriods, isWanted }: SearchOptions
): Promise<FetchedContribution[]> {
  if (!github.commitsEnabled) {
    debug('Fetching commits is disabled, skipping!');
    return [];
  }

  debug('Getting commits from Github');
  const allCommits = await searchAllPeriods(
    getPeriods(),
    (period, page) => getCommitPage(github, period, page),
    'commits',
    (results) => processEntities(github, results)
  );

  return allCommits.filter(isWanted);
}

// We key on the SHA rather than the full link, as the link changes when a repo
// is renamed or moved and the commit would otherwise be stored again. Private
// commits have no link, so we fall back to the date for those.
function getCommitKey(commit: Contribution): string | number {
  if (!commit.link) {
    return new Date(commit.createdAt).getTime();
  }

  return commit.link.split('/').pop()!;
}

async function processReviews(
  github: Context,
  { getPeriods, isWanted }: SearchOptions
): Promise<FetchedContribution[]> {
  if (!github.reviewsEnabled) {
    debug('Fetching reviews is disabled, skipping!');
    return [];
  }

  debug('Getting reviews from Github');

  // We can only search for PRs and then get the reviews from there. A new
  // review updates its PR, so searching by update date finds every PR with a
  // review newer than the searched periods, no matter when the PR was created.
  // The unwanted reviews of those PRs are filtered out further down.
  const allPRs = await searchAllPeriods(
    getPeriods(),
    (period, page) => getPRPage(github, 'reviewed-by', period, page, 'updated'),
    'PRs',
    (results) => filterOwn(github, results)
  );

  const prTitleMap = new Map<string, string>();
  allPRs.forEach((pr) => prTitleMap.set(pr.pull_request!.url!, pr.title));

  // Now that we have all the PRs, we need to fetch the reviews
  const allReviews: Review[][] = [];

  const prReviewsList = getPRReviews(
    allPRs,
    github.username,
    github.delayMsPerRequest
  );
  for await (const prReviews of prReviewsList) {
    allReviews.push(prReviews);
  }

  const processedReviews = await processEntities(
    github,
    allReviews.flat(),
    prTitleMap
  );
  return processedReviews.filter(isWanted);
}

async function processComments(
  github: Context,
  { getPeriods, isWanted }: SearchOptions
): Promise<FetchedContribution[]> {
  if (!github.commentsEnabled) {
    debug('Fetching comments is disabled, skipping!');
    return [];
  }

  debug('Getting comments from Github');

  // We can only search for commented issues and PRs and then get the comments
  // from there. A new comment updates its issue or PR, so searching by update
  // date finds every one with a comment newer than the searched periods, no
  // matter when it was created. The unwanted comments are filtered out further
  // down.
  const allCommentedIssues: IssueSearchItem[] = [];
  for (const type of ['issue', 'pull-request']) {
    const commented = await searchAllPeriods(
      getPeriods(),
      (period, page) => getCommentedPage(github, type, period, page),
      `commented ${type}s`,
      (results) => filterOwn(github, results)
    );
    allCommentedIssues.push(...commented);
  }

  const commentTitleMap = new Map<string, string>();
  allCommentedIssues.forEach((commentIssue) =>
    commentTitleMap.set(commentIssue.url, commentIssue.title)
  );

  // Now that we have all the commented issues, we need to fetch the actual comments
  const allComments: IssueComment[][] = [];

  const commentsList = getComments(
    allCommentedIssues,
    github.username,
    github.delayMsPerRequest
  );
  for await (const comments of commentsList) {
    allComments.push(comments);
  }

  const processedComments = await processEntities(
    github,
    allComments.flat(),
    commentTitleMap
  );
  return processedComments.filter(isWanted);
}

// Search results are returned as they are, only filtered by `filter`. Used
// when the actual contributions (e.g. reviews or comments) are fetched later.
function filterOwn<T extends GitHubEntity>(github: Context, results: T[]): T[] {
  return results.filter((item) => filter(github.filter, item));
}

type GetPage<T> = (period: Period, page: number) => Promise<T[]>;
type ProcessPage<T, R> = (results: T[]) => R[] | Promise<R[]>;

// Runs a search for every period and returns the results of all pages, each
// page passed through `processPage`.
async function searchAllPeriods<T, R>(
  periods: AsyncIterable<Period> | Iterable<Period>,
  getPage: GetPage<T>,
  label: string,
  processPage: ProcessPage<T, R>
): Promise<R[]> {
  const allResults: R[][] = [];
  for await (const periodChunk of periods) {
    const currentPage = pageGenerator(periodChunk, getPage, processPage);
    for await (const results of currentPage) {
      debug(`Got ${results.length} ${label}`);
      allResults.push(results);
    }
  }

  return allResults.flat();
}

function getNextPeriod(
  stopDate: string,
  period: Period,
  lowerBoundDate: Date
): Period | null {
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
    return null;
  }

  return [newBeforeDate, newAfterDate];
}

async function* periodGenerator(
  stopDate: string,
  lowerBoundDate: Date
): AsyncGenerator<Period> {
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
  let currentPeriod: Period = [lastOfThisMonth, firstOfThisMonth];
  while (true) {
    yield currentPeriod;
    const nextPeriod = getNextPeriod(stopDate, currentPeriod, lowerBoundDate);
    if (!nextPeriod) {
      debug('We reached the stop date, we are done!');
      return;
    }
    currentPeriod = nextPeriod;
  }
}

// Yields yearly [before, after] periods from `endDate` back to `startDate`,
// both inclusive. A backfill is limited to a few organizations or
// repositories, so a year rarely exceeds the search limit. If it does,
// pageGenerator splits the period.
function* backfillPeriodGenerator(
  startDate: Date,
  endDate: Date
): Generator<Period> {
  const start = formatDate(startDate);
  let before = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate()
    )
  );
  while (formatDate(before) >= start) {
    const after = new Date(before);
    after.setUTCFullYear(after.getUTCFullYear() - 1);
    after.setUTCDate(after.getUTCDate() + 1);
    const afterString = formatDate(after) < start ? start : formatDate(after);
    yield [formatDate(before), afterString];

    before = new Date(afterString);
    before.setUTCDate(before.getUTCDate() - 1);
  }
}

// GitHub search returns at most 1,000 results (10 pages) per query.
const MAX_SEARCH_PAGES = 10;

async function* pageGenerator<T, R>(
  period: Period,
  cb: GetPage<T>,
  processPage: ProcessPage<T, R>
): AsyncGenerator<R[]> {
  // Pages are only yielded once the period is complete, so a truncated period
  // can be discarded and fetched again in smaller chunks without duplicates.
  const pages: T[][] = [];
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
        yield* pageGenerator(half, cb, processPage);
      }
      return;
    }
  }

  for (const results of pages) {
    yield await processPage(results);
  }
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${getPadded(
    date.getUTCMonth() + 1
  )}-${getPadded(date.getUTCDate())}`;
}

// Splits an inclusive [before, after] period into two non-overlapping halves,
// newest first. Returns an empty array for a single day.
function splitPeriod([before, after]: Period): Period[] {
  const beforeDate = new Date(before);
  const afterDate = new Date(after);
  const days = Math.round(
    (beforeDate.getTime() - afterDate.getTime()) / (1000 * 60 * 60 * 24)
  );
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

// Appends the qualifier limiting the search to some organizations or
// repositories, see backfill.
function qualifier(searchQualifier: string): string {
  return searchQualifier ? `+${searchQualifier}` : '';
}

async function getCommitPage(
  { username, delayMsPerRequest, searchQualifier }: Context,
  commitsPeriod: Period,
  page: number
): Promise<CommitSearchItem[]> {
  const [before, after] = commitsPeriod;

  debug(`Getting commits page ${page} between ${after} and ${before}`);
  if (delayMsPerRequest !== 0) {
    await sleep(delayMsPerRequest);
  }
  // Errors are not caught here: an empty result would leave a gap for this
  // period that later runs never go back and fill, so the run must abort.
  return searchCommits({
    q: `author:${username}${qualifier(searchQualifier)}+author-date:${after}..${before}`,
    sort: 'committer-date',
    page,
  });
}

async function getIssuePage(
  github: Context,
  relationship: string,
  issuesPeriod: Period,
  page: number
): Promise<IssueSearchItem[]> {
  const [before, after] = issuesPeriod;

  debug(`Getting issues page ${page} between ${after} and ${before}`);
  if (github.delayMsPerRequest !== 0) {
    await sleep(github.delayMsPerRequest);
  }
  // Errors are not caught here, see getCommitPage.
  // Items are filtered in pageGenerator, as filtering here would make a full
  // page look like the last one.
  return searchIssues({
    q: `${relationship}:${github.username}${qualifier(github.searchQualifier)}+created:${after}..${before}+is:issue`,
    sort: 'created',
    page,
  });
}

async function getCommentedPage(
  github: Context,
  type: string,
  commentedPeriod: Period,
  page: number
): Promise<IssueSearchItem[]> {
  const [before, after] = commentedPeriod;

  debug(
    `Getting commented ${type} page ${page} between ${after} and ${before}`
  );
  if (github.delayMsPerRequest !== 0) {
    await sleep(github.delayMsPerRequest);
  }
  // Errors are not caught here, see getCommitPage. Items are filtered in
  // pageGenerator, see getIssuePage.
  // PRs are searched as well, as the issue comments endpoint also returns
  // the conversation comments of PRs.
  return searchIssues({
    q: `commenter:${github.username}${qualifier(github.searchQualifier)}+updated:${after}..${before}+is:${type}`,
    sort: 'created',
    page,
  });
}

// `dateField` is the search qualifier the period applies to, either `created`
// or `updated`.
async function getPRPage(
  github: Context,
  relationship: string,
  reviewPeriod: Period,
  page: number,
  dateField: 'created' | 'updated' = 'created'
): Promise<IssueSearchItem[]> {
  const [before, after] = reviewPeriod;

  debug(`Getting PR page ${page} between ${after} and ${before}`);
  if (github.delayMsPerRequest !== 0) {
    await sleep(github.delayMsPerRequest);
  }
  // Errors are not caught here, see getCommitPage. Items are filtered in
  // pageGenerator, see getIssuePage.
  return searchIssues({
    q: `${relationship}:${github.username}${qualifier(github.searchQualifier)}+${dateField}:${after}..${before}+is:pull-request`,
    sort: 'created',
    page,
  });
}

function getPRReviews(
  prList: IssueSearchItem[],
  reviewerUsername: string,
  delay: number
): AsyncGenerator<Review[]> {
  return getOwnItems(
    prList,
    reviewerUsername,
    delay,
    'reviews',
    ({ owner, repo, number }) =>
      listReviews({ owner, repo, pull_number: number })
  );
}

function getComments(
  issueList: IssueSearchItem[],
  commenterUsername: string,
  delay: number
): AsyncGenerator<IssueComment[]> {
  return getOwnItems(
    issueList,
    commenterUsername,
    delay,
    'comments',
    ({ owner, repo, number }) =>
      listComments({ owner, repo, issue_number: number })
  );
}

// Fetches the items (e.g. reviews or comments) of each searched issue or PR and
// yields the ones created by `username`.
async function* getOwnItems<T extends { user?: { login: string } | null }>(
  searchResults: IssueSearchItem[],
  username: string,
  delay: number,
  label: string,
  fetchItems: (issue: {
    owner: string;
    repo: string;
    number: number;
  }) => Promise<T[]>
): AsyncGenerator<T[]> {
  debug(`Getting ${label}`);
  const login = username.toLowerCase();
  for await (const result of searchResults) {
    try {
      const match = /github\.com\/repos\/(.+)\/(.*)/.exec(
        result.repository_url
      );
      if (!match) {
        throw new Error(
          `Unexpected repository URL ${result.repository_url} while fetching ${label}`
        );
      }
      const [, owner = '', repo = ''] = match;
      // We're waiting for a bit here, as we've previously hit a secondary GitHub rate limit...
      if (delay !== 0) {
        await sleep(delay);
      }
      debug(`Fetching ${label} for ${owner}/${repo} #${result.number}`);
      const items = await fetchItems({ owner, repo, number: result.number });

      yield items.filter((item) => item.user?.login.toLowerCase() === login);
    } catch (error) {
      // A deleted or otherwise unavailable item has nothing left to fetch, so
      // we skip it. Any other error (rate limit, permissions, network) must
      // abort the run, as otherwise the remaining items would be skipped and
      // the next run would start past them, losing them for good.
      if (isGoneError(error)) {
        debug(`Skipping unavailable item while fetching ${label}`, error);
        continue;
      }

      throw error;
    }
  }
}

// GitHub also answers rate limits and missing token permissions with a 403, so
// we only treat a 403 as gone when GitHub states that the repository itself is
// blocked (e.g. for ToS violations). Those, like 451 (DMCA takedowns), will not
// recover and would otherwise abort every run.
const BLOCKED_REPOSITORY_MESSAGE = /repository access blocked/i;

// The shape of Octokit's RequestError we rely on. Anything else (e.g. a network
// error) is never treated as gone. The response body is not necessarily JSON.
const requestErrorSchema = z.object({
  status: z.number(),
  response: z.object({ data: z.unknown() }).optional(),
});
const errorBodySchema = z.object({ message: z.string() });

function isGoneError(error: unknown): boolean {
  const requestError = requestErrorSchema.safeParse(error);
  if (!requestError.success) {
    return false;
  }

  const { status, response } = requestError.data;
  if ([404, 410, 451].includes(status)) {
    return true;
  }

  const message = errorBodySchema.safeParse(response?.data).data?.message;
  return status === 403 && BLOCKED_REPOSITORY_MESSAGE.test(message ?? '');
}

// Returns a function that resolves whether the repository `owner/repo` is
// private. Search results for issues and PRs (and therefore their comments and
// reviews) do not state the visibility of their repository, so we look it up
// once per repository and run.
function createPrivateRepoLookup(
  delay: number
): (fullName: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return (fullName) => {
    let isPrivate = cache.get(fullName);
    if (!isPrivate) {
      isPrivate = fetchIsPrivateRepo(fullName, delay);
      cache.set(fullName, isPrivate);
    }

    return isPrivate;
  };
}

async function fetchIsPrivateRepo(
  fullName: string,
  delay: number
): Promise<boolean> {
  const [owner = '', repo = ''] = fullName.split('/');
  if (delay !== 0) {
    await sleep(delay);
  }

  debug(`Looking up visibility of ${fullName}`);
  try {
    const repository = await getRepository({ owner, repo });
    return repository.private;
  } catch (error) {
    // We can not confirm that a repository we can not see anymore is public,
    // so we treat it as private to not leak anything.
    if (isGoneError(error)) {
      debug(`Repository ${fullName} unavailable, treating it as private`);
      return true;
    }

    throw error;
  }
}

const REPO_API_URL = /\/repos\/([^/]+)\/([^/]+)/;

async function isPrivateEntity(
  github: Context,
  entity: IssueOrComment
): Promise<boolean> {
  // Without `allowPrivate` the token was verified to have no access to private
  // repositories, so there is nothing to hide and no need for a lookup.
  if (!github.allowPrivate) {
    return false;
  }

  const apiUrl =
    ('repository_url' in entity && entity.repository_url) ||
    ('issue_url' in entity && entity.issue_url) ||
    ('pull_request_url' in entity && entity.pull_request_url) ||
    undefined;
  const match = REPO_API_URL.exec(apiUrl ?? '');
  if (!match) {
    debug('Could not determine repository, treating it as private', entity);
    return true;
  }

  return github.isPrivateRepo(`${match[1]}/${match[2]}`.toLowerCase());
}

async function processEntities(
  github: Context,
  entities: GitHubEntity[],
  titleMap?: Map<string, string>
): Promise<FetchedContribution[]> {
  const contributions: FetchedContribution[] = [];
  for (const entity of entities) {
    if (!filter(github.filter, entity)) {
      continue;
    }

    // Commits carry the visibility of their repository, see formatCommit.
    const isPrivate =
      !isCommit(entity) && (await isPrivateEntity(github, entity));
    contributions.push(format(github.types, entity, titleMap, isPrivate));
  }

  return contributions;
}

function isCommit(entity: GitHubEntity): entity is CommitSearchItem {
  return 'commit' in entity && Boolean(entity.commit);
}

function isReview(entity: IssueOrComment): entity is Review {
  return 'pull_request_url' in entity && Boolean(entity.pull_request_url);
}

function isComment(entity: IssueOrComment): entity is IssueComment {
  return 'issue_url' in entity && Boolean(entity.issue_url);
}

function filter(filterRegex: RegExp, entity: GitHubEntity): boolean {
  const matchesRegex = filterRegex.test(entity.html_url);
  const isFork =
    'repository' in entity && entity.repository && entity.repository.fork;
  return matchesRegex && !isFork;
}

function format(
  types: GitHubTypes,
  entity: GitHubEntity,
  titleMap: Map<string, string> | undefined,
  isPrivate: boolean
): FetchedContribution {
  if (isCommit(entity)) {
    return formatCommit(types, entity);
  }

  const contribution = (() => {
    if (isReview(entity)) {
      return formatPRReview(types, entity, titleMap);
    }

    if (isComment(entity)) {
      return formatComment(types, entity, titleMap);
    }

    return formatIssue(types, entity);
  })();

  if (!isPrivate) {
    return contribution;
  }

  return {
    ...contribution,
    description: types?.privateContribution || TYPE_PRIVATE_CONTRIBUTION,
    link: '',
  };
}

function formatCommit(
  types: GitHubTypes,
  entity: CommitSearchItem
): FetchedContribution {
  const createdAt = new Date(entity.commit.author.date);
  let description: string;
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

function formatIssue(
  types: GitHubTypes,
  entity: IssueSearchItem
): FetchedContribution {
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

function formatComment(
  types: GitHubTypes,
  entity: IssueComment,
  titleMap?: Map<string, string>
): FetchedContribution {
  let description = '';
  if (titleMap) {
    description = titleMap.get(entity.issue_url) ?? '';
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

function formatPRReview(
  types: GitHubTypes,
  entity: Review,
  titleMap?: Map<string, string>
): FetchedContribution {
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
    description = titleMap.get(entity.pull_request_url) ?? '';
  }

  return {
    createdAt: new Date(entity.submitted_at!),
    description,
    link: entity.html_url,
    type,
    source: GITHUB_REVIEW_CATEGORY,
  };
}
