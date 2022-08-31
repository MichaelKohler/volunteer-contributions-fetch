const test = require('ava');
const axios = require('axios');
const sinon = require('sinon');

const bugzilla = require('./bugzilla');

const config = {
  bugzilla: {
    enabled: true,
    baseUrl: 'https://bugzilla.mozilla.org',
    username: 'user',
    stopDate: new Date('2021-11-01'),
  }
};

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();

  const firstBugsPage = {
    bugs: new Array(500).fill(0).map(() => ({
      created_at: new Date('2020-04-13'),
      summary: 'Summary',
      // This would be the bug ID which would be different, but enough for testing purposes
      id: 1,
    })),
  };

  const secondBugsPage = {
    bugs: [{
      created_at: new Date('2020-04-13'),
      summary: 'SecondSummary',
      id: 1,
    }]
  };

  const comments = {
    bugs: {
      // This would be the bug ID which would be different, but enough for testing purposes
      1: {
        comments: [{
          creation_time: new Date('2020-04-13'),
          creator: 'user',
          bug_id: 1,
          count: 0,
        }, {
          creation_time: new Date('2020-04-13'),
          creator: 'user',
          bug_id: 1,
          count: 1,
        }, {
          creation_time: new Date('2020-04-13'),
          creator: 'WILL_BE_FILTERED_OUT',
          bug_id: 1,
          count: 2,
        }],
      },
    },
  };

  t.context.sandbox.stub(axios, 'request');
  axios.request.resolves({ data: comments });
  axios.request.onCall(0)
    .resolves({ data: firstBugsPage });
  axios.request.onCall(1)
    .resolves({ data: secondBugsPage });
});

test.afterEach.always((t) => {
  t.context.sandbox.restore();
});

test.serial('should validate config - undefined', (t) => {
  t.notThrows(() => bugzilla.validate(undefined));
});

test.serial('should validate config - missing completely', (t) => {
  const emptyConfig = {};
  t.notThrows(() => bugzilla.validate(emptyConfig));
});

test.serial('should validate config - missing baseUrl', (t) => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: new Date(),
  };

  t.throws(() => bugzilla.validate(failConfig));
});

test.serial('should validate config - missing username', (t) => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    stopDate: new Date(),
  };

  t.throws(() => bugzilla.validate(failConfig));
});

test.serial('should validate config - missing stopDate', (t) => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    username: 'user',
  };

  t.throws(() => bugzilla.validate(failConfig));
});

test.serial('should fetch', async (t) => {
  const contributions = await bugzilla.gather(config);
  t.is(contributions.length, (500 + 1) * 2);
});

test.serial('should not fetch if disabled - by enable property', async (t) => {
  const specificTypeConfig = {
    bugzilla: {
      ...config.bugzilla,
      enabled: false,
    },
  };

  const contributions = await bugzilla.gather(specificTypeConfig);

  t.is(contributions.length, 0);
});

test.serial('should not fetch if disabled - by leaving off config value', async (t) => {
  const contributions = await bugzilla.gather({});

  t.is(contributions.length, 0);
});

test.serial('should format', async (t) => {
  const contributions = await bugzilla.gather(config);

  t.deepEqual(contributions[0], {
    createdAt: new Date('2020-04-13'),
    description: 'SecondSummary',
    link: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1#c0',
    type: 'Created a Bug Report',
    source: 'bugzilla-created',
  });
  t.deepEqual(contributions[1], {
    createdAt: new Date('2020-04-13'),
    description: 'SecondSummary',
    link: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1#c1',
    type: 'Commented on a Bug Report',
    source: 'bugzilla-comments',
  });
});

test.serial('should format with custom types', async (t) => {
  const specificTypeConfig = {
    bugzilla: {
      ...config.bugzilla,
      types: {
        createdType: 'CREATED!',
        commentedType: 'COMMENTED!',
      },
    },
  };

  const contributions = await bugzilla.gather(specificTypeConfig);

  t.is(contributions[0].type, specificTypeConfig.bugzilla.types.createdType);
  t.is(contributions[1].type, specificTypeConfig.bugzilla.types.commentedType);
});
