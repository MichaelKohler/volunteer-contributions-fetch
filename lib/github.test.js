import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as fetcher from './github-fetcher.js';
import { gather, githubSchema } from './github.js';

const config = {
  github: {
    enabled: true,
    username: 'user',
    stopDate: '2022-01-01',
    filter: '',
    delayMsPerRequest: 0,
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2022-03-02'));

  vi.mock('./github-fetcher.js', async () => {
    return {
      PRIVATE_SCOPE_ERROR: 'PRIVATE_SCOPE',
      RESULTS_PER_PAGE: 100,
      searchCommits: vi.fn().mockResolvedValue([]),
      searchIssues: vi.fn().mockResolvedValue([]),
      listReviews: vi.fn().mockResolvedValue([]),
      listComments: vi.fn().mockResolvedValue([]),
      throwIfTokenHasPrivateRepoScope: vi.fn(),
    };
  });

  vi.stubEnv('GITHUB_TOKEN', 'some_test_token');
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('should validate valid config', () => {
  const result = githubSchema.parse(config.github);
  expect(result).toBeDefined();
});

test('should validate config - missing completely', () => {
  const emptyConfig = {};
  expect(() => githubSchema.parse(emptyConfig)).toThrow();
});

test('should validate config - missing filter', () => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: new Date('2022-01-01'),
  };

  expect(() => githubSchema.parse(failConfig)).toThrow();
});

test('should validate config - missing username', () => {
  const failConfig = {
    enabled: true,
    stopDate: new Date('2022-01-01'),
    filter: '',
  };

  expect(() => githubSchema.parse(failConfig)).toThrow();
});

test('should validate config - missing stopDate', () => {
  const failConfig = {
    enabled: true,
    username: 'user',
    filter: '',
  };

  expect(() => githubSchema.parse(failConfig)).toThrow();
});

test('should not fetch if disabled - by enable property', async () => {
  const specificTypeConfig = {
    github: {
      ...config.github,
      enabled: false,
    },
  };

  const contributions = await gather(specificTypeConfig);

  expect(contributions.length).toBe(0);
});

test('should not fetch if disabled - by leaving off config value', async () => {
  const contributions = await gather({});

  expect(contributions.length).toBe(0);
});

test('should throw if private repo scope token is used and config does not allow private repo access', async () => {
  fetcher.throwIfTokenHasPrivateRepoScope.mockImplementation(() => {
    throw new Error('PRIVATE_SCOPE');
  });

  await expect(() => gather(config)).rejects.toThrow();
});

test('should not throw if private repo scope token is used but config does allow private repo access', async () => {
  fetcher.throwIfTokenHasPrivateRepoScope.mockImplementation(() => {
    throw new Error('PRIVATE_SCOPE');
  });

  const allowedPrivateConfig = {
    github: {
      ...config.github,
      allowPrivate: true,
    },
  };

  expect(() => gather(allowedPrivateConfig)).not.toThrow();
});

test('should throw if error is not specifically private scope error', async () => {
  fetcher.throwIfTokenHasPrivateRepoScope.mockImplementation(() => {
    throw new Error('SOMETHING_ELSE');
  });

  await expect(() => gather(config)).rejects.toThrow();
});

test('should fetch commits until stop date', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  fetcher.searchCommits
    .mockResolvedValueOnce(
      new Array(100).fill(0).map(() => ({ createdAt: new Date('2022-03-01') }))
    )
    .mockResolvedValueOnce(
      new Array(1).fill(0).map(() => ({ createdAt: new Date('2023-03-01') }))
    )
    .mockResolvedValueOnce(
      new Array(99).fill(0).map(() => ({ createdAt: new Date('2022-02-01') }))
    )
    .mockResolvedValueOnce(
      new Array(99).fill(0).map(() => ({ createdAt: new Date('2022-01-01') }))
    );

  await gather(commitConfig);

  expect(fetcher.searchCommits.mock.calls[0][0]).toStrictEqual({
    q: `author:${config.github.username}+author-date:2022-03-01..2022-03-31`,
    sort: 'committer-date',
    page: 1,
  });
  expect(fetcher.searchCommits.mock.calls[1][0]).toStrictEqual({
    q: `author:${config.github.username}+author-date:2022-03-01..2022-03-31`,
    sort: 'committer-date',
    page: 2,
  });
  expect(fetcher.searchCommits.mock.calls[2][0]).toStrictEqual({
    q: `author:${config.github.username}+author-date:2022-02-01..2022-02-28`,
    sort: 'committer-date',
    page: 1,
  });
  expect(fetcher.searchCommits.mock.calls[3][0]).toStrictEqual({
    q: `author:${config.github.username}+author-date:2022-01-01..2022-01-31`,
    sort: 'committer-date',
    page: 1,
  });
});

