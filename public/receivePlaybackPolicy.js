(function installReceivePlaybackPolicy(root, factory) {
  const policy = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = policy;
  }
  if (root) {
    root.TalktomeReceivePlaybackPolicy = policy;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createReceivePlaybackPolicy() {
  function shouldUseAdaptiveReceivePlayback({ isiOS = false } = {}) {
    // iOS still needs the visible Web Audio / hidden media-element handoff.
    // Desktop Safari can keep a normal media element alive in the background
    // and must not recreate it after the page is already hidden.
    return Boolean(isiOS);
  }

  function shouldUsePlainReceivePlayback({
    isiOS = false,
    isSafariBrowser = false,
    visibilityState = "visible",
  } = {}) {
    if (isSafariBrowser && !isiOS) return true;
    return Boolean(isiOS && visibilityState === "hidden");
  }

  return {
    shouldUseAdaptiveReceivePlayback,
    shouldUsePlainReceivePlayback,
  };
});
