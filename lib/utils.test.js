const test = require('ava');

const utils = require('./utils');

test.serial('should pad number below 10', (t) => {
  const padded = utils.getPadded(8);
  t.is(padded, '08');
});

test.serial('should not pad 10', (t) => {
  const padded = utils.getPadded(10);
  t.is(padded, '10');
});

test.serial('should not pad 11', (t) => {
  const padded = utils.getPadded(11);
  t.is(padded, '11');
});
