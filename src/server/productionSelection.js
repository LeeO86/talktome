function resolveActiveProductionSelection({
  requestedValue = null,
  multipleProductionsEnabled = false,
  primaryProductionId = null,
  memberships = [],
} = {}) {
  const available = Array.isArray(memberships)
    ? memberships.filter((production) => Number.isInteger(Number(production?.id)))
    : [];
  if (available.length === 0) {
    throw new Error('This user is not assigned to a production');
  }

  const primaryId = Number(primaryProductionId);
  const fallback = available.find((production) => Number(production.id) === primaryId)
    || available[0];
  const hasRequestedProduction = !(
    requestedValue === null
    || requestedValue === undefined
    || requestedValue === ''
    || requestedValue === 'default'
  );
  const productionId = multipleProductionsEnabled
    ? Number(hasRequestedProduction ? requestedValue : fallback.id)
    : primaryId;

  if (!Number.isInteger(productionId) || productionId <= 0) {
    throw new Error('Production not found');
  }

  return { productionId, hasRequestedProduction };
}

module.exports = { resolveActiveProductionSelection };
