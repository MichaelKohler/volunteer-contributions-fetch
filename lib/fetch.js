const debug = require('debug')('contributions:gather');
const fs = require('fs/promises');

const bugzilla = require('./bugzilla');
const communityPortal = require('./community-portal');
const discourse = require('./discourse');
const github = require('./github');
const { validateConfig } = require('./validator');
const wiki = require('./wiki');

async function fetchAll(config) {
  validateConfig(config);

  let existingContributions = [];
  if (config.outputFile) {
    debug('checking output file...');
    try {
      await fs.stat(config.outputFile);
      existingContributions = JSON.parse(await fs.readFile(config.outputFile));
    } catch (error) {
      if (error.code === 'ENOENT') {
        debug('output file does not exist, creating!');
        await fs.writeFile(config.outputFile, JSON.stringify([]));
      }
    }
  }

  debug('fetching...');
  const bugzillaResult = await bugzilla.gather(config, existingContributions);
  const githubResult = await github.gather(config, existingContributions);
  const wikiResult = await wiki.gather(config);
  const communityPortalResult = await communityPortal.gather(config);
  const discourseResult = await discourse.gather(config, existingContributions);

  // Some types are fetched on every update run, therefore we want to filter them out for now.
  // Otherwise we might end up with duplicate entries we'd need to filter.
  // We need to make sure we always will save the "reps" source entries, as we do not fetch those
  // anymore.
  // This also includes sources that handle their own "existing contributions" keeping
  // even if only new contributions are fetched.
  const ALWAYS_FULL_FETCH_SOURCE_ENTRIES = [
    communityPortal.EVENTS_CATEGORY,
    communityPortal.CAMPAIGNS_CATEGORY,
    discourse.POSTS_CATEGORY,
    discourse.TOPICS_CATEGORY,
    wiki.WIKI_CATEGORY,
  ];
  const existingContributionsToSave = existingContributions.filter(
    (activity) => {
      return !ALWAYS_FULL_FETCH_SOURCE_ENTRIES.includes(activity.source);
    }
  );
  debug('ALREADY_EXISTING_CONTRIBUTIONS', existingContributionsToSave.length);

  debug('NEW_BUGZILLA_CONTRIBUTIONS', bugzillaResult);
  debug('NEW_GITHUB_CONTRIBUTIONS', githubResult);
  debug('COMMUNITY_PORTAL_CONTRIBUTIONS', communityPortalResult.length);
  debug('DISCOURSE_CONTRIBUTIONS', discourseResult.length);
  debug('WIKI_CONTRIBUTIONS', wikiResult.length);

  const uniqueContributions = Array.from(
    new Set([
      ...existingContributionsToSave,
      ...discourseResult, // always a new fetch (previous entries removed above)
      ...wikiResult, // always a new fetch (previous entries removed above)
      ...communityPortalResult, // always a new fetch (previous entries removed above)
      ...githubResult,
      ...bugzillaResult,
    ])
  );

  if (uniqueContributions.length === existingContributions.length) {
    debug('NO_UPDATE_ABORTING');
    return;
  }

  uniqueContributions.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  await fs.writeFile(
    config.outputFile,
    `${JSON.stringify(uniqueContributions, null, 2)}\n`
  );
  debug('FILE_WRITTEN');
}

module.exports = {
  fetchAll,
};
