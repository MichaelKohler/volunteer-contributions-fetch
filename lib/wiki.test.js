const test = require('ava');
const axios = require('axios');
const sinon = require('sinon');

const fixtures = require('../fixtures/wiki');
const wiki = require('./wiki');

const config = {
  mediaWiki: {
    enabled: true,
    baseUrl: 'https://wiki.mozilla.org',
    username: 'user',
    stopDate: new Date('2021-11-01'),
  }
};

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox.clock = sinon.useFakeTimers(new Date('2022-01-03'));

  t.context.sandbox.stub(axios, 'get');
  axios.get.onCall(0)
    .resolves({ data: fixtures.firstMonth });
  axios.get.onCall(1)
    .resolves({ data: fixtures.secondMonth });
});

test.afterEach.always((t) => {
  t.context.sandbox.clock.restore();
  t.context.sandbox.restore();
});

test.serial('should validate config - missing completely', (t) => {
  const emptyConfig = {};
  t.notThrows(() => wiki.validate(emptyConfig));
});

test.serial('should validate config - missing baseUrl', (t) => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: new Date(),
  };

  t.throws(() => wiki.validate(failConfig));
});

test.serial('should validate config - missing username', (t) => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    stopDate: new Date(),
  };

  t.throws(() => wiki.validate(failConfig));
});

test.serial('should validate config - missing stopDate', (t) => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    username: 'user',
  };

  t.throws(() => wiki.validate(failConfig));
});

test.serial('should fetch', async (t) => {
  const contributions = await wiki.gather(config);
  t.is(contributions.length, 3);
});

test.serial('should not fetch if disabled - by enable property', async (t) => {
  const specificTypeConfig = {
    mediaWiki: {
      ...config.mediaWiki,
      enabled: false,
    },
  };

  const contributions = await wiki.gather(specificTypeConfig);

  t.is(contributions.length, 0);
});

test.serial('should not fetch if disabled - by leaving off config value', async (t) => {
  const contributions = await wiki.gather({});

  t.is(contributions.length, 0);
});

test.serial('should format', async (t) => {
  const contributions = await wiki.gather(config);

  t.deepEqual(contributions[0], {
    createdAt: new Date('2022-01-01'),
    description: 'Edited PageA',
    link: 'LinkA',
    type: 'Wiki Edit',
    source: 'wiki',
  });
  t.deepEqual(contributions[1], {
    createdAt: new Date('2022-01-02'),
    description: 'Edited PageB',
    link: 'LinkB',
    type: 'Wiki Edit',
    source: 'wiki',
  });
  t.deepEqual(contributions[2], {
    createdAt: new Date('2021-12-01'),
    description: 'Edited PageC',
    link: 'LinkC',
    type: 'Wiki Edit',
    source: 'wiki',
  });
});

test.serial('should format with custom types', async (t) => {
  const specificTypeConfig = {
    mediaWiki: {
      ...config.mediaWiki,
      editType: 'EDITED!',
    }
  };

  const contributions = await wiki.gather(specificTypeConfig);

  t.is(contributions[0].type, specificTypeConfig.mediaWiki.editType);
});
