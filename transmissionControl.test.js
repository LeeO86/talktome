const test = require("node:test");
const assert = require("node:assert/strict");

const { stopPeerTransmission } = require("./transmissionControl");

test("clears the peer talk state and pauses active producers", async () => {
  const peer = {
    pttTalking: true,
    pttStartedAt: 123,
    activeTalkTargets: [{ type: "conference", id: 7 }],
  };
  const producer = {
    paused: false,
    closed: false,
    async pause() { this.paused = true; },
  };

  const result = await stopPeerTransmission(peer, [producer]);

  assert.equal(result.hadActiveTransmission, true);
  assert.equal(result.pausedProducerCount, 1);
  assert.deepEqual(peer.activeTalkTargets, []);
  assert.equal(peer.pttTalking, false);
  assert.equal(peer.pttStartedAt, 0);
});

test("falls back to closing a producer when pausing fails", async () => {
  const peer = { pttTalking: false, activeTalkTargets: [] };
  const producer = {
    paused: false,
    closed: false,
    async pause() { throw new Error("pause failed"); },
    close() { this.closed = true; },
  };

  const result = await stopPeerTransmission(peer, [producer]);

  assert.equal(result.closedProducerCount, 1);
  assert.equal(result.errors.length, 0);
});

test("is idempotent when the user is no longer transmitting", async () => {
  const peer = { pttTalking: false, pttStartedAt: 0, activeTalkTargets: [] };
  const producer = { paused: true, closed: false, async pause() {} };

  const result = await stopPeerTransmission(peer, [producer]);

  assert.equal(result.hadActiveTransmission, false);
  assert.equal(result.pausedProducerCount, 0);
});
