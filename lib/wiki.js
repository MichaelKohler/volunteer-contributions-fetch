import Debug from 'debug';
import { setTimeout as sleep } from 'timers/promises';
import { z } from 'zod';

import { FETCH_TIMEOUT, sourceSchema, stopDateSchema } from './utils.js';

const debug = Debug('contributions:wiki');

export const WIKI_CATEGORY = 'wiki';

const TYPE_EDIT = 'Wiki Edit';

export const REQUEST_DELAY_MS = 2000;

// The baseUrl points to the wiki's api.php. Any query string is ignored, so
// configs written for the previous feedcontributions implementation (e.g.
// `api.php?action=feedcontributions`) keep working.
export const mediaWikiSchema = sourceSchema(
  z.strictObject({
    enabled: z.literal(true),
    baseUrl: z.url(),
    username: z.string().min(1),
    editType: z.string().optional(),
    stopDate: stopDateSchema,
  })
);

export async function gather({ mediaWiki }) {
  if (!mediaWiki?.enabled) {
    debug('MediaWiki source not enabled, skipping');
    return [];
  }

  const edits = await processEdits(mediaWiki);

  debug('Finished gathering contributions');
  return edits;
}

// We use list=usercontribs instead of action=feedcontributions: the feed
// returns at most $wgFeedLimit (default 50) items per request without any
// way to page, so older edits in busy months were silently dropped.
async function processEdits({ baseUrl, username, stopDate, editType }) {
  debug('Getting edits from Wiki');
  const apiUrl = getApiUrl(baseUrl);
  const stopTimestamp = new Date(stopDate).toISOString();

  let allEdits = [];
  let indexUrl;
  let continueParams = {};

  while (true) {
    const data = await getPage(apiUrl, {
      ...(indexUrl ? {} : { meta: 'siteinfo', siprop: 'general' }),
      list: 'usercontribs',
      ucuser: username,
      ucend: stopTimestamp,
      ...continueParams,
    });

    if (!indexUrl) {
      const { server, script } = data.query.general;
      // `server` can be protocol-relative, so resolve it against the API URL.
      indexUrl = new URL(`${server}${script}`, apiUrl).toString();
    }

    const contribs = data.query.usercontribs || [];
    debug(`Got ${contribs.length} results`);
    allEdits = allEdits.concat(
      contribs.map((contrib) => format(editType, indexUrl, contrib))
    );

    if (!data.continue) {
      return allEdits;
    }

    continueParams = data.continue;
    await sleep(REQUEST_DELAY_MS);
  }
}

function getApiUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  return url;
}

async function getPage(apiUrl, params) {
  const url = new URL(apiUrl);
  const allParams = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    uclimit: 'max',
    ucprop: 'ids|title|timestamp',
    ...params,
  };
  for (const [key, value] of Object.entries(allParams)) {
    url.searchParams.set(key, value);
  }

  debug(`Getting ${url}`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(
      `MediaWiki request to ${url} failed with status ${response.status}`
    );
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(
      `MediaWiki request to ${url} failed: ${data.error.code} - ${data.error.info}`
    );
  }

  return data;
}

// Mirrors MediaWiki's wfUrlencode() so links are identical to the ones the
// feedcontributions API used to return and existing entries still match.
function encodeTitle(title) {
  return encodeURIComponent(title.replaceAll(' ', '_')).replace(
    /%(2F|3A|40|24|2C|3B)/gi,
    (match) => decodeURIComponent(match)
  );
}

function format(type, indexUrl, contrib) {
  return {
    createdAt: new Date(contrib.timestamp),
    description: `Edited ${contrib.title}`,
    link: `${indexUrl}?title=${encodeTitle(contrib.title)}&diff=${contrib.revid}`,
    type: type || TYPE_EDIT,
    source: WIKI_CATEGORY,
  };
}
