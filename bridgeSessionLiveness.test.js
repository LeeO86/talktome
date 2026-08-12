const test = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldCloseBridgeSessionAfterEventStreamClose,
} = require("./bridgeSessionLiveness");

test("closes a live bridge session after its final native event stream disconnects", () => {
  assert.equal(shouldCloseBridgeSessionAfterEventStreamClose({
    closed: false,
    eventStreams: new Set(),
  }), true);
});

test("keeps a bridge session while another event stream is still connected", () => {
  assert.equal(shouldCloseBridgeSessionAfterEventStreamClose({
    closed: false,
    eventStreams: new Set([{}]),
  }), false);
});

test("does not close an already closed bridge session again", () => {
  assert.equal(shouldCloseBridgeSessionAfterEventStreamClose({
    closed: true,
    eventStreams: new Set(),
  }), false);
});
