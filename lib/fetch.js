import Debug from 'debug';
import fs from 'fs/promises';

import * as bugzilla from './bugzilla.js';
import * as communityPortal from './community-portal.js';
import * as discourse from './discourse.js';
import * as github from './github.js';
import * as osm from './osm.js';
import { validateConfig } from './validator.js';
import * as wiki from './wiki.js';

const debug = Debug('contributions:gather');

export async function fetchAll(config, contributions = []) {
  validateConfig(config);

  let existingContributions = contributions;
  if (config.outputFile) {
    debug('checking output file...');
    try {
      await fs.stat(config.outputFile);
      // Passing existing contributions through the parameter is overwritten
      // if an outputFile exists.
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
  const osmResult = await osm.gather(config);

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
    osm.OSM_CATEGORY,
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
  debug('OSM_CONTRIBUTIONS', osmResult.length);

  const uniqueContributions = Array.from(
    new Set([
      ...existingContributionsToSave,
      ...discourseResult, // always a new fetch (previous entries removed above)
      ...wikiResult, // always a new fetch (previous entries removed above)
      ...communityPortalResult, // always a new fetch (previous entries removed above)
      ...osmResult, // always a new fetch (previous entries removed above)
      ...githubResult,
      ...bugzillaResult,
    ])
  );

  if (uniqueContributions.length === existingContributions.length) {
    debug('NO_UPDATE_ABORTING');
    return uniqueContributions;
  }

  uniqueContributions.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  if (config.outputFile) {
    await fs.writeFile(
      config.outputFile,
      `${JSON.stringify(uniqueContributions, null, 2)}\n`
    );
    debug('FILE_WRITTEN');
  }

  return uniqueContributions;
}
