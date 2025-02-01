import Debug from 'debug';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { z } from 'zod';

const debug = Debug('contributions:wiki');
const parseStringAsync = promisify(parseString);

export const WIKI_CATEGORY = 'wiki';

const TYPE_EDIT = 'Wiki Edit';

export const mediaWikiSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().min(1),
  username: z.string().min(1),
  editType: z.string(),
  stopDate: z.string(),
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

  const period = periodGenerator(stopDate);
  for await (const periodChunk of period) {
    debug(`Getting data for ${periodChunk[0]}/${periodChunk[1]}`);
    const edits = await getPage(baseUrl, username, periodChunk);
    debug(`Got ${edits.length} results to filter`);
    const processed = processEntities(editType, edits, periodChunk);
    debug(`Got ${processed.length} results`);
    allEdits = allEdits.concat(processed);
  }

  return allEdits;
}

function getNextPeriod(stopDate, period) {
  const STOP_DATE = new Date(stopDate);
  const [month, year] = period;

  const nextDate = new Date(year, month - 1, 1);
  nextDate.setMonth(nextDate.getMonth() - 1);

  if (nextDate <= STOP_DATE) {
    return [];
  }

  return [nextDate.getMonth() + 1, nextDate.getFullYear()];
}

async function* periodGenerator(stopDate) {
  const date = new Date();
  let currentPeriod = [date.getMonth() + 1, date.getFullYear()];
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
  return `${baseUrl}&user=${username}&year=${year}&month=${month}`;
}

async function getPage(baseUrl, username, [month, year]) {
  const url = getUrl({
    baseUrl,
    username,
    month,
    year,
  });
  debug(`Getting ${url}`);
  const response = await fetch(url);
  const data = await response.json();
  const parsed = await parse(data);
  const firstChannel =
    parsed.rss && parsed.rss.channel && parsed.rss.channel[0];
  const items =
    firstChannel && Array.isArray(firstChannel.item) ? firstChannel.item : [];
  return items;
}

function processEntities(type, entities, periodChunk) {
  return entities
    .map((entity) => format(type, entity))
    .filter((entity) => {
      return (
        entity.createdAt.getMonth() + 1 === periodChunk[0] &&
        entity.createdAt.getFullYear() === periodChunk[1]
      );
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