test('should not fetch commits if disabled', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  await gather(commitConfig);
  expect(fetcher.searchCommits).not.toHaveBeenCalled();
});

test('should format commits', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      commit: {
        author: {
          date: new Date('2022-03-02'),
        },
        message: 'Test Commit Message',
      },
      repository: {
        private: false,
        name: 'foo',
        owner: {
          login: 'contribution-test',
        },
      },
    },
  ]);

  const result = await gather(commitConfig);
  expect(result.length).toBe(1);
  expect(result[0]).toStrictEqual({
    createdAt: new Date('2022-03-02'),
    description: 'contribution-test/foo: Test Commit Message',
    link: 'https://github.com/contribution-test/foo',
    source: 'github-commit',
    type: 'GitHub Commit',
  });
});

test('should format commits with custom type', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
      types: {
        commit: 'COMMIT!',
      },
    },
  };

  fetcher.searchCommits.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      commit: {
        author: {
          date: new Date('2022-03-02'),
        },
        message: 'Test Commit Message',
      },
      repository: {
        private: false,
        name: 'foo',
        owner: {
          login: 'contribution-test',
        },
      },
    },
  ]);

  const result = await gather(commitConfig);
  expect(result.length).toBe(1);
  expect(result[0].type).toBe(commitConfig.github.types.commit);
});

test('should format private commit', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      commit: {
        author: {
          date: new Date('2022-03-02'),
        },
        message: 'Test Commit Message',
      },
      repository: {
        private: true,
        name: 'foo',
        owner: {
          login: 'contribution-test',
        },
      },
    },
  ]);

  const result = await gather(commitConfig);
  expect(result.length).toBe(1);
  expect(result[0].description).toBe('Commit in private repository');
});

test('should ignore commits from before the stopDate', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      commit: {
        author: {
          // Old commit
          date: new Date('1999-03-02'),
        },
        message: 'Test Commit Message',
      },
      repository: {
        private: false,
        name: 'foo',
        owner: {
          login: 'contribution-test',
        },
      },
    },
  ]);

  const result = await gather(commitConfig);
  expect(result.length).toBe(0);
});

test('should ignore commits not matching filter', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/not-going-to-match-filter/foo',
      commit: {
        author: {
          date: new Date('2022-03-02'),
        },
        message: 'Test Commit Message',
      },
      repository: {
        private: false,
        name: 'foo',
        owner: {
          login: 'contribution-test',
        },
      },
    },
  ]);

  const result = await gather(commitConfig);
  expect(result.length).toBe(0);
});

test('should fetch issues until stop date', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  fetcher.searchIssues
    .mockResolvedValueOnce(
      new Array(100).fill(0).map(() => ({ createdAt: new Date('2022-03-01') }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-02-01') }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-01-01') }))
    );

  await gather(commitConfig);

  expect(fetcher.searchIssues.mock.calls[0][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[1][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 2,
  });
  expect(fetcher.searchIssues.mock.calls[2][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-02-01..2022-02-28+is:issue`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[3][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-01-01..2022-01-31+is:issue`,
    sort: 'created',
    page: 1,
  });
});

test('should not fetch issues if disabled', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  await gather(commitConfig);

  expect(fetcher.searchCommits).not.toHaveBeenCalled();
});

test('should format issues', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      created_at: new Date('2022-03-02'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(1);
  expect(result[0]).toStrictEqual({
    createdAt: new Date('2022-03-02'),
    description: 'IssueA',
    link: 'https://github.com/contribution-test/foo',
    source: 'github-issues-created',
    type: 'Created Issue Report',
  });
});

test('should format issues with custom type', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
      types: {
        createdIssue: 'ISSUE!',
      },
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      created_at: new Date('2022-03-02'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(1);
  expect(result[0].type).toBe(commitConfig.github.types.createdIssue);
});

test('should format issues (PR)', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      created_at: new Date('2022-03-02'),
      title: 'PR',
      pull_request: {
        url: 'https://api.github.com/some-pr-url',
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(1);
  expect(result[0]).toStrictEqual({
    createdAt: new Date('2022-03-02'),
    description: 'PR',
    link: 'https://github.com/contribution-test/foo',
    source: 'github-pr-created',
    type: 'Created PR',
  });
});

