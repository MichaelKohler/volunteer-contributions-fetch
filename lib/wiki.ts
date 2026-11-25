import Debug from 'debug';
import { setTimeout as sleep } from 'timers/promises';
import { z } from 'zod';

import { requestOk } from './http.js';
import type { FetchedContribution } from './types.js';
import { tagRuleSchema } from './tags.js';
import { baseUrlSchema, sourceSchema, stopDateSchema } from './utils.js';

const debug = Debug('contributions:wiki');

export const WIKI_CATEGORY = 'wiki';
export const CATEGORIES = [WIKI_CATEGORY];

const TYPE_EDIT = 'Wiki Edit';

// The baseUrl points to the wiki's api.php. Any query string is ignored, so
// configs written for the previous feedcontributions implementation (e.g.
// `api.php?action=feedcontributions`) keep working.
export const mediaWikiSchema = sourceSchema(
  z.strictObject({
    enabled: z.literal(true),
    baseUrl: baseUrlSchema,
    username: z.string().min(1),
    editType: z.string().optional(),
    stopDate: stopDateSchema,
    delayMsPerRequest: z.number().nonnegative().default(2000),
    tagRules: z.array(tagRuleSchema).optional(),
  })
);

export type MediaWikiConfig = z.output<typeof mediaWikiSchema>;
export type EnabledMediaWikiConfig = Extract<
  MediaWikiConfig,
  { enabled: true }
>;

interface UserContrib {
  revid: number;
  title: string;
  timestamp: string;
}

interface QueryResponse {
  error?: { code: string; info: string };
  continue?: Record<string, string>;
  query: {
    general?: { server: string; script: string };
    usercontribs?: UserContrib[];
  };
}

export async function gather({
  mediaWiki,
}: {
  mediaWiki?: MediaWikiConfig;
}): Promise<FetchedContribution[]> {
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
async function processEdits({
  baseUrl,
  username,
  stopDate,
  editType,
  delayMsPerRequest,
}: EnabledMediaWikiConfig) {
  debug('Getting edits from Wiki');
  const apiUrl = getApiUrl(baseUrl);
  const stopTimestamp = new Date(stopDate).toISOString();

  let allEdits: FetchedContribution[] = [];
  let indexUrl: string | undefined;
  let continueParams: Record<string, string> = {};

  while (true) {
    const data = await getPage(apiUrl, {
      ...(indexUrl ? {} : { meta: 'siteinfo', siprop: 'general' }),
      list: 'usercontribs',
      ucuser: username,
      ucend: stopTimestamp,
      ...continueParams,
    });

    if (!indexUrl) {
      if (!data.query.general) {
        throw new Error('MediaWiki response did not contain the site info');
      }

      const { server, script } = data.query.general;
      // `server` can be protocol-relative, so resolve it against the API URL.
      indexUrl = new URL(`${server}${script}`, apiUrl).toString();
    }

    const contribs = data.query.usercontribs || [];
    debug(`Got ${contribs.length} results`);
    const pageIndexUrl = indexUrl;
    allEdits = allEdits.concat(
      contribs.map((contrib) => format(editType, pageIndexUrl, contrib))
    );

    if (!data.continue) {
      return allEdits;
    }

    continueParams = data.continue;
    if (delayMsPerRequest !== 0) {
      await sleep(delayMsPerRequest);
    }
  }
}

function getApiUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  return url;
}

async function getPage(
  apiUrl: URL,
  params: Record<string, string>
): Promise<QueryResponse> {
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
  const response = await requestOk(url, 'MediaWiki');

  const data = (await response.json()) as QueryResponse;
  if (data.error) {
    throw new Error(
      `MediaWiki request to ${url} failed: ${data.error.code} - ${data.error.info}`
    );
  }

  return data;
}

// Mirrors MediaWiki's wfUrlencode() so links are identical to the ones the
// feedcontributions API used to return and existing entries still match.
function encodeTitle(title: string): string {
  return encodeURIComponent(title.replaceAll(' ', '_')).replace(
    /%(2F|3A|40|24|2C|3B)/gi,
    (match) => decodeURIComponent(match)
  );
}

function format(
  type: string | undefined,
  indexUrl: string,
  contrib: UserContrib
): FetchedContribution {
  return {
    createdAt: new Date(contrib.timestamp),
    description: `Edited ${contrib.title}`,
    link: `${indexUrl}?title=${encodeTitle(contrib.title)}&diff=${contrib.revid}`,
    type: type || TYPE_EDIT,
    source: WIKI_CATEGORY,
  };
}
