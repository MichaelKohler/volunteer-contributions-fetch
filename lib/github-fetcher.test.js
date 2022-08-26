const test = require('ava');
const fetcher = require('./github-fetcher');

test('should throw without token', async (t) => {
  await t.throwsAsync(() => fetcher.searchCommits());
});
