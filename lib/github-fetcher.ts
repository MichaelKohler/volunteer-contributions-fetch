import Debug from 'debug';
import { Octokit as BaseOctokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import type { RestEndpointMethodTypes } from '@octokit/rest';

import { USER_AGENT } from './http.js';

const debug = Debug('contributions:github-fetcher');

export const RESULTS_PER_PAGE = 100;
export const PRIVATE_SCOPE_ERROR = 'PRIVATE_SCOPE';
export const MAX_RATE_LIMIT_RETRIES = 3;

const Octokit = BaseOctokit.plugin(throttling, retry);

type Endpoint = RestEndpointMethodTypes;
type SearchCommitsParams = Endpoint['search']['commits']['parameters'];
type SearchIssuesParams =
  Endpoint['search']['issuesAndPullRequests']['parameters'];
type ListReviewsParams = Endpoint['pulls']['listReviews']['parameters'];
type ListCommentsParams = Endpoint['issues']['listComments']['parameters'];
type GetRepositoryParams = Endpoint['repos']['get']['parameters'];

export type CommitSearchItem =
  Endpoint['search']['commits']['response']['data']['items'][number];
export type IssueSearchItem =
  Endpoint['search']['issuesAndPullRequests']['response']['data']['items'][number];
export type Review =
  Endpoint['pulls']['listReviews']['response']['data'][number];
export type IssueComment =
  Endpoint['issues']['listComments']['response']['data'][number];
export type Repository = Endpoint['repos']['get']['response']['data'];

function handleRateLimit(kind: string) {
  return (
    retryAfter: number,
    options: { method?: string; url?: string },
    _octokit: unknown,
    retryCount: number
  ): boolean => {
    const request = `${options.method} ${options.url}`;
    if (retryCount >= MAX_RATE_LIMIT_RETRIES) {
      debug(`${kind} rate limit hit for ${request}, giving up`);
      return false;
    }

    debug(
      `${kind} rate limit hit for ${request}, retrying in ${retryAfter}s (retry ${retryCount + 1}/${MAX_RATE_LIMIT_RETRIES})`
    );
    return true;
  };
}

let octokitSingleton: InstanceType<typeof Octokit> | null = null;

function getOctokit() {
  if (octokitSingleton) {
    return octokitSingleton;
  }

  debug('Initializing Octokit');
  const { GITHUB_TOKEN } = process.env;

  if (!GITHUB_TOKEN) {
    throw new Error('No GITHUB_TOKEN provided in the environment variables!');
  }

  octokitSingleton = new Octokit({
    auth: GITHUB_TOKEN,
    userAgent: USER_AGENT,
    throttle: {
      onRateLimit: handleRateLimit('Primary'),
      onSecondaryRateLimit: handleRateLimit('Secondary'),
    },
  });

  return octokitSingleton;
}

export async function searchCommits(
  options: SearchCommitsParams
): Promise<CommitSearchItem[]> {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.search.commits(octokitOptions);
  return response.data.items;
}

export async function searchIssues(
  options: SearchIssuesParams
): Promise<IssueSearchItem[]> {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.search.issuesAndPullRequests(octokitOptions);
  return response.data.items;
}

export async function listReviews(
  options: ListReviewsParams
): Promise<Review[]> {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };

  return octokit.paginate(octokit.pulls.listReviews, octokitOptions);
}

export async function listComments(
  options: ListCommentsParams
): Promise<IssueComment[]> {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };

  return octokit.paginate(octokit.issues.listComments, octokitOptions);
}

export async function getRepository(
  options: GetRepositoryParams
): Promise<Repository> {
  const octokit = getOctokit();
  const response = await octokit.repos.get(options);
  return response.data;
}

export async function throwIfTokenHasPrivateRepoScope(): Promise<void> {
  const octokit = getOctokit();
  const response = await octokit.rest.meta.root();
  const scopesHeader = response.headers['x-oauth-scopes'];
  // If we don't have the scopes header, such as for fine-grained
  // access tokens, we error as well. We can't guarantee
  // that the passed token is not indeed allowing private
  // access. A classic token without any scopes sends an
  // empty header, which is fine.
  if (scopesHeader === undefined) {
    throw new Error(PRIVATE_SCOPE_ERROR);
  }

  const scopes = scopesHeader.split(', ');
  if (scopes.includes('repo')) {
    throw new Error(PRIVATE_SCOPE_ERROR);
  }
}
