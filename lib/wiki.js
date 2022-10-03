const debug = require('debug')('contributions:wiki');
const axios = require('axios');
const { parseString } = require('xml2js');
const { promisify } = require('util');

const parseStringAsync = promisify(parseString);

const WIKI_CATEGORY = 'wiki';

const TYPE_EDIT = 'Wiki Edit';

module.exports = {
  WIKI_CATEGORY,
  gather,
  validate,
};

function validate(config) {
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

async function gather({ mediaWiki }) {
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

  if (nextDate < STOP_DATE) {
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
  try {
    const url = getUrl({
      baseUrl,
      username,
      month,
      year,
    });
    debug(`Getting ${url}`);
    const response = await axios.get(url);
    const parsed = await parse(response.data);
    const firstChannel =
      parsed.rss && parsed.rss.channel && parsed.rss.channel[0];
    const items =
      firstChannel && Array.isArray(firstChannel.item) ? firstChannel.item : [];
    return items;
  } catch (error) {
    debug('Error fetching edits', error);
    return [];
  }
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
  try {
    const parsed = await parseStringAsync(xml);
    return parsed;
  } catch (error) {
    debug('Failed to parse', error);
    return {};
  }
}
