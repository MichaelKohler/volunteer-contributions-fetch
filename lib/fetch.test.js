import fs from 'fs/promises';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as communityPortal from './community-portal.js';
import * as discourse from './discourse.js';
import * as github from './github.js';
import * as osm from './osm.js';
import * as wiki from './wiki.js';

import * as validator from './validator.js';
import { fetchAll } from './fetch.js';

const config = {
  outputFile: '/tmp/file',
};

const wikiEnabledConfig = {
  ...config,
  mediaWiki: { enabled: true },
};

const tempFile = `${config.outputFile}.${process.pid}.tmp`;

const originalJSONParse = JSON.parse;

beforeEach(() => {
  vi.spyOn(fs, 'readFile');
  vi.spyOn(fs, 'stat');
  vi.spyOn(fs, 'writeFile');
  vi.spyOn(fs, 'rename');
  vi.spyOn(fs, 'rm');
  vi.spyOn(JSON, 'parse');
  vi.spyOn(validator, 'validateConfig').mockImplementation((config) => config);
  vi.spyOn(communityPortal, 'gather').mockReturnValue([]);
  vi.spyOn(discourse, 'gather').mockReturnValue([]);
  vi.spyOn(github, 'gather').mockReturnValue([]);
  vi.spyOn(osm, 'gather').mockReturnValue([]);
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
  expect(fs.writeFile).toHaveBeenCalledWith(tempFile, '[]');
  expect(fs.rename).toHaveBeenCalledWith(tempFile, config.outputFile);
});

test('should ignore passed contributions if output file does not exist', async () => {
  const error = new Error('oh no, no config file!');
  error.code = 'ENOENT';
  fs.stat.mockImplementationOnce(() => {
    throw error;
  });
  const passedContributions = [{ source: 'existing' }];

  const result = await fetchAll(config, passedContributions);
  expect(result).toStrictEqual([]);
  expect(fs.writeFile).toHaveBeenCalledOnce();
  expect(fs.writeFile).toHaveBeenCalledWith(tempFile, '[]');
});

test('should write output file through a temporary file', async () => {
  JSON.parse.mockReturnValueOnce([]);
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);

  await fetchAll(config);
  expect(fs.writeFile).toHaveBeenCalledOnce();
  expect(fs.writeFile.mock.calls[0][0]).toBe(tempFile);
  expect(fs.rename).toHaveBeenCalledOnce();
  expect(fs.rename).toHaveBeenCalledWith(tempFile, config.outputFile);
});

test('should not replace output file and remove temporary file if writing fails', async () => {
  JSON.parse.mockReturnValueOnce([]);
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);
  fs.writeFile.mockRejectedValueOnce(new Error('disk full'));

  await expect(fetchAll(config)).rejects.toThrow('disk full');
  expect(fs.rename).not.toHaveBeenCalled();
  expect(fs.rm).toHaveBeenCalledWith(tempFile, { force: true });
});

test('should throw and not overwrite file if output file is corrupt', async () => {
  fs.stat.mockResolvedValueOnce({});
  fs.readFile.mockResolvedValueOnce('{ not json');
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);

  await expect(fetchAll(config)).rejects.toThrow(
    'Could not read existing output file'
  );
  expect(github.gather).not.toHaveBeenCalled();
  expect(fs.writeFile).not.toHaveBeenCalled();
});

test('should throw and not overwrite file if output file is not an array', async () => {
  fs.stat.mockResolvedValueOnce({});
  fs.readFile.mockResolvedValueOnce('{}');
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);

  await expect(fetchAll(config)).rejects.toThrow(
    'Could not read existing output file'
  );
  expect(github.gather).not.toHaveBeenCalled();
  expect(fs.writeFile).not.toHaveBeenCalled();
});

