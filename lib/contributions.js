// Existing contributions are read from JSON and therefore have a string as
// createdAt, while freshly fetched ones have a Date. Normalize before comparing.
// All fields a contribution carries are part of the key: some sources only
// provide day precision (e.g. community portal events at midnight), so
// distinct entries can share source, type, link and createdAt and only differ
// by description. JSON.stringify avoids ambiguity when a field contains the
// separator.
function getContributionKey(contribution) {
  return JSON.stringify([
    contribution.source,
    contribution.type,
    contribution.link,
    new Date(contribution.createdAt).getTime(),
    contribution.description,
  ]);
}

// Invalid dates would make the comparator return NaN, which leaves the sort
// order undefined. Treat them as the oldest possible date instead.
function getSortTime(contribution) {
  const time = new Date(contribution.createdAt).getTime();
  return Number.isNaN(time) ? -Infinity : time;
}

// Sorts newest first, with contributions without a valid date at the end.
// Ties keep their original order, as Array.prototype.sort is stable.
export const compareContributions = (a, b) => {
  const timeA = getSortTime(a);
  const timeB = getSortTime(b);
  if (timeA === timeB) {
    return 0;
  }

  return timeB > timeA ? 1 : -1;
};

// Keeps the first occurrence of each contribution.
export const ensureUniqueContributions = (allContributions) => {
  const seen = new Set();
  return allContributions.filter((contribution) => {
    const key = getContributionKey(contribution);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

// Sort object keys so that the serialization does not depend on key order.
// Dates are already converted to ISO strings by their toJSON at this point.
function sortKeys(key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    );
  }

  return value;
}

// Compares the stored content of two contribution lists, ignoring the order
// of the entries as well as the key order within each entry.
export const haveSameContributions = (contributionsA, contributionsB) => {
  if (contributionsA.length !== contributionsB.length) {
    return false;
  }

  const counts = new Map();
  for (const contribution of contributionsA) {
    const serialized = JSON.stringify(contribution, sortKeys);
    counts.set(serialized, (counts.get(serialized) || 0) + 1);
  }

  for (const contribution of contributionsB) {
    const serialized = JSON.stringify(contribution, sortKeys);
    const count = counts.get(serialized);
    if (!count) {
      return false;
    }

    counts.set(serialized, count - 1);
  }

  return true;
};
