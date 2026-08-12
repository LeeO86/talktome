(function installTargetIdentity(root, factory) {
  const identity = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = identity;
  }
  if (root) {
    root.TalktomeTargetIdentity = identity;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTargetIdentity() {
  function normalizeIdentity(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function resolveRenderedUserTargetKey({ userId = null, peerId = null, renderedTargets = [] } = {}) {
    const stableUserId = normalizeIdentity(userId);
    const currentPeerId = normalizeIdentity(peerId);
    const targets = Array.isArray(renderedTargets) ? renderedTargets : [];

    const renderedTarget = (
      stableUserId
        ? targets.find((target) => normalizeIdentity(target?.userId) === stableUserId)
        : null
    ) || (
      currentPeerId
        ? targets.find((target) => normalizeIdentity(target?.socketId) === currentPeerId)
        : null
    );
    const renderedKey = normalizeIdentity(renderedTarget?.key);
    if (renderedKey) return renderedKey;
    if (currentPeerId) return `user-${currentPeerId}`;
    return stableUserId ? `user-${stableUserId}` : null;
  }

  return { resolveRenderedUserTargetKey };
});
