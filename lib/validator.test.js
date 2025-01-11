import test from 'ava';
import sinon from 'sinon';

import * as communityPortal from './community-portal.js';
import * as discourse from './discourse.js';
import * as github from './github.js';
import * as wiki from './wiki.js';

import { validateConfig } from './validator.js';

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
  t.notThrows(() => validateConfig(config));
});

test.serial('should throw when missing config', (t) => {
  t.throws(() => validateConfig());
});

test.serial('should throw when community portal validation fails', (t) => {
  communityPortal.validate.rejects(new Error('oh no'));
  t.throws(() => validateConfig());
});

test.serial('should throw when discourse validation fails', (t) => {
  discourse.validate.rejects(new Error('oh no'));
  t.throws(() => validateConfig());
});

test.serial('should throw when github validation fails', (t) => {
  github.validate.rejects(new Error('oh no'));
  t.throws(() => validateConfig());
});

test.serial('should throw when wiki validation fails', (t) => {
  wiki.validate.rejects(new Error('oh no'));
  t.throws(() => validateConfig());
});
