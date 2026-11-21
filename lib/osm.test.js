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
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(firstPage),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(secondPage),
    });
  vi.stubGlobal('fetch', mockedFetch);
});

afterEach(() => {
  vi.resetAllMocks();
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
    stopDate: '2021-11-01',
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

test('should pass a timeout signal to every request', async () => {
  await osm.gather(config);
  expect(fetch).toHaveBeenCalled();
  for (const [, options] of fetch.mock.calls) {
    expect(options.signal).toBeInstanceOf(AbortSignal);
  }
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

test('should request next page with ISO date', async () => {
  await osm.gather(config);

  const secondUrl = fetch.mock.calls[1][0];
  expect(secondUrl).toContain(',2024-12-29T12:53:42.000Z');
});

test('should not skip changesets created in the same second across pages', async () => {
  const overlappingPage = `
    <osm version="0.6">
      <changeset id="100" created_at="2024-12-29T12:53:41Z"></changeset>
      <changeset id="101" created_at="2024-12-29T12:53:41Z"></changeset>
      <changeset id="102" created_at="2024-12-29T12:53:40Z"></changeset>
    </osm>
  `;
  fetch.mockReset();
  fetch
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(firstPage),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(overlappingPage),
    });

  const contributions = await osm.gather(config);

  expect(contributions.length).toBe(102);
  expect(contributions.slice(-2).map((c) => c.link)).toStrictEqual([
    'https://www.openstreetmap.org/changeset/101',
    'https://www.openstreetmap.org/changeset/102',
  ]);
});

test('should move past a second with more than a full page of changesets', async () => {
  const olderPage = `
    <osm version="0.6">
      <changeset id="200" created_at="2024-12-29T12:53:40Z"></changeset>
    </osm>
  `;
  fetch.mockReset();
  fetch
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(firstPage),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(firstPage),
    })
    .mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue(olderPage),
    });

  const contributions = await osm.gather(config);

  expect(contributions.length).toBe(101);
  expect(fetch.mock.calls[2][0]).toContain(',2024-12-29T12:53:40.999Z');
});

test('should handle user without changesets', async () => {
  const emptyPage = '<osm version="0.6"></osm>';
  fetch.mockReset();
  fetch.mockResolvedValueOnce({
    ok: true,
    text: vi.fn().mockResolvedValue(emptyPage),
  });

  const contributions = await osm.gather(config);

  expect(contributions).toStrictEqual([]);
});

test('should handle changesets without comment', async () => {
  const page = `
    <osm version="0.6">
      <changeset id="1" created_at="2024-12-29T12:53:41Z">
        <tag k="host" v="https://www.openstreetmap.org/edit"/>
      </changeset>
      <changeset id="2" created_at="2024-12-29T12:53:41Z"></changeset>
    </osm>
  `;
  fetch.mockReset();
  fetch.mockResolvedValueOnce({
    ok: true,
    text: vi.fn().mockResolvedValue(page),
  });

  const contributions = await osm.gather(config);

  expect(contributions.map((c) => c.description)).toStrictEqual([
    'Changeset 1',
    'Changeset 2',
  ]);
});

test('should throw if a request fails', async () => {
  fetch.mockReset();
  fetch.mockResolvedValueOnce({ ok: false, status: 429 });

  await expect(osm.gather(config)).rejects.toThrow('failed with status 429');
});

test('should encode display name in URL', async () => {
  const specialConfig = {
    osm: {
      ...config.osm,
      displayName: 'Jane Doe&co',
    },
  };

  await osm.gather(specialConfig);

  expect(fetch.mock.calls[0][0]).toContain('display_name=Jane%20Doe%26co&');
});

test('should skip changesets created before stopDate', async () => {
  const page = `
    <osm version="0.6">
      <changeset id="1" created_at="2021-11-02T00:00:00Z" closed_at="2021-11-02T01:00:00Z"></changeset>
      <changeset id="2" created_at="2021-11-01T00:00:00Z" closed_at="2021-11-01T01:00:00Z"></changeset>
      <changeset id="3" created_at="2021-10-31T23:00:00Z" closed_at="2021-11-01T00:30:00Z"></changeset>
    </osm>
  `;
  fetch.mockReset();
  fetch.mockResolvedValueOnce({
    ok: true,
    text: vi.fn().mockResolvedValue(page),
  });

  const contributions = await osm.gather(config);

  expect(contributions.map((c) => c.link)).toStrictEqual([
    'https://www.openstreetmap.org/changeset/1',
    'https://www.openstreetmap.org/changeset/2',
  ]);
});

test('should stop paging once changesets are older than stopDate', async () => {
  const fullPage = `
    <osm version="0.6">
      ${Array.from(
        { length: 100 },
        (_, i) =>
          `<changeset id="${i + 1}" created_at="${i < 99 ? '2021-11-02T00:00:00Z' : '2021-10-31T00:00:00Z'}"></changeset>`
      ).join('')}
    </osm>
  `;
  fetch.mockReset();
  fetch.mockResolvedValueOnce({
    ok: true,
    text: vi.fn().mockResolvedValue(fullPage),
  });

  const contributions = await osm.gather(config);

  expect(contributions.length).toBe(99);
  expect(fetch).toHaveBeenCalledTimes(1);
});
