import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { firstPage, secondPage } from '../fixtures/osm.js';
import * as osm from './osm.js';

const config = {
  osm: {
    enabled: true,
    displayName: 'user',
    stopDate: '2021-11-01',
  },
};

beforeEach(() => {
  const mockedFetch = vi
    .fn()
    .mockResolvedValueOnce({ text: vi.fn().mockResolvedValue(firstPage) })
    .mockResolvedValueOnce({ text: vi.fn().mockResolvedValue(secondPage) });
  vi.stubGlobal('fetch', mockedFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('should validate valid config', () => {
  const result = osm.osmSchema.parse(config.osm);
  expect(result).toBeDefined();
});

test('should validate config - missing completely', () => {
  const emptyConfig = {};
  expect(() => osm.osmSchema.parse(emptyConfig)).toThrow();
});

test('should validate config - missing displayName', () => {
  const failConfig = {
    enabled: true,
    stopDate: new Date(),
  };

  expect(() => osm.osmSchema.parse(failConfig)).toThrow();
});

test('should validate config - missing stopDate', () => {
  const failConfig = {
    enabled: true,
    displayName: 'user',
  };

  expect(() => osm.osmSchema.parse(failConfig)).toThrow();
});

test('should fetch', async () => {
  const contributions = await osm.gather(config);
  expect(contributions.length).toBe(101);
});

test('should not fetch if disabled - by enable property', async () => {
  const specificTypeConfig = {
    osm: {
      ...config.osm,
      enabled: false,
    },
  };

  const contributions = await osm.gather(specificTypeConfig);

  expect(contributions.length).toBe(0);
});

test('should not fetch if disabled - by leaving off config value', async () => {
  const contributions = await osm.gather({});

  expect(contributions.length).toBe(0);
});

test('should format', async () => {
  const contributions = await osm.gather(config);

  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2024-12-29T12:53:41.000Z'),
    description: 'Some test description 1',
    link: 'https://www.openstreetmap.org/changeset/1',
    source: 'osm',
    type: 'OpenStreetMaps Edit',
  });
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date('2024-12-29T12:53:41.000Z'),
    description: 'Some test description 2',
    link: 'https://www.openstreetmap.org/changeset/2',
    source: 'osm',
    type: 'OpenStreetMaps Edit',
  });
  expect(contributions[100]).toStrictEqual({
    createdAt: new Date('2024-12-29T12:53:41.000Z'),
    description: 'Some test description 101',
    link: 'https://www.openstreetmap.org/changeset/101',
    source: 'osm',
    type: 'OpenStreetMaps Edit',
  });
});
