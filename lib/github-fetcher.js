const debug = require('debug')('contributions:github-fetcher');
const { Octokit } = require('@octokit/rest');

const RESULTS_PER_PAGE = 100;
const PRIVATE_SCOPE_ERROR = 'PRIVATE_SCOPE';

module.exports = {
  RESULTS_PER_PAGE,
  PRIVATE_SCOPE_ERROR,
  searchCommits,
  searchIssues,
  listReviews,
  listComments,
  throwIfTokenHasPrivateRepoScope,
};

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
  });

  return octokitSingleton;
}

async function searchCommits(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.search.commits(octokitOptions);
  return response.data.items;
}

async function searchIssues(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.search.issuesAndPullRequests(octokitOptions);
  return response.data.items;
}

async function listReviews(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.pulls.listReviews(octokitOptions);
  return response.data;
}

async function listComments(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE,
  };
  const response = await octokit.issues.listComments(octokitOptions);
  return response.data;
}

async function throwIfTokenHasPrivateRepoScope() {
  const octokit = getOctokit();
  const response = await octokit.rest.meta.root();
  // If we don't have the scopes, such as for fine-grained
  // access tokens, we error as well. We can't guarantee
  // that the passed token is not indeed allowing private
  // access.
  if (!response.headers['x-oauth-scopes']) {
    throw new Error(PRIVATE_SCOPE_ERROR);
  }

  const scopes = response.headers['x-oauth-scopes'].split(', ');
  if (scopes.includes('repo')) {
    throw new Error(PRIVATE_SCOPE_ERROR);
  }
}
