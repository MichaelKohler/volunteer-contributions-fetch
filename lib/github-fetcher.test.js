import test from 'ava';
import { searchCommits } from './github-fetcher.js';

test('should throw without token', async (t) => {
  await t.throwsAsync(() => searchCommits());
});
