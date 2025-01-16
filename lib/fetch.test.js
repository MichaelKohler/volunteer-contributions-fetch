import fs from 'fs/promises';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as communityPortal from './community-portal.js';
import * as discourse from './discourse.js';
import * as github from './github.js';
import * as wiki from './wiki.js';

import * as validator from './validator.js';
import { fetchAll } from './fetch.js';

const config = {
  outputFile: '/tmp/file',
};

const originalJSONParse = JSON.parse;

beforeEach(() => {
  vi.spyOn(fs, 'readFile');
  vi.spyOn(fs, 'stat');
  vi.spyOn(fs, 'writeFile');
  vi.spyOn(JSON, 'parse');
  vi.spyOn(validator, 'validateConfig').mockReturnValue([]);
  vi.spyOn(communityPortal, 'gather').mockReturnValue([]);
  vi.spyOn(discourse, 'gather').mockReturnValue([]);
  vi.spyOn(github, 'gather').mockReturnValue([]);
  vi.spyOn(wiki, 'gather').mockReturnValue([]);
});

afterEach(() => {
  vi.resetAllMocks();
});

test('should create a contributions file if file does not exist', async () => {
  const error = new Error('oh no, no config file!');
  error.code = 'ENOENT';
  fs.stat.mockImplementationOnce(() => {
    throw error;
  });
  await fetchAll(config);
  expect(fs.writeFile).toHaveBeenCalledOnce();
  expect(fs.writeFile).toHaveBeenCalledWith(config.outputFile, '[]');
});

test('should not write file if there was nothing to do', async () => {
  JSON.parse.mockReturnValueOnce([]);
  await fetchAll(config);
  expect(fs.writeFile).not.toHaveBeenCalled();
});

test('should consider saved contributions if not full-fetch source', async () => {
  const existingContributions = [{ source: 'keep_me' }];
  JSON.parse.mockReturnValueOnce(existingContributions);
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);

  await fetchAll(config);
  expect(fs.writeFile).toHaveBeenCalledOnce();

  expect(originalJSONParse(fs.writeFile.mock.calls[0][1]).length).toBe(2);
});

test('should ignore saved contributions if full-fetch source', async () => {
  const existingContributions = [{ source: 'wiki' }, { source: 'wiki' }];
  JSON.parse.mockReturnValueOnce(existingContributions);
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);

  await fetchAll(config);
  expect(fs.writeFile).toHaveBeenCalledOnce();

  expect(originalJSONParse(fs.writeFile.mock.calls[0][1]).length).toBe(1);
});

test('should take all return values', async () => {
  const existingContributions = [];
  JSON.parse.mockReturnValue(existingContributions);

  communityPortal.gather.mockResolvedValueOnce([
    { source: 'community-portal' },
  ]);
  discourse.gather.mockResolvedValueOnce([{ source: 'discourse' }]);
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);
  wiki.gather.mockResolvedValueOnce([{ source: 'wiki' }]);

  await fetchAll(config);
  expect(fs.writeFile).toHaveBeenCalledOnce();

  expect(originalJSONParse(fs.writeFile.mock.calls[0][1]).length).toBe(4);
});

test('should return contributions', async () => {
  const existingContributions = [];
  JSON.parse.mockReturnValue(existingContributions);

  const contributions = [{ source: 'community-portal' }];
  communityPortal.gather.mockResolvedValueOnce(contributions);

  const result = await fetchAll(config);
  expect(result).toStrictEqual(contributions);
});

test('should consider passed contributions', async () => {
  const contributions = [{ source: 'community-portal' }];
  communityPortal.gather.mockResolvedValueOnce(contributions);
  const existingContributions = [
    { source: 'existing' },
    { source: 'existing' },
  ];

  const result = await fetchAll({}, existingContributions);
  expect(result).toStrictEqual([...existingContributions, ...contributions]);
});
