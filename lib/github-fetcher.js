const debug = require('debug')('contributions:github-fetcher');
const { Octokit } = require('@octokit/rest');

const RESULTS_PER_PAGE = 100;

module.exports = {
  RESULTS_PER_PAGE,
  searchCommits,
  searchIssues,
  listReviews,
};

let octokitSingleton = null;

function getOctokit() {
  if (octokitSingleton) {
    return octokitSingleton;
  }

  debug('Initializing Octokit');
  const { GITHUB_TOKEN } = process.env;

  if (!GITHUB_TOKEN) {
    throw new Error('NO_GITHUB_TOKEN_PROVIDED');
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
    per_page: RESULTS_PER_PAGE, // eslint-disable-line camelcase
  };
  const response = await octokit.search.commits(octokitOptions);
  return response.data.items;
}

async function searchIssues(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE, // eslint-disable-line camelcase
  };
  const response = await octokit.search.issuesAndPullRequests(octokitOptions);
  return response.data.items;
}

async function listReviews(options) {
  const octokit = getOctokit();
  const octokitOptions = {
    ...options,
    per_page: RESULTS_PER_PAGE, // eslint-disable-line camelcase
  };
  const response = await octokit.pulls.listReviews(octokitOptions);
  return response.data;
}
