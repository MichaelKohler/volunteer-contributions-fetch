import Debug from 'debug';
import { JSDOM } from 'jsdom';
import { z } from 'zod';

import { ensureUniqueContributions } from './contributions.js';
import { requestOk } from './http.js';
import { baseUrlSchema, sourceSchema } from './utils.js';

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

export const communityPortalSchema = sourceSchema(
  z.strictObject({
    enabled: z.literal(true),
    baseUrl: baseUrlSchema,
    username: z.string().min(1),
    participationType: z.string().optional(),
    campaignType: z.string().optional(),
  })
);

export async function gather({ communityPortal }) {
  if (!communityPortal?.enabled) {
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
  const response = await requestOk(url, 'Community Portal');
  const html = await response.text();
  const dom = new JSDOM(html, { url: response.url || url });
  const { document } = dom.window;
  return document;
}

function formatEvent(type, entity) {
  return {
    createdAt: parseEventTime(getChildText(entity, '.profile__event-time')),
    description: getChildText(entity, '.profile__event-title').replace(
      /[\n\t]/g,
      ''
    ),
    link: entity.getAttribute('href'),
    type: type || TYPE_PARTICIPATION,
    source: EVENTS_CATEGORY,
  };
}

function formatCampaign(type, entity) {
  return {
    createdAt: parseCampaignDates(
      getChildText(entity, '.profile__campaign-dates')
    ),
    description: getChildText(entity, '.profile__campaign-title').replace(
      /[\n\t]/g,
      ''
    ),
    link: entity.getAttribute('href'),
    type: type || TYPE_CAMPAIGN,
    source: CAMPAIGNS_CATEGORY,
  };
}

// Throw a descriptive error instead of a generic TypeError when the profile
// markup changes and an expected child element is missing.
function getChildText(entity, selector) {
  const element = entity.querySelector(selector);
  if (!element) {
    throw new Error(
      `Could not find "${selector}" in Community Portal entry, the profile markup may have changed`
    );
  }
  return element.textContent;
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
    throw new Error(`Could not parse Community Portal event time "${value}"`);
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
    throw new Error(
      `Could not parse Community Portal campaign dates "${value}"`
    );
  }

  const [, , day, , endYear] = match;
  // A range ending in an earlier month than it started spans a year boundary.
  const year = endMonth < month ? endYear - 1 : endYear;
  return new Date(Date.UTC(year, month, day));
}
