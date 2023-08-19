const ensureUniqueContributions = (allContributions) => {
  const uniqueContributions = allContributions.reduce((acc, contribution) => {
    const existingContribution = acc.find(
      (uniqueContribution) =>
        uniqueContribution.source === contribution.source &&
        uniqueContribution.type === contribution.type &&
        uniqueContribution.createdAt.getTime() ===
          contribution.createdAt.getTime()
    );

    if (!existingContribution) {
      acc.push(contribution);
    }

    return acc;
  }, []);

  return uniqueContributions;
};

module.exports = {
  ensureUniqueContributions,
};
