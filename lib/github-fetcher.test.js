import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { listComments, listReviews } from './github-fetcher.js';

function jsonResponse(body, link) {
  const headers = { 'content-type': 'application/json' };
  if (link) {
    headers.link = link;
  }

  return new Response(JSON.stringify(body), { status: 200, headers });
}

function mockTwoPages(path) {
  const base = `https://api.github.com/repos/owner/repo/${path}`;
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes('page=2')) {
      return jsonResponse([{ id: 3 }]);
    }

    return jsonResponse(
      [{ id: 1 }, { id: 2 }],
      `<${base}?per_page=100&page=2>; rel="next", <${base}?per_page=100&page=2>; rel="last"`
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv('GITHUB_TOKEN', 'token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('listReviews follows pagination', async () => {
  const fetchMock = mockTwoPages('pulls/1/reviews');

  const reviews = await listReviews({
    owner: 'owner',
    repo: 'repo',
    pull_number: 1,
  });

  expect(reviews).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[0][0])).toContain('per_page=100');
});

test('listComments follows pagination', async () => {
  const fetchMock = mockTwoPages('issues/1/comments');

  const comments = await listComments({
    owner: 'owner',
    repo: 'repo',
    issue_number: 1,
  });

  expect(comments).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[0][0])).toContain('per_page=100');
});
