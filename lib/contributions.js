// Existing contributions are read from JSON and therefore have a string as
// createdAt, while freshly fetched ones have a Date. Normalize before comparing.
function getContributionKey(contribution) {
  return [
    contribution.source,
    contribution.type,
    contribution.link,
    new Date(contribution.createdAt).getTime(),
  ].join('|');
}

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
