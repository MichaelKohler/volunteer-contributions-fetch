const test = require('ava');
const fs = require('fs/promises');
const sinon = require('sinon');

const communityPortal = require('./community-portal');
const discourse = require('./discourse');
const github = require('./github');
const wiki = require('./wiki');

const validator = require('./validator');
const fetch = require('./fetch');

const config = {
  outputFile: 'file',
};

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();

  // eslint-disable-next-line no-param-reassign
  t.context.sandbox.originalJSONParse = JSON.parse;
  t.context.sandbox.stub(fs, 'readFile').resolves('');
  t.context.sandbox.stub(fs, 'stat').resolves('');
  t.context.sandbox.stub(fs, 'writeFile').resolves('');
  t.context.sandbox.stub(JSON, 'parse').returns([]);
  t.context.sandbox.stub(validator, 'validateConfig').returns([]);
  t.context.sandbox.stub(communityPortal, 'gather').returns([]);
  t.context.sandbox.stub(discourse, 'gather').returns([]);
  t.context.sandbox.stub(github, 'gather').returns([]);
  t.context.sandbox.stub(wiki, 'gather').returns([]);
});

test.afterEach.always((t) => {
  t.context.sandbox.restore();
});

test.serial(
  'should create a contributions file if file does not exist',
  async (t) => {
    const error = new Error('oh no, no config file!');
    error.code = 'ENOENT';
    fs.stat.throws(error);
    await fetch.fetchAll(config);
    t.is(fs.writeFile.callCount, 1);
    t.is(fs.writeFile.getCall(0).args[0], config.outputFile);
    t.is(fs.writeFile.getCall(0).args[1], '[]');
  }
);

test.serial('should not write file if there was nothing to do', async (t) => {
  await fetch.fetchAll(config);
  t.is(fs.writeFile.callCount, 0);
});

test.serial(
  'should consider saved contributions if not full-fetch source',
  async (t) => {
    const existingContributions = [{ source: 'keep_me' }];
    JSON.parse.returns(existingContributions);
    github.gather.returns([{ source: 'github' }]);

    await fetch.fetchAll(config);
    t.is(fs.writeFile.callCount, 1);
    t.is(
      t.context.sandbox.originalJSONParse(fs.writeFile.getCall(0).args[1])
        .length,
      2
    );
  }
);

test.serial(
  'should ignore saved contributions if full-fetch source',
  async (t) => {
    const existingContributions = [{ source: 'wiki' }, { source: 'wiki' }];
    JSON.parse.returns(existingContributions);
    github.gather.returns([{ source: 'github' }]);

    await fetch.fetchAll(config);
    t.is(fs.writeFile.callCount, 1);
    t.is(
      t.context.sandbox.originalJSONParse(fs.writeFile.getCall(0).args[1])
        .length,
      1
    );
  }
);

test.serial('should take all return values', async (t) => {
  communityPortal.gather.returns([{ source: 'community-portal' }]);
  discourse.gather.returns([{ source: 'discourse' }]);
  github.gather.returns([{ source: 'github' }]);
  wiki.gather.returns([{ source: 'wiki' }]);

  await fetch.fetchAll(config);
  t.is(fs.writeFile.callCount, 1);
  t.is(
    t.context.sandbox.originalJSONParse(fs.writeFile.getCall(0).args[1]).length,
    4
  );
});

test.serial('should return contributions', async (t) => {
  const contributions = [{ source: 'community-portal' }];
  communityPortal.gather.returns(contributions);

  const result = await fetch.fetchAll(config);
  t.deepEqual(result, contributions);
});

test.serial('should consider passed contributions', async (t) => {
  const contributions = [{ source: 'community-portal' }];
  communityPortal.gather.returns(contributions);
  const existingContributions = [
    { source: 'existing' },
    { source: 'existing' },
  ];

  const result = await fetch.fetchAll({}, existingContributions);
  t.deepEqual(result, [...existingContributions, ...contributions]);
});
