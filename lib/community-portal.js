import Debug from 'debug';
import { JSDOM } from 'jsdom';
import { z } from 'zod';

import { ensureUniqueContributions } from './contributions.js';
import { FETCH_TIMEOUT } from './utils.js';

const debug = Debug('contributions:community-portal');

export const EVENTS_CATEGORY = 'community-portal-events';
export const CAMPAIGNS_CATEGORY = 'community-portal-campaigns';

const TYPE_PARTICIPATION = 'Participated in an event';
const TYPE_CAMPAIGN = 'Participated in a campaign';

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export const communityPortalSchema = z.strictObject({
  enabled: z.boolean(),
  baseUrl: z.string().min(1),
  username: z.string().min(1),
  participationType: z.string().optional(),
  campaignType: z.string().optional(),
});

export async function gather({ communityPortal }) {
  if (!communityPortal || (communityPortal && !communityPortal.enabled)) {
    debug('Community Portal source not enabled, skipping');
    return [];
  }

  const profileUrl = `${communityPortal.baseUrl}/${communityPortal.username}`;
  const document = await getCommunityPortalDocument(profileUrl);
  const events = processEvents(communityPortal, document);
  const campaigns = processCampaigns(communityPortal, document);
  const contributions = ensureUniqueContributions([...events, ...campaigns]);

  debug('Finished gathering contributions');
  return contributions;
}

function processEvents(communityPortal, document) {
  debug('Getting events from Community Portal');
  const allEventNodes = document.querySelectorAll('.profile__event');

  return Array.from(allEventNodes, (entity) =>
    formatEvent(communityPortal.participationType, entity)
  )
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((event) => event.createdAt < new Date());
}

function processCampaigns(communityPortal, document) {
  debug('Getting campaigns from Community Portal');
  const allCampaignNodes = document.querySelectorAll('.profile__campaign');

  return Array.from(allCampaignNodes, (entity) =>
    formatCampaign(communityPortal.campaignType, entity)
  )
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((campaign) => campaign.createdAt < new Date());
}

async function getCommunityPortalDocument(url) {
  // JSDOM.fromURL has no way to set a timeout, so we fetch the page ourselves.
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(
      `Community Portal request to ${url} failed with status ${response.status}`
    );
  }
  const html = await response.text();
  const dom = new JSDOM(html, { url: response.url || url });
  const { document } = dom.window;
  return document;
}

function formatEvent(type, entity) {
  return {
    createdAt: parseEventTime(
      entity.querySelector('.profile__event-time').textContent
    ),
    description: entity
      .querySelector('.profile__event-title')
      .textContent.replace(/[\n\t]/g, ''),
    link: entity.getAttribute('href'),
    type: type || TYPE_PARTICIPATION,
    source: EVENTS_CATEGORY,
  };
}

function formatCampaign(type, entity) {
  return {
    createdAt: parseCampaignDates(
      entity.querySelector('.profile__campaign-dates').textContent
    ),
    description: entity
      .querySelector('.profile__campaign-title')
      .textContent.replace(/[\n\t]/g, ''),
    link: entity.getAttribute('href'),
    type: type || TYPE_CAMPAIGN,
    source: CAMPAIGNS_CATEGORY,
  };
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function monthIndex(name) {
  return MONTHS.indexOf(name.toLowerCase());
}

// The profile renders event times as "August 08, 2022 ∙ 18:00". The page does
// not state a time zone, so we interpret it as UTC to stay independent of the
// machine's time zone.
function parseEventTime(text) {
  const value = normalizeWhitespace(text);
  const match = value.match(
    /^([a-zA-Z]+) (\d{1,2}), (\d{4})\s*∙\s*(\d{1,2}):(\d{2})$/
  );
  const month = match ? monthIndex(match[1]) : -1;
  if (month === -1) {
    debug(`Could not parse event time "${value}"`);
    return new Date(NaN);
  }

  const [, , day, year, hours, minutes] = match;
  return new Date(Date.UTC(year, month, day, hours, minutes));
}

// The profile renders campaign dates either as "January 01 2022" or as a range
// "December 01 - January 15 2022", where only the end date carries the year.
function parseCampaignDates(text) {
  const value = normalizeWhitespace(text);
  const match = value.match(
    /^([a-zA-Z]+) (\d{1,2})(?: - ([a-zA-Z]+) \d{1,2})? (\d{4})$/
  );
  const month = match ? monthIndex(match[1]) : -1;
  const endMonth = match && match[3] ? monthIndex(match[3]) : month;
  if (month === -1 || endMonth === -1) {
    debug(`Could not parse campaign dates "${value}"`);
    return new Date(NaN);
  }

  const [, , day, , endYear] = match;
  // A range ending in an earlier month than it started spans a year boundary.
  const year = endMonth < month ? endYear - 1 : endYear;
  return new Date(Date.UTC(year, month, day));
}
