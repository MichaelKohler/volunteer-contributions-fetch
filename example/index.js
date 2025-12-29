import { fetchAll } from '../lib/fetch.js';

const config = {
  github: {
    allowPrivate: true,
    enabled: true,
    username: 'MichaelKohler',
    stopDate: '2025-01-01',
    filter: 'mozilla',
    types: {
      commit: 'GitHub Commit',
      privateCommit: 'Commit in private repository',
      createdPR: 'Created PR',
      createdIssue: 'Created Issue Report',
      commentedPR: 'Commented on a Pull Request',
      approvedPR: 'Approved a Pull Request',
      changesRequestedPR: 'Requested changes on a Pull Request',
      reviewedPR: 'Reviewed a Pull Request',
    },
  },
};

const existingContributions = [
  {
    createdAt: '2008-03-10T00:21:39.000Z',
    description: 'Fix sorting and labels for the bookmark library restore menu',
    link: 'https://bugzilla.mozilla.org/show_bug.cgi?id=421834#c0',
    type: 'Created a Bug Report',
    source: 'bugzilla-created',
  },
];

const contributions = await fetchAll(config, existingContributions);

console.log(contributions);
