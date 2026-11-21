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
