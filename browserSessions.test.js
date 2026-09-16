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

test("restores a persisted browser session after recreating the store", () => {
  const records = new Map();
  const persistence = {
    read: (token) => records.get(token) || null,
    write: (token, session) => records.set(token, { ...session }),
    remove: (token) => records.delete(token),
    purgeExpired: (currentTime) => {
      for (const [token, session] of records) {
        if (session.expiresAt <= currentTime) records.delete(token);
      }
    },
  };
  const firstStore = createBrowserSessionStore({
    createToken: () => "restart-token",
    persistence,
  });
  firstStore.create({ kind: "user", userId: 17, name: "Adi" });

  const restartedStore = createBrowserSessionStore({ persistence });
  assert.equal(restartedStore.get("restart-token").session.userId, 17);
  assert.equal(restartedStore.revoke("restart-token"), true);
  assert.equal(firstStore.get("restart-token"), null);
});
