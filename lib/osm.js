import Debug from 'debug';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { z } from 'zod';

import { FETCH_TIMEOUT, sourceSchema, stopDateSchema } from './utils.js';

const debug = Debug('contributions:openstreetmaps');
const parseStringAsync = promisify(parseString);

export const OSM_CATEGORY = 'osm';

const TYPE_EDIT = 'OpenStreetMaps Edit';

const MAX_EDITS_PER_PAGE = 100;

export const osmSchema = sourceSchema(
  z.strictObject({
    enabled: z.literal(true),
    displayName: z.string().min(1),
    stopDate: stopDateSchema,
  })
);

export async function gather({ osm }) {
  if (!osm?.enabled) {
    debug('OSM source not enabled, skipping');
    return [];
  }

  const edits = await processEdits(osm);

  debug('Finished gathering contributions');
  return edits;
}

async function processEdits({ displayName, stopDate }) {
  debug('Getting edits from OSM');
  const allEdits = [];
  const seenLinks = new Set();
  const stopTime = new Date(stopDate).getTime();
  const stopDateIso = new Date(stopTime).toISOString();
  let hasMoreData = true;
  let createdBefore = new Date().toISOString();

  while (hasMoreData) {
    const edits = await getPage(displayName, stopDateIso, createdBefore);
    debug(`Got ${edits.length} results to filter`);
    if (edits.length === 0) {
      break;
    }

    const processed = processEntities(edits);
    const newEdits = processed.filter((edit) => !seenLinks.has(edit.link));
    debug(`Got ${newEdits.length} new results`);
    newEdits.forEach((edit) => {
      seenLinks.add(edit.link);
      // The time filter of the API matches changesets closed after stopDate,
      // which includes changesets created before it but closed after it.
      if (edit.createdAt.getTime() >= stopTime) {
        allEdits.push(edit);
      }
    });
    hasMoreData = edits.length === MAX_EDITS_PER_PAGE;

    const oldest = processed[processed.length - 1].createdAt.getTime();
    if (oldest < stopTime) {
      break;
    }

    // OSM timestamps only have second precision, so other changesets might
    // share the oldest timestamp of this page. Request up to the end of that
    // second again and rely on the de-duplication above. If a full page did
    // not contain anything new, more than one page of changesets was created
    // in the same second and we have to move past it to make progress.
    let nextCreatedBefore = oldest + 1000;
    if (newEdits.length === 0) {
      debug(
        `More than ${MAX_EDITS_PER_PAGE} changesets created at ${new Date(oldest).toISOString()}, some might be missing`
      );
      nextCreatedBefore = oldest - 1;
    }
    createdBefore = new Date(nextCreatedBefore).toISOString();
  }

  return allEdits;
}

function getUrl({ displayName, createdBefore, stopDate }) {
  return `https://api.openstreetmap.org/api/0.6/changesets?display_name=${encodeURIComponent(displayName)}&time=${stopDate},${createdBefore}`;
}

async function getPage(displayName, stopDate, createdBefore) {
  const url = getUrl({
    displayName,
    stopDate,
    createdBefore,
  });
  debug(`Getting ${url}`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(
      `OSM request to ${url} failed with status ${response.status}`
    );
  }
  const data = await response.text();
  const parsed = await parseStringAsync(data);
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
  const comment = (entity.tag || []).find((tag) => tag.$.k === 'comment');

  return {
    createdAt: new Date(entity.$.created_at),
    description: comment ? comment.$.v : `Changeset ${entity.$.id}`,
    link: `https://www.openstreetmap.org/changeset/${entity.$.id}`,
    type: TYPE_EDIT,
    source: OSM_CATEGORY,
  };
}
