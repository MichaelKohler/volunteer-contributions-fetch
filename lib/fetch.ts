import { randomUUID } from 'crypto';
import Debug from 'debug';
import fs from 'fs/promises';

import * as bugzilla from './bugzilla.js';
import * as communityPortal from './community-portal.js';
import {
  compareContributions,
  ensureUniqueContributions,
  haveSameContributions,
} from './contributions.js';
import * as discourse from './discourse.js';
import * as github from './github.js';
import type { BackfillOptions } from './github.js';
import * as osm from './osm.js';
import { applyTagRules } from './tags.js';
import type { Contribution } from './types.js';
import { type Config, type ConfigInput, validateConfig } from './validator.js';
import * as wiki from './wiki.js';

const debug = Debug('contributions:gather');

type SourceKey = Exclude<keyof Config, 'outputFile'>;

// Maps the config key of each source to the categories of its contributions.
const SOURCE_CATEGORIES: Record<SourceKey, string[]> = {
  bugzilla: bugzilla.CATEGORIES,
  communityPortal: communityPortal.CATEGORIES,
  discourse: discourse.CATEGORIES,
  github: github.CATEGORIES,
  mediaWiki: wiki.CATEGORIES,
  osm: osm.CATEGORIES,
};

// Tags are applied to saved contributions as well, so changed rules are
// reflected without fetching everything again. Contributions of a disabled
// or unknown source are kept as they are, as there is no config to apply.
function applyTags(config: Config, contribution: Contribution): Contribution {
  const configKey = (Object.keys(SOURCE_CATEGORIES) as SourceKey[]).find(
    (key) => SOURCE_CATEGORIES[key].includes(contribution.source)
  );
  const sourceConfig = configKey && config[configKey];
  if (!sourceConfig?.enabled) {
    return contribution;
  }

  return applyTagRules(sourceConfig.tagRules, contribution);
}

async function writeFileAtomic(file: string, content: string): Promise<void> {
  const tempFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempFile, content);
    await fs.rename(tempFile, file);
  } catch (error) {
    await fs.rm(tempFile, { force: true });
    throw error;
  }
}

async function loadContributions(
  config: Config,
  contributions: Contribution[]
): Promise<Contribution[]> {
  if (!config.outputFile) {
    return contributions;
  }

  debug('checking output file...');
  try {
    const existingContributions: unknown = JSON.parse(
      await fs.readFile(config.outputFile, 'utf8')
    );
    if (!Array.isArray(existingContributions)) {
      throw new Error('expected a JSON array of contributions');
    }

    return existingContributions as Contribution[];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      debug('output file does not exist, creating!');
      await writeFileAtomic(config.outputFile, JSON.stringify([]));
      return [];
    }

    // Never continue with an unreadable or corrupt output file, as we would
    // overwrite it later on and lose all previously saved contributions.
    throw new Error(
      `Could not read existing output file ${config.outputFile}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

async function saveContributions(
  config: Config,
  contributionsToSave: Contribution[],
  existingContributions: Contribution[]
): Promise<Contribution[]> {
  const uniqueContributions = ensureUniqueContributions(
    contributionsToSave
  ).map((contribution) => applyTags(config, contribution));

  uniqueContributions.sort(compareContributions);

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

export async function fetchAll(
  rawConfig: ConfigInput,
  contributions: Contribution[] = []
): Promise<Contribution[]> {
  const config = validateConfig(rawConfig);
  const existingContributions = await loadContributions(config, contributions);

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
  const ALWAYS_FULL_FETCH_SOURCE_ENTRIES: Partial<Record<SourceKey, string[]>> =
    {
      communityPortal: [
        communityPortal.EVENTS_CATEGORY,
        communityPortal.CAMPAIGNS_CATEGORY,
      ],
      discourse: [discourse.POSTS_CATEGORY, discourse.TOPICS_CATEGORY],
      mediaWiki: [wiki.WIKI_CATEGORY],
      osm: [osm.OSM_CATEGORY],
    };
  const refetchedSourceEntries = (
    Object.entries(ALWAYS_FULL_FETCH_SOURCE_ENTRIES) as [SourceKey, string[]][]
  )
    .filter(([configKey]) => config[configKey]?.enabled)
    .flatMap(([, categories]) => categories);
  const fetchedContributions: Contribution[] = [
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

  return saveContributions(
    config,
    [...existingContributionsToSave, ...fetchedContributions],
    existingContributions
  );
}

// Fetches older GitHub contributions of the given organizations, users or
// repositories once, e.g. after adding a new pattern to `filter`. See
// github.backfill for the options. Other sources are not fetched.
export async function backfillGitHub(
  rawConfig: ConfigInput,
  options: BackfillOptions,
  contributions: Contribution[] = []
): Promise<Contribution[]> {
  const config = validateConfig(rawConfig);
  const existingContributions = await loadContributions(config, contributions);

  debug('backfilling GitHub...');
  const backfilled = await github.backfill(
    config,
    options,
    existingContributions
  );
  debug('BACKFILLED_GITHUB_CONTRIBUTIONS', backfilled.length);

  return saveContributions(
    config,
    [...existingContributions, ...backfilled],
    existingContributions
  );
}
