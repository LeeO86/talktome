const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserSessionStore } = require("./browserSessions");

test("creates, resolves and revokes browser sessions", () => {
  const store = createBrowserSessionStore({ createToken: () => "session-token" });
  const created = store.create({ kind: "user", userId: 17, name: "Adi" });

  assert.equal(created.token, "session-token");
  assert.equal(store.get("session-token").session.userId, 17);
  assert.equal(store.revoke("session-token"), true);
  assert.equal(store.get("session-token"), null);
});

test("expires browser sessions", () => {
  let currentTime = 1_000;
  const store = createBrowserSessionStore({
    ttlMs: 500,
    now: () => currentTime,
    createToken: () => "expiring-token",
  });
  store.create({ kind: "feed", feedId: 4, name: "Program" });
  currentTime = 1_500;

  assert.equal(store.get("expiring-token"), null);
});
