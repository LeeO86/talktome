const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldUseAdaptiveReceivePlayback,
  shouldUsePlainReceivePlayback,
} = require("./public/receivePlaybackPolicy");

test("desktop Safari keeps one plain receive path across tab changes", () => {
  assert.equal(shouldUseAdaptiveReceivePlayback({ isiOS: false }), false);
  assert.equal(shouldUsePlainReceivePlayback({
    isiOS: false,
    isSafariBrowser: true,
    visibilityState: "visible",
  }), true);
  assert.equal(shouldUsePlainReceivePlayback({
    isiOS: false,
    isSafariBrowser: true,
    visibilityState: "hidden",
  }), true);
});

test("iOS retains its visibility-dependent receive fallback", () => {
  assert.equal(shouldUseAdaptiveReceivePlayback({ isiOS: true }), true);
  assert.equal(shouldUsePlainReceivePlayback({
    isiOS: true,
    isSafariBrowser: true,
    visibilityState: "visible",
  }), false);
  assert.equal(shouldUsePlainReceivePlayback({
    isiOS: true,
    isSafariBrowser: true,
    visibilityState: "hidden",
  }), true);
});

test("other desktop browsers keep their normal receive path", () => {
  assert.equal(shouldUseAdaptiveReceivePlayback({ isiOS: false }), false);
  assert.equal(shouldUsePlainReceivePlayback({
    isiOS: false,
    isSafariBrowser: false,
    visibilityState: "hidden",
  }), false);
});
