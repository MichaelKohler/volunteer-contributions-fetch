import test from 'ava';
import sinon from 'sinon';

import * as fetcher from './github-fetcher.js';
import { gather, validate } from './github.js';

const config = {
  github: {
    enabled: true,
    username: 'user',
    stopDate: new Date('2022-01-01'),
    filter: '',
    delayMsPerRequest: 0,
  },
};

test.beforeEach((t) => {
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox = sinon.createSandbox();
  // eslint-disable-next-line no-param-reassign
  t.context.sandbox.clock = sinon.useFakeTimers({
    now: new Date('2022-03-02'),
    shouldAdvanceTime: true,
  });

  t.context.sandbox.stub(fetcher, 'searchCommits');
  t.context.sandbox.stub(fetcher, 'searchIssues');
  t.context.sandbox.stub(fetcher, 'listReviews');
  t.context.sandbox.stub(fetcher, 'listComments');
  t.context.sandbox.stub(fetcher, 'throwIfTokenHasPrivateRepoScope');
});

test.afterEach.always((t) => {
  t.context.sandbox.clock.restore();
  t.context.sandbox.restore();
});

test.serial('should validate config - missing completely', (t) => {
  const emptyConfig = {};
  t.notThrows(() => validate(emptyConfig));
});

test.serial('should validate config - missing filter', (t) => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: new Date('2022-01-01'),
  };

  t.throws(() => validate(failConfig));
});

test.serial('should validate config - missing username', (t) => {
  const failConfig = {
    enabled: true,
    stopDate: new Date('2022-01-01'),
    filter: '',
  };

  t.throws(() => validate(failConfig));
});

test.serial('should validate config - missing stopDate', (t) => {
  const failConfig = {
    enabled: true,
    username: 'user',
    filter: '',
  };

  t.throws(() => validate(failConfig));
});

test.serial('should not fetch if disabled - by enable property', async (t) => {
  const specificTypeConfig = {
    github: {
      ...config.github,
      enabled: false,
    },
  };

  const contributions = await gather(specificTypeConfig);

  t.is(contributions.length, 0);
});

test.serial(
  'should not fetch if disabled - by leaving off config value',
  async (t) => {
    const contributions = await gather({});

    t.is(contributions.length, 0);
  }
);

test.serial(
  'should throw if private repo scope token is used and config does not allow private repo access',
  async (t) => {
    fetcher.throwIfTokenHasPrivateRepoScope.rejects(new Error('PRIVATE_SCOPE'));

    await t.throwsAsync(() => gather(config));
  }
);

test.serial(
  'should not throw if private repo scope token is used but config does allow private repo access',
  async (t) => {
    fetcher.throwIfTokenHasPrivateRepoScope.rejects(new Error('PRIVATE_SCOPE'));
    const allowedPrivateConfig = {
      github: {
        ...config.github,
        allowPrivate: true,
      },
    };

    t.notThrows(() => gather(allowedPrivateConfig));
  }
);

test.serial(
  'should throw if error is not specifically private scope error',
  async (t) => {
    fetcher.throwIfTokenHasPrivateRepoScope.rejects(
      new Error('SOMETHING_ELSE')
    );

    await t.throwsAsync(() => gather(config));
  }
);

test.serial('should fetch commits until stop date', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  fetcher.searchCommits.resolves([]);
  fetcher.searchCommits
    .onCall(0)
    .resolves(
      new Array(100).fill(0).map(() => ({ createdAt: new Date('2022-03-01') }))
    );
  fetcher.searchCommits
    .onCall(1)
    .resolves(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-02-01') }))
    );
  fetcher.searchCommits
    .onCall(2)
    .resolves(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-01-01') }))
    );

  await gather(commitConfig);
  t.deepEqual(fetcher.searchCommits.getCall(0).args[0], {
    q: `author:${config.github.username}+author-date:2022-03-01..2022-03-31`,
    sort: 'committer-date',
    page: 1,
  });
  t.deepEqual(fetcher.searchCommits.getCall(1).args[0], {
    q: `author:${config.github.username}+author-date:2022-03-01..2022-03-31`,
    sort: 'committer-date',
    page: 2,
  });
  t.deepEqual(fetcher.searchCommits.getCall(2).args[0], {
    q: `author:${config.github.username}+author-date:2022-02-01..2022-02-28`,
    sort: 'committer-date',
    page: 1,
  });
  t.deepEqual(fetcher.searchCommits.getCall(3).args[0], {
    q: `author:${config.github.username}+author-date:2022-01-01..2022-01-31`,
    sort: 'committer-date',
    page: 1,
  });
});

test.serial('should not fetch commits if disabled', async (t) => {
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
  t.is(fetcher.searchCommits.callCount, 0);
});

