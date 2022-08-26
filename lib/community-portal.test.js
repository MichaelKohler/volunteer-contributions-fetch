const test = require('ava');
const { JSDOM } = require('jsdom');
const sinon = require('sinon');

const fixtures = require('../fixtures/community-portal');
const communityPortal = require('./community-portal');

const config = {
  communityPortal: {
    enabled: true,
    baseUrl: 'https://community.mozilla.org',
    username: 'user',
  }
};

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();

  t.context.sandbox.stub(JSDOM, 'fromURL');
});

test.afterEach.always((t) => {
  t.context.sandbox.restore();
});

test.serial('should validate config - missing completely', (t) => {
  const emptyConfig = {};
  t.notThrows(() => communityPortal.validate(emptyConfig));
});

test.serial('should validate config - missing baseUrl', (t) => {
  const failConfig = {
    enabled: true,
    username: 'A',
  };

  t.throws(() => communityPortal.validate(failConfig));
});

test.serial('should validate config - missing username', (t) => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
  };

  t.throws(() => communityPortal.validate(failConfig));
});

test.serial('should fetch', async (t) => {
  JSDOM.fromURL.resolves(fixtures.allData);

  const contributions = await communityPortal.gather(config);
  t.is(contributions.length, 4);
});

test.serial('should fetch even though sections are empty', async (t) => {
  JSDOM.fromURL.resolves(fixtures.noData);

  const contributions = await communityPortal.gather(config);
  t.is(contributions.length, 0);
});

test.serial('should only fetch events and campaigns that are not in the future', async (t) => {
  JSDOM.fromURL.resolves(fixtures.futureData);

  const contributions = await communityPortal.gather(config);
  t.is(contributions.length, 2);
  t.deepEqual(contributions[0].createdAt, new Date('2022-08-11'));
  t.is(contributions[0].description, 'PastEvent');
  t.deepEqual(contributions[1].createdAt, new Date('2022-02-01'));
  t.is(contributions[1].description, 'PastCampaign');
});

test.serial('should not fetch if disabled - by enable property', async (t) => {
  const specificTypeConfig = {
    communityPortal: {
      ...config.communityPortal,
      enabled: false,
    },
  };

  const contributions = await communityPortal.gather(specificTypeConfig);

  t.is(contributions.length, 0);
});

test.serial('should not fetch if disabled - by leaving off config value', async (t) => {
  const contributions = await communityPortal.gather({});

  t.is(contributions.length, 0);
});

test.serial('should format', async (t) => {
  JSDOM.fromURL.resolves(fixtures.allData);

  const contributions = await communityPortal.gather(config);

  // Event
  t.deepEqual(contributions[0], {
    createdAt: new Date('2022-08-11'),
    description: 'EventB',
    link: 'LinkB',
    type: 'Participated in an event',
    source: 'community-portal-events',
  });
  t.deepEqual(contributions[1], {
    createdAt: new Date('2022-08-08'),
    description: 'EventA',
    link: 'LinkA',
    type: 'Participated in an event',
    source: 'community-portal-events',
  });
  // Campaign
  t.deepEqual(contributions[2], {
    createdAt: new Date('2022-02-01'),
    description: 'CampaignB',
    link: 'LinkB',
    type: 'Participated in a campaign',
    source: 'community-portal-campaigns',
  });
  t.deepEqual(contributions[3], {
    createdAt: new Date('2022-01-01'),
    description: 'CampaignA',
    link: 'LinkA',
    type: 'Participated in a campaign',
    source: 'community-portal-campaigns',
  });
});

test.serial('should format with custom types', async (t) => {
  JSDOM.fromURL.resolves(fixtures.allData);

  const specificTypeConfig = {
    communityPortal: {
      ...config.communityPortal,
      participationType: 'Event!',
      campaignType: 'Campaign!',
    }
  };

  const contributions = await communityPortal.gather(specificTypeConfig);

  // Event
  t.is(contributions[0].type, specificTypeConfig.communityPortal.participationType);
  t.is(contributions[1].type, specificTypeConfig.communityPortal.participationType);
  t.is(contributions[2].type, specificTypeConfig.communityPortal.campaignType);
  t.is(contributions[3].type, specificTypeConfig.communityPortal.campaignType);
});