test('should throw and not overwrite file if output file is not readable', async () => {
  const error = new Error('permission denied');
  error.code = 'EACCES';
  fs.stat.mockResolvedValueOnce({});
  fs.readFile.mockRejectedValueOnce(error);

  await expect(fetchAll(config)).rejects.toThrow('permission denied');
  expect(fs.writeFile).not.toHaveBeenCalled();
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
  const existingContributions = [
    { source: 'wiki', link: 'https://example.com/1' },
    { source: 'wiki', link: 'https://example.com/2' },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  github.gather.mockResolvedValueOnce([
    { source: 'github', link: 'https://example.com/3' },
  ]);
  wiki.gather.mockResolvedValueOnce([
    { source: 'wiki', link: 'https://example.com/4' },
  ]);

  await fetchAll(wikiEnabledConfig);
  expect(fs.writeFile).toHaveBeenCalledOnce();

  const written = originalJSONParse(fs.writeFile.mock.calls[0][1]);
  expect(written.map(({ link }) => link).sort()).toEqual([
    'https://example.com/3',
    'https://example.com/4',
  ]);
});

test('should keep saved contributions if full-fetch source returns nothing', async () => {
  const existingContributions = [
    { source: 'wiki', link: 'https://example.com/1' },
    { source: 'wiki', link: 'https://example.com/2' },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  github.gather.mockResolvedValueOnce([
    { source: 'github', link: 'https://example.com/3' },
  ]);

  await fetchAll(wikiEnabledConfig);
  expect(fs.writeFile).toHaveBeenCalledOnce();

  expect(originalJSONParse(fs.writeFile.mock.calls[0][1]).length).toBe(3);
});

test('should keep saved contributions only of full-fetch categories returning nothing', async () => {
  const existingContributions = [
    { source: 'community-portal-events', link: 'https://example.com/1' },
    { source: 'community-portal-campaigns', link: 'https://example.com/2' },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  communityPortal.gather.mockResolvedValueOnce([
    { source: 'community-portal-events', link: 'https://example.com/3' },
  ]);

  await fetchAll({ ...config, communityPortal: { enabled: true } });
  expect(fs.writeFile).toHaveBeenCalledOnce();

  const written = originalJSONParse(fs.writeFile.mock.calls[0][1]);
  expect(written.map(({ link }) => link).sort()).toEqual([
    'https://example.com/2',
    'https://example.com/3',
  ]);
});

test('should keep saved contributions of disabled full-fetch source', async () => {
  const existingContributions = [
    { source: 'wiki', link: 'https://example.com/1' },
    { source: 'discourse-posts', link: 'https://example.com/2' },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  github.gather.mockResolvedValueOnce([
    { source: 'github', link: 'https://example.com/3' },
  ]);

  await fetchAll({ ...config, discourse: { enabled: false } });
  expect(fs.writeFile).toHaveBeenCalledOnce();

  expect(originalJSONParse(fs.writeFile.mock.calls[0][1]).length).toBe(3);
});

test('should take all return values', async () => {
  const existingContributions = [];
  JSON.parse.mockReturnValue(existingContributions);

  communityPortal.gather.mockResolvedValueOnce([
    { source: 'community-portal' },
  ]);
  discourse.gather.mockResolvedValueOnce([{ source: 'discourse' }]);
  github.gather.mockResolvedValueOnce([{ source: 'github' }]);
  osm.gather.mockResolvedValueOnce([{ source: 'osm' }]);
  wiki.gather.mockResolvedValueOnce([{ source: 'wiki' }]);

  await fetchAll(config);
  expect(fs.writeFile).toHaveBeenCalledOnce();

  expect(originalJSONParse(fs.writeFile.mock.calls[0][1]).length).toBe(5);
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
    { source: 'existing', link: 'https://example.com/1' },
    { source: 'existing', link: 'https://example.com/2' },
  ];

  const result = await fetchAll({}, existingContributions);
  expect(result).toStrictEqual([...existingContributions, ...contributions]);
});

test('should write file if one entry was added and another removed', async () => {
  const existingContributions = [
    {
      source: 'wiki',
      link: 'https://example.com/removed',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  const added = {
    source: 'wiki',
    link: 'https://example.com/added',
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
  };
  wiki.gather.mockResolvedValueOnce([added]);

  await fetchAll(wikiEnabledConfig);
  expect(fs.writeFile).toHaveBeenCalledOnce();

  const written = originalJSONParse(fs.writeFile.mock.calls[0][1]);
  expect(written).toStrictEqual([
    {
      source: 'wiki',
      link: 'https://example.com/added',
      createdAt: '2024-01-02T00:00:00.000Z',
    },
  ]);
});

test('should not write file if fetched entries match saved ones', async () => {
  const existingContributions = [
    {
      source: 'wiki',
      link: 'https://example.com/1',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  wiki.gather.mockResolvedValueOnce([
    {
      source: 'wiki',
      link: 'https://example.com/1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    },
  ]);

  await fetchAll(wikiEnabledConfig);
  expect(fs.writeFile).not.toHaveBeenCalled();
});

test('should remove duplicate contributions', async () => {
  const existingContributions = [
    {
      source: 'github-commit',
      type: 'commit',
      link: 'https://example.com/1',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  github.gather.mockResolvedValueOnce([
    {
      source: 'github-commit',
      type: 'commit',
      link: 'https://example.com/1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    },
    {
      source: 'github-commit',
      type: 'commit',
      link: 'https://example.com/2',
      createdAt: new Date('2024-01-02T00:00:00.000Z'),
    },
  ]);

  const result = await fetchAll(config);
  expect(result.length).toBe(2);
  expect(fs.writeFile).toHaveBeenCalledOnce();
  expect(originalJSONParse(fs.writeFile.mock.calls[0][1]).length).toBe(2);
});

test('should not write file if only key order and sort order differ', async () => {
  const existingContributions = [
    {
      link: 'https://example.com/1',
      source: 'wiki',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      link: 'https://example.com/2',
      source: 'wiki',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  JSON.parse.mockReturnValueOnce(existingContributions);
  wiki.gather.mockResolvedValueOnce([
    {
      source: 'wiki',
      link: 'https://example.com/2',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    },
    {
      source: 'wiki',
      link: 'https://example.com/1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    },
  ]);

  await fetchAll(wikiEnabledConfig);
  expect(fs.writeFile).not.toHaveBeenCalled();
});