test.serial('should format commits', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.onCall(0).resolves([
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
  t.is(result.length, 1);
  t.deepEqual(result[0], {
    createdAt: new Date('2022-03-02'),
    description: 'contribution-test/foo: Test Commit Message',
    link: 'https://github.com/contribution-test/foo',
    source: 'github-commit',
    type: 'GitHub Commit',
  });
});

test.serial('should format commits with custom type', async (t) => {
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

  fetcher.searchCommits.onCall(0).resolves([
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
  t.is(result.length, 1);
  t.deepEqual(result[0].type, commitConfig.github.types.commit);
});

test.serial('should format private commit', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.onCall(0).resolves([
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
  t.is(result.length, 1);
  t.deepEqual(result[0].description, 'Commit in private repository');
});

test.serial('should ignore commits from before the stopDate', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.onCall(0).resolves([
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
  t.is(result.length, 0);
});

test.serial('should ignore commits not matching filter', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchCommits.onCall(0).resolves([
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
  t.is(result.length, 0);
});

test.serial('should fetch issues until stop date', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  fetcher.searchIssues.resolves([]);
  fetcher.searchIssues
    .onCall(0)
    .resolves(
      new Array(100).fill(0).map(() => ({ createdAt: new Date('2022-03-01') }))
    );
  fetcher.searchIssues
    .onCall(1)
    .resolves(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-02-01') }))
    );
  fetcher.searchIssues
    .onCall(2)
    .resolves(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-01-01') }))
    );

  await gather(commitConfig);
  t.deepEqual(fetcher.searchIssues.getCall(0).args[0], {
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(1).args[0], {
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 2,
  });
  t.deepEqual(fetcher.searchIssues.getCall(2).args[0], {
    q: `author:${config.github.username}+created:2022-02-01..2022-02-28+is:issue`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(3).args[0], {
    q: `author:${config.github.username}+created:2022-01-01..2022-01-31+is:issue`,
    sort: 'created',
    page: 1,
  });
});

test.serial('should not fetch issues if disabled', async (t) => {
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
  t.is(fetcher.searchCommits.callCount, 0);
});

test.serial('should format issues', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
    {
      html_url: 'https://github.com/contribution-test/foo',
      created_at: new Date('2022-03-02'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);
  t.is(result.length, 1);
  t.deepEqual(result[0], {
    createdAt: new Date('2022-03-02'),
    description: 'IssueA',
    link: 'https://github.com/contribution-test/foo',
    source: 'github-issues-created',
    type: 'Created Issue Report',
  });
});

test.serial('should format issues with custom type', async (t) => {
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

  fetcher.searchIssues.onCall(0).resolves([
    {
      html_url: 'https://github.com/contribution-test/foo',
      created_at: new Date('2022-03-02'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);
  t.is(result.length, 1);
  t.deepEqual(result[0].type, commitConfig.github.types.createdIssue);
});

test.serial('should format issues (PR)', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
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
  t.is(result.length, 1);
  t.deepEqual(result[0], {
    createdAt: new Date('2022-03-02'),
    description: 'PR',
    link: 'https://github.com/contribution-test/foo',
    source: 'github-pr-created',
    type: 'Created PR',
  });
});

test.serial('should format issues (PR) with custom type', async (t) => {
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

  fetcher.searchIssues.onCall(0).resolves([
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
  t.is(result.length, 1);
  t.deepEqual(result[0].type, commitConfig.github.types.createdPR);
});

test.serial('should ignore issues from before the stopDate', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
    {
      html_url: 'https://github.com/contribution-test/foo',
      // Old issue
      created_at: new Date('1999-01-01'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);
  t.is(result.length, 0);
});

test.serial('should ignore issues not matching filter', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
    {
      html_url: 'https://github.com/not-going-to-match-filter/foo',
      created_at: new Date('2022-03-02'),
      title: 'IssueA',
    },
  ]);

  const result = await gather(commitConfig);
  t.is(result.length, 0);
});

test.serial('should fetch PRs until stop date', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      reviewsEnabled: false,
    },
  };

  fetcher.searchIssues.resolves([]);
  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  // Therefore PRs start with 3 as before it searches for issues
  fetcher.searchIssues
    .onCall(3)
    .resolves(
      new Array(100).fill(0).map(() => ({ createdAt: new Date('2022-03-01') }))
    );
  fetcher.searchIssues
    .onCall(4)
    .resolves(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-02-01') }))
    );
  fetcher.searchIssues
    .onCall(5)
    .resolves(
      new Array(5).fill(0).map(() => ({ createdAt: new Date('2022-01-01') }))
    );

  await gather(commitConfig);
  t.deepEqual(fetcher.searchIssues.getCall(3).args[0], {
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(4).args[0], {
    q: `author:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 2,
  });
  t.deepEqual(fetcher.searchIssues.getCall(5).args[0], {
    q: `author:${config.github.username}+created:2022-02-01..2022-02-28+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(6).args[0], {
    q: `author:${config.github.username}+created:2022-01-01..2022-01-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });
});

test.serial('should not fetch PRs if disabled', async (t) => {
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
  t.is(fetcher.searchCommits.callCount, 0);
});

test.serial('should fetch reviews until stop date', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      commitsEnabled: false,
      issuesEnabled: false,
    },
  };

  // We want to fetch 2 pages for the first period, and one page for the subsequent periods.
  // We expect 3 periods to be queried based on the passed stopDate and the faked clock.
  fetcher.searchIssues.resolves([]);
  fetcher.searchIssues.onCall(0).resolves(
    new Array(100).fill(0).map(() => ({
      createdAt: new Date('2022-03-01'),
      repository_url: 'https://api.github.com/repos/contributions-test/foo',
      number: 1111, // This would be dynamic, but fine enough for this test
      pull_request: {
        url: 'https://github.com/contributions-test/foo/pulls/1',
      },
    }))
  );
  fetcher.searchIssues.onCall(1).resolves(
    new Array(5).fill(0).map(() => ({
      createdAt: new Date('2022-02-01'),
      repository_url: 'https://api.github.com/repos/contributions-test/foo',
      number: 1111,
      pull_request: {
        url: 'https://github.com/contributions-test/foo/pulls/1',
      },
    }))
  );
  fetcher.searchIssues.onCall(2).resolves(
    new Array(5).fill(0).map(() => ({
      createdAt: new Date('2022-01-01'),
      repository_url: 'https://api.github.com/repos/contributions-test/foo',
      number: 1111,
      pull_request: {
        url: 'https://github.com/contributions-test/foo/pulls/1',
      },
    }))
  );

  fetcher.listReviews.resolves([]);
  fetcher.listReviews.onCall(0).resolves([
    {
      createdAt: new Date('2022-03-01'),
      user: {
        login: commitConfig.github.username,
      },
    },
  ]);

  await gather(commitConfig);
  t.deepEqual(fetcher.searchIssues.getCall(0).args[0], {
    q: `reviewed-by:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(1).args[0], {
    q: `reviewed-by:${config.github.username}+created:2022-03-01..2022-03-31+is:pull-request`,
    sort: 'created',
    page: 2,
  });
  t.deepEqual(fetcher.searchIssues.getCall(2).args[0], {
    q: `reviewed-by:${config.github.username}+created:2022-02-01..2022-02-28+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(3).args[0], {
    q: `reviewed-by:${config.github.username}+created:2022-01-01..2022-01-31+is:pull-request`,
    sort: 'created',
    page: 1,
  });
  t.is(fetcher.listReviews.callCount, 110);
  t.deepEqual(fetcher.listReviews.getCall(0).args[0], {
    owner: 'contributions-test',
    repo: 'foo',
    pull_number: 1111,
  });
});

test.serial('should not fetch reviews if disabled', async (t) => {
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
  t.is(fetcher.searchCommits.callCount, 0);
});

test.serial('should format reviews', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
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

  fetcher.listReviews.onCall(0).resolves([
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
  t.is(result.length, 3);
  t.deepEqual(result[0], {
    createdAt: new Date('2022-03-02'),
    description: 'Some PR',
    link: 'https://github.com/contribution-test/foo/pulls/1',
    source: 'github-reviews',
    type: 'Requested changes on a Pull Request',
  });
  t.deepEqual(result[1], {
    createdAt: new Date('2022-03-02'),
    description: 'Some PR',
    link: 'https://github.com/contribution-test/foo/pulls/1',
    source: 'github-reviews',
    type: 'Commented on a Pull Request',
  });
  t.deepEqual(result[2], {
    createdAt: new Date('2022-03-02'),
    description: 'Some PR',
    link: 'https://github.com/contribution-test/foo/pulls/1',
    source: 'github-reviews',
    type: 'Approved a Pull Request',
  });
});

test.serial('should custom format reviews', async (t) => {
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

  fetcher.searchIssues.onCall(0).resolves([
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

  fetcher.listReviews.onCall(0).resolves([
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
  t.is(result.length, 3);
  t.deepEqual(result[0].type, 'CHANGE!');
  t.deepEqual(result[1].type, 'COMMENT!');
  t.deepEqual(result[2].type, 'APPROVE!');
});

test.serial('should ignore reviews from before the stopDate', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
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

  fetcher.listReviews.onCall(0).resolves([
    {
      submitted_at: new Date('1999-01-01'),
      pull_request_url: 'https://github.com/contributions-test/foo/pulls/1',
      html_url: 'https://github.com/contribution-test/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
    },
  ]);

  const result = await gather(commitConfig);
  t.is(result.length, 0);
});

test.serial('should ignore reviews not matching filter', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-03-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
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

  fetcher.listReviews.onCall(0).resolves([
    {
      submitted_at: new Date('2022-03-01'),
      pull_request_url: 'https://github.com/not-matching-filter/foo/pulls/1',
      html_url: 'https://github.com/not-matching-filter/foo/pulls/1',
      state: 'CHANGES_REQUESTED',
    },
  ]);

  const result = await gather(commitConfig);
  t.is(result.length, 0);
});

test.serial('should ignore reviews not by user', async (t) => {
  const commitConfig = {
    github: {
      ...config.github,
      issuesEnabled: false,
      commitsEnabled: false,
      filter: 'contribution-test',
      stopDate: new Date('2022-01-01'),
    },
  };

  fetcher.searchIssues.onCall(0).resolves([
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

  fetcher.listReviews.onCall(0).resolves([
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
  t.is(result.length, 1);
});

test.serial('should fetch comments until stop date', async (t) => {
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
  fetcher.searchIssues.resolves([]);
  fetcher.searchIssues.onCall(0).resolves(
    new Array(100).fill(0).map(() => ({
      createdAt: new Date('2022-03-01'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      number: 1111, // This would be dynamic, but fine enough for this test
      title: 'IssueTitle',
    }))
  );
  fetcher.searchIssues.onCall(1).resolves(
    new Array(5).fill(0).map(() => ({
      createdAt: new Date('2022-02-01'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      number: 1111,
      title: 'IssueTitle',
    }))
  );
  fetcher.searchIssues.onCall(2).resolves(
    new Array(5).fill(0).map(() => ({
      createdAt: new Date('2022-01-01'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      number: 1111,
      title: 'IssueTitle',
    }))
  );

  fetcher.listComments.resolves([]);
  fetcher.listComments.onCall(0).resolves([
    {
      createdAt: new Date('2022-03-01'),
      user: {
        login: config.github.username,
      },
    },
  ]);

  await gather(commitConfig);
  t.deepEqual(fetcher.searchIssues.getCall(0).args[0], {
    q: `commenter:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(1).args[0], {
    q: `commenter:${config.github.username}+created:2022-03-01..2022-03-31+is:issue`,
    sort: 'created',
    page: 2,
  });
  t.deepEqual(fetcher.searchIssues.getCall(2).args[0], {
    q: `commenter:${config.github.username}+created:2022-02-01..2022-02-28+is:issue`,
    sort: 'created',
    page: 1,
  });
  t.deepEqual(fetcher.searchIssues.getCall(3).args[0], {
    q: `commenter:${config.github.username}+created:2022-01-01..2022-01-31+is:issue`,
    sort: 'created',
    page: 1,
  });
  t.is(fetcher.listComments.callCount, 110);
  t.deepEqual(fetcher.listComments.getCall(0).args[0], {
    owner: 'contribution-test',
    repo: 'foo',
    issue_number: 1111,
  });
});

test.serial('should not fetch comments if disabled', async (t) => {
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
  t.is(fetcher.searchIssues.callCount, 0);
});

test.serial('should format comments', async (t) => {
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

  fetcher.searchIssues.onCall(0).resolves([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      url: 'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
  ]);

  fetcher.listComments.onCall(0).resolves([
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
  t.is(result.length, 1);
  t.deepEqual(result[0], {
    createdAt: new Date('2022-03-02'),
    description: 'Some Issue',
    link: 'https://github.com/contribution-test/foo/issues/1111',
    source: 'github-comments',
    type: 'Commented on an Issue',
  });
});

test.serial('should custom format comments', async (t) => {
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

  fetcher.searchIssues.onCall(0).resolves([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      url: 'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
  ]);

  fetcher.listComments.onCall(0).resolves([
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
  t.is(result.length, 1);
  t.deepEqual(result[0].type, 'COMMENTED!');
});

test.serial('should ignore comments from before stopDate', async (t) => {
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

  fetcher.searchIssues.onCall(0).resolves([
    {
      createdAt: new Date('2022-03-02'),
      repository_url: 'https://api.github.com/repos/contribution-test/foo',
      url: 'https://api.github.com/repos/contribution-test/foo/issues/1111',
      html_url: 'https://github.com/contribution-test/foo/issues/1111',
      title: 'Some Issue',
      number: 1111,
    },
  ]);

  fetcher.listComments.onCall(0).resolves([
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
  t.is(result.length, 0);
});

test.serial('should ignore comments not matching filter', async (t) => {
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

  fetcher.searchIssues.onCall(0).resolves([
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
  fetcher.listComments.onCall(0).resolves([
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
  t.is(result.length, 0);
  // Details should only have been fetched for one issue as the other one is
  // not matching the filter..
  t.is(fetcher.listComments.callCount, 1);
});
