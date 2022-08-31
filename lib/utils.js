module.exports = {
  getPadded,
};

function getPadded(number) {
  if (number < 10) {
    return `0${number}`;
  }

  return `${number}`;
}
