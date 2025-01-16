import axios from 'axios';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { gather, validate } from './bugzilla.js';

const config = {
  bugzilla: {
    enabled: true,
    baseUrl: 'https://bugzilla.mozilla.org',
    username: 'user',
    stopDate: new Date('2021-11-01'),
  },
};

beforeEach(() => {
  const firstBugsPage = {
    bugs: new Array(500).fill(0).map(() => ({
      created_at: new Date('2022-04-13'),
      summary: 'Summary',
      // This would be the bug ID which would be different, but enough for testing purposes
      id: 1,
    })),
  };

  const secondBugsPage = {
    bugs: [
      {
        created_at: new Date('2022-04-13'),
        summary: 'SecondSummary',
        id: 1,
      },
    ],
  };

  const comments = {
    bugs: {
      // This would be the bug ID which would be different, but enough for testing purposes
      1: {
        comments: [
          {
            creation_time: new Date('2022-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 0,
          },
          {
            creation_time: new Date('2022-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 1,
          },
          {
            creation_time: new Date('2022-04-13'),
            creator: 'WILL_BE_FILTERED_OUT',
            bug_id: 1,
            count: 2,
          },
        ],
      },
    },
  };

  vi.spyOn(axios, 'request')
    .mockResolvedValueOnce({ data: firstBugsPage })
    .mockResolvedValueOnce({ data: secondBugsPage })
    .mockResolvedValue({ data: comments });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('should validate config - undefined', () => {
  expect(() => validate(undefined)).not.toThrow();
});

test('should validate config - missing completely', () => {
  const emptyConfig = {};
  expect(() => validate(emptyConfig)).not.toThrow();
});

test('should validate config - missing baseUrl', () => {
  const failConfig = {
    enabled: true,
    username: 'A',
    stopDate: new Date(),
  };

  expect(() => validate(failConfig)).toThrow();
});

test('should validate config - missing username', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    stopDate: new Date(),
  };

  expect(() => validate(failConfig)).toThrow();
});

test('should validate config - missing stopDate', () => {
  const failConfig = {
    enabled: true,
    baseUrl: 'A',
    username: 'user',
  };

  expect(() => validate(failConfig)).toThrow();
});

test('should fetch', async () => {
  const contributions = await gather(config);
  expect(contributions.length).toBe((500 + 1) * 2);
});

test('should not fetch if disabled - by enable property', async () => {
  const specificTypeConfig = {
    bugzilla: {
      ...config.bugzilla,
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

test('should format', async () => {
  const contributions = await gather(config);

  expect(contributions[0]).toStrictEqual({
    createdAt: new Date('2022-04-13'),
    description: 'SecondSummary',
    link: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1#c0',
    type: 'Created a Bug Report',
    source: 'bugzilla-created',
  });
  expect(contributions[1]).toStrictEqual({
    createdAt: new Date('2022-04-13'),
    description: 'SecondSummary',
    link: 'https://bugzilla.mozilla.org/show_bug.cgi?id=1#c1',
    type: 'Commented on a Bug Report',
    source: 'bugzilla-comments',
  });
});

test('should format with custom types', async () => {
  const specificTypeConfig = {
    bugzilla: {
      ...config.bugzilla,
      types: {
        createdType: 'CREATED!',
        commentedType: 'COMMENTED!',
      },
    },
  };

  const contributions = await gather(specificTypeConfig);

  expect(contributions[0].type).toBe(
    specificTypeConfig.bugzilla.types.createdType
  );
  expect(contributions[1].type).toBe(
    specificTypeConfig.bugzilla.types.commentedType
  );
});

test('should ignore comments older than stopDate', async () => {
  const bugsPage = {
    bugs: [
      {
        created_at: new Date('2022-04-13'),
        summary: 'Summary',
        id: 1,
      },
    ],
  };

  const oldComments = {
    bugs: {
      1: {
        comments: [
          {
            creation_time: new Date('1999-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 0,
          },
          {
            creation_time: new Date('1999-04-13'),
            creator: 'user',
            bug_id: 1,
            count: 1,
          },
        ],
      },
    },
  };

  vi.spyOn(axios, 'request')
    .mockResolvedValueOnce({ data: bugsPage })
    .mockResolvedValueOnce({ data: oldComments });

  const contributions = await gather(config);
  expect(contributions.length).toBe(0);
});
