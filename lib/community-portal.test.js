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

vi.mock('jsdom', () => ({ JSDOM: vi.fn() }));

function mockDocument(fixture) {
  JSDOM.mockImplementationOnce(function () {
    return fixture;
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://community.mozilla.org/user',
      text: () => Promise.resolve('<html></html>'),
    })
  );
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
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
  mockDocument(fixtures.allData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(4);
});

test('should fetch even though sections are empty', async () => {
  mockDocument(fixtures.noData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(0);
});

test('should remove duplicate events', async () => {
  mockDocument(fixtures.duplicateData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(1);
  expect(contributions[0].description).toBe('EventA');
});

test('should remove duplicate campaigns', async () => {
  mockDocument(fixtures.duplicateCampaignData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(1);
  expect(contributions[0].description).toBe('CampaignA');
});

test('should only fetch events and campaigns that are not in the future', async () => {
  mockDocument(fixtures.futureData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(2);
  expect(contributions[0].createdAt).toStrictEqual(
    new Date(Date.UTC(2022, 7, 11, 9, 30))
  );
  expect(contributions[0].description).toBe('PastEvent');
  expect(contributions[1].createdAt).toStrictEqual(
    new Date(Date.UTC(2022, 1, 1))
  );
  expect(contributions[1].description).toBe('PastCampaign');
});

test('should take the start year of campaigns spanning a year boundary', async () => {
  mockDocument(fixtures.crossYearCampaignData);

  const contributions = await gather(config);

  expect(contributions.length).toBe(1);
  expect(contributions[0].createdAt).toStrictEqual(
    new Date(Date.UTC(2021, 11, 1))
  );
});

test('should throw on entries with unparseable dates', async () => {
  mockDocument(fixtures.unparseableDateData);

  await expect(gather(config)).rejects.toThrow(
    'Could not parse Community Portal'
  );
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
  mockDocument(fixtures.allData);

  const contributions = await gather(config);

  // Event
  expect(contributions[0]).toStrictEqual({
    createdAt: new Date(Date.UTC(2022, 7, 11, 9, 30)),
    description: 'EventB',
    link: 'LinkB',
    type: 'Participated in an event',
    source: 'community-portal-events',
  });
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date(Date.UTC(2022, 7, 8, 18, 0)),
    description: 'EventA',
    link: 'LinkA',
    type: 'Participated in an event',
    source: 'community-portal-events',
  });
  // Campaign
  expect(contributions[2]).toStrictEqual({
    createdAt: new Date(Date.UTC(2022, 1, 1)),
    description: 'CampaignB',
    link: 'LinkB',
    type: 'Participated in a campaign',
    source: 'community-portal-campaigns',
  });
  expect(contributions[3]).toStrictEqual({
    createdAt: new Date(Date.UTC(2022, 0, 1)),
    description: 'CampaignA',
    link: 'LinkA',
    type: 'Participated in a campaign',
    source: 'community-portal-campaigns',
  });
});

test('should format with custom types', async () => {
  mockDocument(fixtures.allData);

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

test('should fetch the profile with a timeout signal', async () => {
  mockDocument(fixtures.noData);

  await gather(config);

  expect(fetch).toHaveBeenCalledWith(
    'https://community.mozilla.org/user',
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(JSDOM).toHaveBeenCalledWith('<html></html>', {
    url: 'https://community.mozilla.org/user',
  });
});

test('should throw on unsuccessful response', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 500 });

  await expect(gather(config)).rejects.toThrow(
    'Community Portal request to https://community.mozilla.org/user failed with status 500'
  );
});
