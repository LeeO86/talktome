const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveRenderedUserTargetKey } = require("./public/targetIdentity");

test("resolves an incoming speaker through the stable user id", () => {
  assert.equal(resolveRenderedUserTargetKey({
    userId: 7,
    peerId: "new-bridge-session",
    renderedTargets: [{
      key: "user-current-bridge-session",
      userId: 7,
      socketId: "current-bridge-session",
    }],
  }), "user-current-bridge-session");
});

test("prefers the rendered target over a stale producer peer id", () => {
  assert.equal(resolveRenderedUserTargetKey({
    userId: 7,
    peerId: "stale-bridge-session",
    renderedTargets: [{
      key: "user-current-bridge-session",
      userId: 7,
      socketId: "current-bridge-session",
    }],
  }), "user-current-bridge-session");
});

test("falls back deterministically before the target list is rendered", () => {
  assert.equal(resolveRenderedUserTargetKey({ userId: 7 }), "user-7");
  assert.equal(resolveRenderedUserTargetKey({ peerId: "peer-1" }), "user-peer-1");
});
