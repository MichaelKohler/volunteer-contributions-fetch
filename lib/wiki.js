import Debug from 'debug';
import { parseString } from 'xml2js';
import { setTimeout as sleep } from 'timers/promises';
import { promisify } from 'util';
import { z } from 'zod';

import { FETCH_TIMEOUT, stopDateSchema } from './utils.js';

const debug = Debug('contributions:wiki');
const parseStringAsync = promisify(parseString);

export const WIKI_CATEGORY = 'wiki';

const TYPE_EDIT = 'Wiki Edit';

export const REQUEST_DELAY_MS = 2000;

export const mediaWikiSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().min(1),
  username: z.string().min(1),
  editType: z.string().optional(),
  stopDate: stopDateSchema,
});

export function validate(config) {
  debug('Validating Wiki config');

  if (!config) {
    return;
  }

  if (config && config.enabled && !config.baseUrl) {
    throw new Error('MediaWiki: baseUrl is required');
  }

  if (config && config.enabled && !config.username) {
    throw new Error('MediaWiki: username is required');
  }

  if (config && config.enabled && !config.stopDate) {
    throw new Error('MediaWiki: stopDate is required');
  }
}

export async function gather({ mediaWiki }) {
  if (!mediaWiki || (mediaWiki && !mediaWiki.enabled)) {
    debug('MediaWiki source not enabled, skipping');
    return [];
  }

  const edits = await processEdits(mediaWiki);

  debug('Finished gathering contributions');
  return edits;
}

async function processEdits({ baseUrl, username, stopDate, editType }) {
  debug('Getting edits from Wiki');
  let allEdits = [];
  const seen = new Set();
  let isFirstRequest = true;

  const period = periodGenerator(stopDate);
  for await (const periodChunk of period) {
    if (!isFirstRequest) {
      await sleep(REQUEST_DELAY_MS);
    }
    isFirstRequest = false;

    debug(`Getting data for ${periodChunk[0]}/${periodChunk[1]}`);
    const edits = await getPage(baseUrl, username, periodChunk);
    debug(`Got ${edits.length} results to filter`);
    const processed = processEntities(editType, edits, stopDate, seen);
    debug(`Got ${processed.length} results`);
    allEdits = allEdits.concat(processed);
  }

  return allEdits;
}

function getNextPeriod(stopDate, period) {
  const STOP_DATE = new Date(stopDate);
  const [month, year] = period;

  // The stop date is parsed as UTC midnight, so we need to use UTC dates
  // throughout, otherwise time zones behind UTC fetch an additional month.
  const currentDate = new Date(Date.UTC(year, month - 1, 1));
  const nextDate = new Date(Date.UTC(year, month - 2, 1));

  // Only stop once the current month started on or before the stop date,
  // otherwise the month containing the stop date would never be fetched.
  if (currentDate <= STOP_DATE) {
    return [];
  }

  return [nextDate.getUTCMonth() + 1, nextDate.getUTCFullYear()];
}

async function* periodGenerator(stopDate) {
  const date = new Date();
  let currentPeriod = [date.getUTCMonth() + 1, date.getUTCFullYear()];
  while (true) {
    yield currentPeriod;
    currentPeriod = getNextPeriod(stopDate, currentPeriod);
    if (!currentPeriod.length) {
      debug('We reached the stop date, we are done!');
      return;
    }
  }
}

function getUrl({ baseUrl, username, month, year }) {
  return `${baseUrl}&user=${encodeURIComponent(username)}&year=${year}&month=${month}`;
}

async function getPage(baseUrl, username, [month, year]) {
  const url = getUrl({
    baseUrl,
    username,
    month,
    year,
  });
  debug(`Getting ${url}`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(
      `MediaWiki request to ${url} failed with status ${response.status}`
    );
  }
  const data = await response.text();
  const parsed = await parse(data);
  const firstChannel =
    parsed.rss && parsed.rss.channel && parsed.rss.channel[0];
  const items =
    firstChannel && Array.isArray(firstChannel.item) ? firstChannel.item : [];
  return items;
}

// The wiki returns all edits up to the end of the requested month in its own
// time zone, so feeds of consecutive months overlap. Filtering by UTC month
// would drop edits close to midnight at the month boundary, so we instead
// skip edits we have already seen in a previous period.
function processEntities(type, entities, stopDate, seen) {
  const STOP_DATE = new Date(stopDate);

  return entities
    .map((entity) => format(type, entity))
    .filter((entity) => {
      const key = `${entity.link}|${entity.createdAt.getTime()}`;
      if (entity.createdAt < STOP_DATE || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function format(type, entity) {
  return {
    createdAt: new Date(entity.pubDate),
    description: `Edited ${entity.title}`,
    link: entity.link[0],
    type: type || TYPE_EDIT,
    source: WIKI_CATEGORY,
  };
}

async function parse(xml) {
  const parsed = await parseStringAsync(xml);
  return parsed;
}
