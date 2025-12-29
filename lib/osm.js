import Debug from 'debug';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { z } from 'zod';

const debug = Debug('contributions:openstreetmaps');
const parseStringAsync = promisify(parseString);

export const OSM_CATEGORY = 'osm';

const TYPE_EDIT = 'OpenStreetMaps Edit';

const MAX_EDITS_PER_PAGE = 100;

export const osmSchema = z.object({
  enabled: z.boolean(),
  displayName: z.string().min(1),
  stopDate: z.string(),
});

export async function gather({ osm }) {
  if (!osm || (osm && !osm.enabled)) {
    debug('OSM source not enabled, skipping');
    return [];
  }

  const edits = await processEdits(osm);

  debug('Finished gathering contributions');
  return edits;
}

async function processEdits({ displayName, stopDate }) {
  debug('Getting edits from OSM');
  let allEdits = [];
  let hasMoreData = true;
  let createdBefore = new Date().toISOString();

  while (hasMoreData) {
    const edits = await getPage(displayName, stopDate, createdBefore);
    debug(`Got ${edits.length} results to filter`);
    const processed = processEntities(edits);
    debug(`Got ${processed.length} results`);
    allEdits = allEdits.concat(processed);
    hasMoreData = edits.length === MAX_EDITS_PER_PAGE;
    createdBefore = processed[processed.length - 1].createdAt;
  }

  return allEdits;
}

function getUrl({ displayName, createdBefore, stopDate }) {
  return `https://api.openstreetmap.org/api/0.6/changesets?display_name=${displayName}&time=${stopDate},${createdBefore}`;
}

async function getPage(displayName, stopDate, createdBefore) {
  const url = getUrl({
    displayName,
    stopDate,
    createdBefore,
  });
  debug(`Getting ${url}`);
  const response = await fetch(url);
  const data = await response.text();
  const parsed = await parse(data);
  const items =
    parsed.osm && Array.isArray(parsed.osm.changeset)
      ? parsed.osm.changeset
      : [];
  return items;
}

function processEntities(entities) {
  return entities.map((entity) => format(entity));
}

function format(entity) {
  return {
    createdAt: new Date(entity.$.created_at),
    description: entity.tag.find((tag) => tag.$.k === 'comment').$.v,
    link: `https://www.openstreetmap.org/changeset/${entity.$.id}`,
    type: TYPE_EDIT,
    source: OSM_CATEGORY,
  };
}

async function parse(xml) {
  const parsed = await parseStringAsync(xml);
  return parsed;
}
