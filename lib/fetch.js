import Debug from 'debug';
import fs from 'fs/promises';

import * as bugzilla from './bugzilla.js';
import * as communityPortal from './community-portal.js';
import {
  ensureUniqueContributions,
  haveSameContributions,
} from './contributions.js';
import * as discourse from './discourse.js';
import * as github from './github.js';
import * as osm from './osm.js';
import { validateConfig } from './validator.js';
import * as wiki from './wiki.js';

const debug = Debug('contributions:gather');

async function writeFileAtomic(file, content) {
  const tempFile = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tempFile, content);
    await fs.rename(tempFile, file);
  } catch (error) {
    await fs.rm(tempFile, { force: true });
    throw error;
  }
}

export async function fetchAll(rawConfig, contributions = []) {
  const config = validateConfig(rawConfig);

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
        await writeFileAtomic(config.outputFile, JSON.stringify([]));
      } else {
        // Never continue with an unreadable or corrupt output file, as we would
        // overwrite it later on and lose all previously saved contributions.
        throw new Error(
          `Could not read existing output file ${config.outputFile}: ${error.message}`,
          { cause: error }
        );
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
  // This also includes sources that handle their own "existing contributions" keeping
  // even if only new contributions are fetched.
  // Saved entries of a disabled source are kept, as it was not re-fetched.
  const ALWAYS_FULL_FETCH_SOURCE_ENTRIES = {
    communityPortal: [
      communityPortal.EVENTS_CATEGORY,
      communityPortal.CAMPAIGNS_CATEGORY,
    ],
    discourse: [discourse.POSTS_CATEGORY, discourse.TOPICS_CATEGORY],
    mediaWiki: [wiki.WIKI_CATEGORY],
    osm: [osm.OSM_CATEGORY],
  };
  const refetchedSourceEntries = Object.entries(
    ALWAYS_FULL_FETCH_SOURCE_ENTRIES
  )
    .filter(([configKey]) => config[configKey]?.enabled)
    .flatMap(([, categories]) => categories);
  const fetchedContributions = [
    ...discourseResult,
    ...wikiResult,
    ...communityPortalResult,
    ...osmResult,
    ...githubResult,
    ...bugzillaResult,
  ];
  // A refetch returning nothing for a category most likely means the source
  // answered with something unusable (renamed or suspended user, login page,
  // changed markup) rather than all contributions being gone. Keep the saved
  // entries of such a category instead of wiping its history.
  const replacedSourceEntries = refetchedSourceEntries.filter((source) => {
    const wasRefetched = fetchedContributions.some(
      (activity) => activity.source === source
    );
    if (!wasRefetched) {
      debug('NO_ENTRIES_REFETCHED_KEEPING_SAVED', source);
    }
    return wasRefetched;
  });
  const existingContributionsToSave = existingContributions.filter(
    (activity) => {
      return !replacedSourceEntries.includes(activity.source);
    }
  );
  debug('ALREADY_EXISTING_CONTRIBUTIONS', existingContributionsToSave.length);

  debug('NEW_BUGZILLA_CONTRIBUTIONS', bugzillaResult.length);
  debug('NEW_GITHUB_CONTRIBUTIONS', githubResult.length);
  debug('COMMUNITY_PORTAL_CONTRIBUTIONS', communityPortalResult.length);
  debug('DISCOURSE_CONTRIBUTIONS', discourseResult.length);
  debug('WIKI_CONTRIBUTIONS', wikiResult.length);
  debug('OSM_CONTRIBUTIONS', osmResult.length);

  const uniqueContributions = ensureUniqueContributions([
    ...existingContributionsToSave,
    ...fetchedContributions,
  ]);

  uniqueContributions.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  if (!config.outputFile) {
    return uniqueContributions;
  }

  // Compare the actual content rather than the number of entries, as entries
  // could have been added and removed in the same run.
  if (haveSameContributions(uniqueContributions, existingContributions)) {
    debug('NO_UPDATE_ABORTING');
    return uniqueContributions;
  }

  await writeFileAtomic(
    config.outputFile,
    `${JSON.stringify(uniqueContributions, null, 2)}\n`
  );
  debug('FILE_WRITTEN');

  return uniqueContributions;
}
