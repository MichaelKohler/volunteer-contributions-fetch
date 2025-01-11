import test from 'ava';

import { getPadded } from './utils.js';

test.serial('should pad number below 10', (t) => {
  const padded = getPadded(8);
  t.is(padded, '08');
});

test.serial('should not pad 10', (t) => {
  const padded = getPadded(10);
  t.is(padded, '10');
});

test.serial('should not pad 11', (t) => {
  const padded = getPadded(11);
  t.is(padded, '11');
});
