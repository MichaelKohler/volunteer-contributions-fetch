import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as fixtures from '../fixtures/community-portal.js';
import { gather, communityPortalSchema } from './community-portal.js';

const config = {
  communityPortal: {
    enabled: true,
    baseUrl: 'https://community.mozilla.org',
    username: 'user',
  },
};

beforeEach(() => {
  vi.spyOn(JSDOM, 'fromURL');
});

afterEach(() => {
  vi.resetAllMocks();
});

test('Community Portal schema - valid config', () => {
  const validConfig = {
    enabled: true,
    baseUrl: 'https://community.mozilla.org',
    username: 'testuser',
    participationType: 'Test Event',
    campaignType: 'Test Campaign',
  };
  const result = communityPortalSchema.parse(validConfig);
  expect(result).toBeDefined();
});

test('Community Portal schema - invalid config', () => {
  const invalidConfig = {
    enabled: true,
    baseUrl: '',
    username: 'testuser',
  };
  expect(() => communityPortalSchema.parse(invalidConfig));
});

test('should fetch', async () => {
  JSDOM.fromURL.mockResolvedValueOnce(fixtures.allData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(4);
});

test('should fetch even though sections are empty', async () => {
  JSDOM.fromURL.mockResolvedValueOnce(fixtures.noData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(0);
});

test('should only fetch events and campaigns that are not in the future', async () => {
  JSDOM.fromURL.mockResolvedValueOnce(fixtures.futureData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(2);
  expect(contributions[0].createdAt).toStrictEqual(new Date('2022-08-11'));
  expect(contributions[0].description).toBe('PastEvent');
  expect(contributions[1].createdAt).toStrictEqual(new Date('2022-02-01'));
  expect(contributions[1].description).toBe('PastCampaign');
});

test('should not fetch if disabled - by enable property', async () => {
  const specificTypeConfig = {
    communityPortal: {
      ...config.communityPortal,
      enabled: false,
    },
  };

  const contributions = await gather(specificTypeConfig);

  expect(contributions.length).toBe(0);
});

test('should not fetch if disabled - by leaving off config value', async () => {
  const contributions = await gather({});

  expect(contributions.length).toBe(0);
});

test('should format', async () => {
  JSDOM.fromURL.mockResolvedValueOnce(fixtures.allData);

  const contributions = await gather(config);

  // Event
  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2022-08-11'),
    description: 'EventB',
    link: 'LinkB',
    type: 'Participated in an event',
    source: 'community-portal-events',
  });
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date('2022-08-08'),
    description: 'EventA',
    link: 'LinkA',
    type: 'Participated in an event',
    source: 'community-portal-events',
  });
  // Campaign
  expect(contributions[2]).toStrictEqual({
    createdAt: new Date('2022-02-01'),
    description: 'CampaignB',
    link: 'LinkB',
    type: 'Participated in a campaign',
    source: 'community-portal-campaigns',
  });
  expect(contributions[3]).toStrictEqual({
    createdAt: new Date('2022-01-01'),
    description: 'CampaignA',
    link: 'LinkA',
    type: 'Participated in a campaign',
    source: 'community-portal-campaigns',
  });
});

test('should format with custom types', async () => {
  JSDOM.fromURL.mockResolvedValue(fixtures.allData);

  const specificTypeConfig = {
    communityPortal: {
      ...config.communityPortal,
      participationType: 'Event!',
      campaignType: 'Campaign!',
    },
  };

  const contributions = await gather(specificTypeConfig);

  // Event
  expect(contributions[0].type).toBe(
    specificTypeConfig.communityPortal.participationType
  );
  expect(contributions[1].type).toBe(
    specificTypeConfig.communityPortal.participationType
  );
  expect(contributions[2].type).toBe(
    specificTypeConfig.communityPortal.campaignType
  );
  expect(contributions[3].type).toBe(
    specificTypeConfig.communityPortal.campaignType
  );
});
