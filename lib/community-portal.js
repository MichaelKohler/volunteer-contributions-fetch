const debug = require('debug')('contributions:community-portal');
const { JSDOM } = require('jsdom');

const EVENTS_CATEGORY = 'community-portal-events';
const CAMPAIGNS_CATEGORY = 'community-portal-campaigns';

const TYPE_PARTICIPATION = 'Participated in an event';
const TYPE_CAMPAIGN = 'Participated in a campaign';

module.exports = {
  EVENTS_CATEGORY,
  CAMPAIGNS_CATEGORY,
  gather,
  validate,
};

function validate(config) {
  debug('Validating Community Portal config');

  if (!config) {
    return;
  }

  if (config && config.enabled && !config.baseUrl) {
    throw new Error('Community Portal: baseUrl is required');
  }

  if (config && config.enabled && !config.username) {
    throw new Error('Community Portal: username is required');
  }
}

async function gather({ communityPortal }) {
  if (!communityPortal || (communityPortal && !communityPortal.enabled)) {
    debug('Community Portal source not enabled, skipping');
    return [];
  }

  const profileUrl = `${communityPortal.baseUrl}/${communityPortal.username}`;
  const document = await getCommunityPortalDocument(profileUrl);
  const events = await processEvents(communityPortal, document);
  const campaigns = await processCampaigns(communityPortal, document);
  const contributions = [...events, ...campaigns];

  debug('Finished gathering contributions');
  return contributions;
}

async function processEvents(communityPortal, document) {
  debug('Getting events from Community Portal');
  const allEventNodes = document.querySelectorAll('.profile__event');

  const allEvents = Array.from(allEventNodes, (entity) =>
    formatEvent(communityPortal.participationType, entity)
  )
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((event) => event.createdAt < new Date());
  return Array.from(new Set(allEvents));
}

async function processCampaigns(communityPortal, document) {
  debug('Getting campaigns from Community Portal');
  const allCampaignNodes = document.querySelectorAll('.profile__campaign');

  return Array.from(allCampaignNodes, (entity) =>
    formatCampaign(communityPortal.campaignType, entity)
  )
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((campaign) => campaign.createdAt < new Date());
}

async function getCommunityPortalDocument(url) {
  const dom = await JSDOM.fromURL(url);
  const { document } = dom.window;
  return document;
}

function formatEvent(type, entity) {
  return {
    createdAt: new Date(
      entity
        .querySelector('.profile__event-time')
        .textContent.replace(/[\n\t∙]/g, '')
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
  const dateValue = entity
    .querySelector('.profile__campaign-dates')
    .textContent.replace(/[\n\t∙]/g, '')
    .replace(/\s*-\s*[a-zA-Z]+\s\d{2}/g, '');
  return {
    createdAt: new Date(dateValue),
    description: entity
      .querySelector('.profile__campaign-title')
      .textContent.replace(/[\n\t]/g, ''),
    link: entity.getAttribute('href'),
    type: type || TYPE_CAMPAIGN,
    source: CAMPAIGNS_CATEGORY,
  };
}