test('should format issues (PR) with custom type', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
      types: {
        createdPR: 'PR!',
      },
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      created_at: new Date('2022-03-02'),
      title: 'PR',
      pull_request: {
        url: 'https://api.github.com/some-pr-url',
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(1);
  expect(result[0].type).toBe(commitConfig.github.types.createdPR);
});

test('should ignore issues from before the stopDate', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/contribution-test/foo',
      // Old issue
      created_at: new Date('1999-01-01'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(0);
});

test('should ignore issues not matching filter', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      html_url: 'https://github.com/not-going-to-match-filter/foo',
      created_at: new Date('2022-03-02'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);
  expect(result.length).toBe(0);
});

test('should fetch PRs until stop date', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  // Therefore PRs start with 3 as before it searches for issues
  fetcher.searchIssues
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(
      new Array(100).fill(0).map(() => ({ createdAt: new Date('2022-03-01') }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-02-01') }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-01-01') }))
    );

  await gather(commitConfig);

  expect(fetcher.searchIssues.mock.calls[3][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[4][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 2,
  });
  expect(fetcher.searchIssues.mock.calls[5][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-02-01..2022-02-28+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[6][0]).toStrictEqual({
    q: `author:${config.github.username}+created:2022-01-01..2022-01-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });
});

test('should not fetch PRs if disabled', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  await gather(commitConfig);

  expect(fetcher.searchCommits).not.toHaveBeenCalled();
});

test('should fetch reviews until stop date', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  fetcher.searchIssues
    .mockResolvedValueOnce(
      new Array(100).fill(0).map(() => ({
        createdAt: new Date('2022-03-01'),
        repository_url: 'https://api.github.com/repos/contributions-test/foo',
        number: 1111, // This would be dynamic, but fine enough for this test
        pull_request: {
          url: 'https://github.com/contributions-test/foo/pulls/1',
        },
      }))
    )
    .mockResolvedValueOnce(
      new Array(1).fill(0).map(() => ({
        createdAt: new Date('2022-03-01'),
        repository_url: 'https://api.github.com/repos/contributions-test/foo',
        number: 1111, // This would be dynamic, but fine enough for this test
        pull_request: {
          url: 'https://github.com/contributions-test/foo/pulls/1',
        },
      }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({
        createdAt: new Date('2022-02-01'),
        repository_url: 'https://api.github.com/repos/contributions-test/foo',
        number: 1111,
        pull_request: {
          url: 'https://github.com/contributions-test/foo/pulls/1',
        },
      }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({
        createdAt: new Date('2022-01-01'),
        repository_url: 'https://api.github.com/repos/contributions-test/foo',
        number: 1111,
        pull_request: {
          url: 'https://github.com/contributions-test/foo/pulls/1',
        },
      }))
    );

  fetcher.listReviews.mockResolvedValue([
    {
      createdAt: new Date('2022-03-01'),
      user: {
        login: commitConfig.github.username,
      },
    },
  ]);

  await gather(commitConfig);

  expect(fetcher.searchIssues.mock.calls[0][0]).toStrictEqual({
    q: `reviewed-by:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[1][0]).toStrictEqual({
    q: `reviewed-by:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 2,
  });
  expect(fetcher.searchIssues.mock.calls[2][0]).toStrictEqual({
    q: `reviewed-by:${config.github.username}+created:2022-02-01..2022-02-28+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[3][0]).toStrictEqual({
    q: `reviewed-by:${config.github.username}+created:2022-01-01..2022-01-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });

  expect(fetcher.listReviews).toHaveBeenCalledTimes(111);
  expect(fetcher.listReviews.mock.calls[0][0]).toStrictEqual({
    owner: 'contributions-test',
    repo: 'foo',
    pull_number: 1111,
  });
});

test('should not fetch reviews if disabled', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  await gather(commitConfig);

  expect(fetcher.searchCommits).not.toHaveBeenCalled();
});

test('should format reviews', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      html_url: 'https://api.github.com/repos/contribution-test/foo',
      title: 'Some PR',
      number: 1111,
      pull_request: {
        url: 'https://github.com/contributions-test/foo/pulls/1',
      },
    },
  ]);

  fetcher.listReviews.mockResolvedValueOnce([
    {
      submitted_at: new Date('2022-03-02'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
      user: {
        login: commitConfig.github.username,
      },
    },
    {
      submitted_at: new Date('2022-03-02'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'COMMENTED',
      user: {
        login: commitConfig.github.username,
      },
    },
    {
      submitted_at: new Date('2022-03-02'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'APPROVED',
      user: {
        login: commitConfig.github.username,
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(3);
  expect(result[0]).toStrictEqual({
    createdAt: new Date('2022-03-02'),
    description: 'Some PR',
    link: 'https://github.com/contribution-test/foo/pulls/1',
    source: 'github-reviews',
    type: 'Requested changes on a Pull Request',
  });
  expect(result[1]).toStrictEqual({
    createdAt: new Date('2022-03-02'),
    description: 'Some PR',
    link: 'https://github.com/contribution-test/foo/pulls/1',
    source: 'github-reviews',
    type: 'Commented on a Pull Request',
  });
  expect(result[2]).toStrictEqual({
    createdAt: new Date('2022-03-02'),
    description: 'Some PR',
    link: 'https://github.com/contribution-test/foo/pulls/1',
    source: 'github-reviews',
    type: 'Approved a Pull Request',
  });
});

test('should custom format reviews', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
      types: {
        commentedPR: 'COMMENT!',
        changesRequestedPR: 'CHANGE!',
        approvedPR: 'APPROVE!',
      },
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      html_url: 'https://api.github.com/repos/contribution-test/foo',
      title: 'Some PR',
      number: 1111,
      pull_request: {
        url: 'https://github.com/contributions-test/foo/pulls/1',
      },
    },
  ]);

  fetcher.listReviews.mockResolvedValueOnce([
    {
      submitted_at: new Date('2022-03-02'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
      user: {
        login: commitConfig.github.username,
      },
    },
    {
      submitted_at: new Date('2022-03-02'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'COMMENTED',
      user: {
        login: commitConfig.github.username,
      },
    },
    {
      submitted_at: new Date('2022-03-02'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'APPROVED',
      user: {
        login: commitConfig.github.username,
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(3);
  expect(result[0].type).toBe('CHANGE!');
  expect(result[1].type).toBe('COMMENT!');
  expect(result[2].type).toBe('APPROVE!');
});

test('should ignore reviews from before the stopDate', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('1999-01-01'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      html_url: 'https://api.github.com/repos/contribution-test/foo',
      title: 'Some PR',
      number: 1111,
      pull_request: {
        url: 'https://github.com/contributions-test/foo/pulls/1',
      },
    },
  ]);

  fetcher.listReviews.mockResolvedValueOnce([
    {
      submitted_at: new Date('1999-01-01'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(0);
});

test('should ignore reviews not matching filter', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/not-matching-filter/foo',
      html_url: 'https://api.github.com/repos/not-matching-filter/foo',
      title: 'Some PR',
      number: 1111,
      pull_request: {
        url: 'https://github.com/not-matching-filter/foo/pulls/1',
      },
    },
  ]);

  fetcher.listReviews.mockResolvedValueOnce([
    {
      submitted_at: new Date('2022-03-01'),
      pull_request_url: 'https://github.com/not-matching-filter/foo/pulls/1',
      html_url: 'https://github.com/not-matching-filter/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(0);
});

test('should ignore reviews not by user', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-01-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      html_url: 'https://api.github.com/repos/contribution-test/foo',
      title: 'Some PR',
      number: 1111,
      pull_request: {
        url: 'https://github.com/contribution-test/foo/pulls/1',
      },
    },
  ]);

  fetcher.listReviews.mockResolvedValueOnce([
    {
      submitted_at: new Date('2022-03-01'),
      pull_request_url: 'https://github.com/contribution-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
      user: {
        login: 'not-the-right-user',
      },
    },
    {
      submitted_at: new Date('2022-03-01'),
      pull_request_url: 'https://github.com/contribution-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'COMMENTED',
      user: {
        login: 'not-the-right-user',
      },
    },
    {
      submitted_at: new Date('2022-03-01'),
      pull_request_url: 'https://github.com/contribution-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
      user: {
        login: commitConfig.github.username,
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(1);
});

test('should fetch comments until stop date', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
      reviewsEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  fetcher.searchIssues
    .mockResolvedValueOnce(
      new Array(100).fill(0).map(() => ({
        createdAt: new Date('2022-03-01'),
        repository_url: 'https://api.github.com/repos/contribution-test/foo',
        number: 1111, // This would be dynamic, but fine enough for this test
        title: 'IssueTitle',
      }))
    )
    .mockResolvedValueOnce(
      new Array(1).fill(0).map(() => ({
        createdAt: new Date('2022-03-01'),
        repository_url: 'https://api.github.com/repos/contribution-test/foo',
        number: 1111, // This would be dynamic, but fine enough for this test
        title: 'IssueTitle',
      }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({
        createdAt: new Date('2022-02-01'),
        repository_url: 'https://api.github.com/repos/contribution-test/foo',
        number: 1111,
        title: 'IssueTitle',
      }))
    )
    .mockResolvedValueOnce(
      new Array(5).fill(0).map(() => ({
        createdAt: new Date('2022-01-01'),
        repository_url: 'https://api.github.com/repos/contribution-test/foo',
        number: 1111,
        title: 'IssueTitle',
      }))
    );

  fetcher.listComments.mockResolvedValue([
    {
      createdAt: new Date('2022-03-01'),
      user: {
        login: config.github.username,
      },
    },
  ]);

  await gather(commitConfig);

  expect(fetcher.searchIssues.mock.calls[0][0]).toStrictEqual({
    q: `commenter:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[1][0]).toStrictEqual({
    q: `commenter:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 2,
  });
  expect(fetcher.searchIssues.mock.calls[2][0]).toStrictEqual({
    q: `commenter:${config.github.username}+created:2022-02-01..2022-02-28+is:issue`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.searchIssues.mock.calls[3][0]).toStrictEqual({
    q: `commenter:${config.github.username}+created:2022-01-01..2022-01-31+is:issue`,
    sort: 'created',
    page: 1,
  });
  expect(fetcher.listComments).toHaveBeenCalledTimes(111);
  expect(fetcher.listComments.mock.calls[0][0]).toStrictEqual({
    owner: 'contribution-test',
    repo: 'foo',
    issue_number: 1111,
  });
});

test('should not fetch comments if disabled', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
      reviewsEnabled: false,
      commentsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  await gather(commitConfig);

  expect(fetcher.searchIssues).not.toHaveBeenCalled();
});

test('should format comments', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      url: 'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
  ]);

  fetcher.listComments.mockResolvedValueOnce([
    {
      created_at: new Date('2022-03-02'),
      issue_url:
        'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      user: {
        login: config.github.username,
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(1);
  expect(result[0]).toStrictEqual({
    createdAt: new Date('2022-03-02'),
    description: 'Some Issue',
    link: 'https://github.com/contribution-test/foo/issues/1111',
    source: 'github-comments',
    type: 'Commented on an Issue',
  });
});

test('should custom format comments', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
      types: {
        commented: 'COMMENTED!',
      },
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      url: 'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
  ]);

  fetcher.listComments.mockResolvedValueOnce([
    {
      created_at: new Date('2022-03-02'),
      issue_url:
        'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      user: {
        login: config.github.username,
      },
    },
  ]);

  const result = await gather(commitConfig);
  expect(result.length).toBe(1);
  expect(result[0].type).toBe('COMMENTED!');
});

test('should ignore comments from before stopDate', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      url: 'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
  ]);

  fetcher.listComments.mockResolvedValueOnce([
    {
      created_at: new Date('1999-01-01'),
      issue_url:
        'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      user: {
        login: config.github.username,
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(0);
});

test('should ignore comments not matching filter', async () => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.mockResolvedValueOnce([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/not-matching-filter/foo',
      url: 'https://api.github.com/repos/not-matching-filter/foo/issues/1111',
      html_url: 'https://github.com/not-matching-filter/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      url: 'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
  ]);

  // While this is the first call, it will be the call for the second issue
  // as we filter out the first issue from above due to not matching,.
  fetcher.listComments.mockResolvedValueOnce([
    {
      created_at: new Date('2022-03-02'),
      issue_url:
        'https://api.github.com/repos/not-matching-filter/foo/issues/1111',
      html_url: 'https://github.com/not-matching-filter/foo/issues/1111',
      user: {
        login: config.github.username,
      },
    },
  ]);

  const result = await gather(commitConfig);

  expect(result.length).toBe(0);
  // Details should only have been fetched for one issue as the other one is
  // not matching the filter..
  expect(fetcher.listComments).toHaveBeenCalledOnce();
});
