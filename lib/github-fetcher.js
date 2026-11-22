import Debug from 'debug';
import { Octokit as BaseOctokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';

import { USER_AGENT } from './http.js';

const debug = Debug('contributions:github-fetcher');

export const RESULTS_PER_PAGE = 100;
export const PRIVATE_SCOPE_ERROR = 'PRIVATE_SCOPE';
export const MAX_RATE_LIMIT_RETRIES = 3;

const Octokit = BaseOctokit.plugin(throttling, retry);

function handleRateLimit(kind) {
  return (retryAfter, options, octokit, retryCount) => {
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

let octokitSingleton = null;

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

export async function searchCommits(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.search.commits(octokitOptions);
  return response.data.items;
}

export async function searchIssues(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.search.issuesAndPullRequests(octokitOptions);
  return response.data.items;
}

export async function listReviews(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };

  return octokit.paginate(octokit.pulls.listReviews, octokitOptions);
}

export async function listComments(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };

  return octokit.paginate(octokit.issues.listComments, octokitOptions);
}

export async function getRepository(options) {
  const octokit = getOctokit();
  const response = await octokit.repos.get(options);
  return response.data;
}

export async function throwIfTokenHasPrivateRepoScope() {
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
