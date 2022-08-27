const test = require('ava');
const sinon = require('sinon');

const communityPortal = require('./community-portal');
const discourse = require('./discourse');
const github = require('./github');
const wiki = require('./wiki');

const validator = require('./validator');

const config = {
  outputFile: 'file',
};

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();

  t.context.sandbox.stub(communityPortal, 'validate');
  t.context.sandbox.stub(discourse, 'validate');
  t.context.sandbox.stub(github, 'validate');
  t.context.sandbox.stub(wiki, 'validate');
});

test.afterEach.always((t) => {
  t.context.sandbox.restore();
});

test.serial('should validate config - all ok', (t) => {
  t.notThrows(() => validator.validateConfig(config));
});

test.serial('should throw when missing config', (t) => {
  t.throws(() => validator.validateConfig());
});

test.serial('should throw when outputFile is not defined', (t) => {
  t.throws(() => validator.validateConfig({ somethingElse: true }));
});

test.serial('should throw when community portal validation fails', (t) => {
  communityPortal.validate.rejects(new Error('oh no'));
  t.throws(() => validator.validateConfig());
});

test.serial('should throw when discourse validation fails', (t) => {
  discourse.validate.rejects(new Error('oh no'));
  t.throws(() => validator.validateConfig());
});

test.serial('should throw when github validation fails', (t) => {
  github.validate.rejects(new Error('oh no'));
  t.throws(() => validator.validateConfig());
});

test.serial('should throw when wiki validation fails', (t) => {
  wiki.validate.rejects(new Error('oh no'));
  t.throws(() => validator.validateConfig());
});
