// These fixtures are minified and do not reflect all real attributes.

export const firstPage = {
  batchcomplete: true,
  continue: {
    uccontinue: '20220101000000|1001',
    continue: '-||siteinfo',
  },
  query: {
    general: {
      server: '//wiki.mozilla.org',
      script: '/index.php',
    },
    usercontribs: [
      {
        userid: 1,
        user: 'User',
        pageid: 2,
        revid: 1002,
        parentid: 1000,
        ns: 0,
        title: 'Page B',
        timestamp: '2022-01-02T00:00:00Z',
      },
      {
        userid: 1,
        user: 'User',
        pageid: 1,
        revid: 1001,
        parentid: 999,
        ns: 0,
        title: 'PageA',
        timestamp: '2022-01-01T00:00:00Z',
      },
    ],
  },
};

export const secondPage = {
  batchcomplete: true,
  query: {
    usercontribs: [
      {
        userid: 1,
        user: 'User',
        pageid: 3,
        revid: 900,
        parentid: 899,
        ns: 0,
        title: 'Reps/Peers & Mentors?',
        timestamp: '2021-12-01T00:00:00Z',
      },
    ],
  },
};
